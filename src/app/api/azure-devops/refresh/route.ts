export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import * as azdev from 'azure-devops-node-api';
import { WorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import db from '@/lib/db';
import type { Settings, AzureDevOpsSettings, Task } from '@/types';
import { getRequestProjectId, getRequestUserId } from '@/lib/user-context';

interface ReleaseWorkItemSnapshot {
  title: string;
  work_item_type: string | null;
  state: string | null;
  tags: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    // Get Azure DevOps settings
    const settingRow = db
      .prepare('SELECT id, key, value, created_at, updated_at FROM project_settings WHERE key = ? AND project_id = ?')
      .get('azure_devops', projectId) as Settings | undefined;
    
    if (!settingRow) {
      return NextResponse.json(
        { error: 'Azure DevOps settings not configured. Please configure in Settings.' },
        { status: 400 }
      );
    }

    let settings: AzureDevOpsSettings;
    try {
      settings = JSON.parse(settingRow.value) as AzureDevOpsSettings;
    } catch {
      return NextResponse.json(
        { error: 'Invalid Azure DevOps settings format' },
        { status: 400 }
      );
    }

    if (!settings.organization || !settings.project || !settings.pat) {
      return NextResponse.json(
        { error: 'Azure DevOps settings incomplete. Please check organization, project, and PAT.' },
        { status: 400 }
      );
    }

    // Get all tasks imported from Azure DevOps
    const importedTasks = db.prepare(
      'SELECT * FROM tasks WHERE external_source = ? AND user_id = ? AND project_id = ? AND external_id IS NOT NULL'
    ).all('azure_devops', userId, projectId) as Task[];

    // Get all release planner work items imported from Azure DevOps
    const importedReleaseWorkItems = db.prepare(
      `SELECT external_id, title, work_item_type, state, tags
       FROM release_work_items
       WHERE external_source = ? AND project_id = ? AND external_id IS NOT NULL`
    ).all('azure_devops', projectId) as Array<{
      external_id: string;
      title: string;
      work_item_type: string | null;
      state: string | null;
      tags: string | null;
    }>;

    if (importedTasks.length === 0 && importedReleaseWorkItems.length === 0) {
      return NextResponse.json({ 
        updated: 0, 
        skipped: 0, 
        message: 'No imported Azure DevOps items found to refresh' 
      });
    }

    // Create Azure DevOps connection
    const orgUrl = `https://dev.azure.com/${settings.organization}`;
    const authHandler = azdev.getPersonalAccessTokenHandler(settings.pat);
    const connection = new azdev.WebApi(orgUrl, authHandler);

    const witApi: WorkItemTrackingApi = await connection.getWorkItemTrackingApi();

    // Extract unique work item IDs from tasks + release planner user stories
    const workItemIdSet = new Set<number>();
    for (const task of importedTasks) {
      const id = task.external_id ? parseInt(task.external_id) : NaN;
      if (!isNaN(id)) workItemIdSet.add(id);
    }
    for (const item of importedReleaseWorkItems) {
      const id = parseInt(item.external_id);
      if (!isNaN(id)) workItemIdSet.add(id);
    }
    const workItemIds = Array.from(workItemIdSet);

    if (workItemIds.length === 0) {
      return NextResponse.json({ 
        updated: 0, 
        skipped: 0, 
        message: 'No valid work item IDs found' 
      });
    }

    const MAX_BATCH_SIZE = 200;
    const workItems: any[] = [];

    for (let i = 0; i < workItemIds.length; i += MAX_BATCH_SIZE) {
      const batchIds = workItemIds.slice(i, i + MAX_BATCH_SIZE);
      const batchItems = await witApi.getWorkItems(
        batchIds,
        undefined,
        undefined,
        undefined,
        undefined
      );

      if (batchItems?.length) {
        workItems.push(...batchItems);
      }
    }

    const updated: Array<{ id: number; title: string; status: string }> = [];
    const skipped: Array<{ id: number; reason: string }> = [];
    const updateTasksStmt = db.prepare(`
      UPDATE tasks 
      SET title = ?, type = ?, status = ?, completed_at = ?
      WHERE id = ? AND user_id = ? AND project_id = ?
    `);
    const updateReleaseWorkItemsStmt = db.prepare(`
      UPDATE release_work_items
      SET title = ?, work_item_type = ?, state = ?, tags = ?
      WHERE external_source = 'azure_devops' AND CAST(external_id AS INTEGER) = ? AND project_id = ?
    `);

    const importedTasksByExternalId = new Map<number, Task>();
    for (const task of importedTasks) {
      const externalId = task.external_id ? parseInt(task.external_id) : NaN;
      if (!isNaN(externalId)) {
        importedTasksByExternalId.set(externalId, task);
      }
    }
    const importedReleaseWorkItemsByExternalId = new Map<number, ReleaseWorkItemSnapshot[]>();
    for (const item of importedReleaseWorkItems) {
      const externalId = parseInt(item.external_id);
      if (isNaN(externalId)) {
        continue;
      }
      const existing = importedReleaseWorkItemsByExternalId.get(externalId) ?? [];
      existing.push({
        title: item.title,
        work_item_type: item.work_item_type,
        state: item.state,
        tags: item.tags,
      });
      importedReleaseWorkItemsByExternalId.set(externalId, existing);
    }

    for (const workItem of workItems) {
      if (!workItem.id || !workItem.fields) {
        continue;
      }

      const title = workItem.fields['System.Title'] as string || `Work Item ${workItem.id}`;
      const releaseWorkItemType = workItem.fields['System.WorkItemType'] as string || 'Task';
      const workItemType = releaseWorkItemType.toLowerCase();
      const status = workItem.fields['System.State'] as string || null;
      const tags = workItem.fields['System.Tags'] as string || null;
      const closedDate = workItem.fields['Microsoft.VSTS.Common.ClosedDate'] as string || 
                        workItem.fields['Microsoft.VSTS.Common.ResolvedDate'] as string || 
                        workItem.fields['System.ClosedDate'] as string || 
                        null;

      // Map Azure DevOps work item types to our task types
      let taskType: 'task' | 'bug' = 'task';
      if (workItemType === 'bug') {
        taskType = 'bug';
      }

      // Find the corresponding task in our database
      const task = importedTasksByExternalId.get(workItem.id);
      const releaseItems = importedReleaseWorkItemsByExternalId.get(workItem.id) ?? [];
      let didUpdate = false;

      if (task) {
        // Format completed_at for comparison (convert both to ISO string format if they exist)
        const taskCompletedAt = task.completed_at ? new Date(task.completed_at).toISOString() : null;
        const workItemCompletedAt = closedDate ? new Date(closedDate).toISOString() : null;

        const hasTaskChanges =
          task.title !== title ||
          task.type !== taskType ||
          task.status !== status ||
          taskCompletedAt !== workItemCompletedAt;

        if (hasTaskChanges) {
          updateTasksStmt.run(title, taskType, status, closedDate, task.id, userId, projectId);
          didUpdate = true;
        }
      }

      const hasReleaseWorkItemChanges = releaseItems.some((item) =>
        item.title !== title ||
        item.work_item_type !== releaseWorkItemType ||
        item.state !== status ||
        item.tags !== tags
      );
      if (hasReleaseWorkItemChanges) {
        updateReleaseWorkItemsStmt.run(
          title,
          releaseWorkItemType,
          status,
          tags,
          workItem.id,
          projectId
        );
        didUpdate = true;
      }

      if (didUpdate) {
        updated.push({ id: workItem.id, title, status: status || 'N/A' });
      } else {
        skipped.push({ id: workItem.id, reason: 'No changes detected' });
      }
    }

    return NextResponse.json({
      updated: updated.length,
      skipped: skipped.length,
      updatedTasks: updated,
      skippedDetails: skipped
    });

  } catch (error) {
    console.error('Azure DevOps refresh error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to refresh from Azure DevOps', details: errorMessage },
      { status: 500 }
    );
  }
}
