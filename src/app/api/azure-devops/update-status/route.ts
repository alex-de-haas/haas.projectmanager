import { NextRequest, NextResponse } from 'next/server';
import * as azdev from 'azure-devops-node-api';
import { WorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { JsonPatchDocument, JsonPatchOperation, Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import db from '@/lib/db';
import type { Settings, AzureDevOpsSettings, Task } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, status } = body;

    if (!taskId || !status) {
      return NextResponse.json(
        { error: 'Task ID and status are required' },
        { status: 400 }
      );
    }

    // Get the task from database
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Update local status first
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, taskId);

    // If task is linked to Azure DevOps, update it there too
    if (task.external_source === 'azure_devops' && task.external_id) {
      try {
        // Get Azure DevOps settings
        const settingRow = db.prepare('SELECT * FROM settings WHERE key = ?').get('azure_devops') as Settings | undefined;
        
        if (!settingRow) {
          return NextResponse.json({
            success: true,
            message: 'Status updated locally. Azure DevOps settings not configured.',
            localOnly: true
          });
        }

        let settings: AzureDevOpsSettings;
        try {
          settings = JSON.parse(settingRow.value) as AzureDevOpsSettings;
        } catch {
          return NextResponse.json({
            success: true,
            message: 'Status updated locally. Invalid Azure DevOps settings.',
            localOnly: true
          });
        }

        if (!settings.organization || !settings.project || !settings.pat) {
          return NextResponse.json({
            success: true,
            message: 'Status updated locally. Azure DevOps settings incomplete.',
            localOnly: true
          });
        }

        // Create Azure DevOps connection
        const orgUrl = `https://dev.azure.com/${settings.organization}`;
        const authHandler = azdev.getPersonalAccessTokenHandler(settings.pat);
        const connection = new azdev.WebApi(orgUrl, authHandler);

        const witApi: WorkItemTrackingApi = await connection.getWorkItemTrackingApi();

        const workItemId = parseInt(task.external_id);
        if (isNaN(workItemId)) {
          return NextResponse.json({
            success: true,
            message: 'Status updated locally. Invalid work item ID.',
            localOnly: true
          });
        }

        // Create patch document to update the status
        const patchDocument: JsonPatchDocument = [
          {
            op: Operation.Add,
            path: '/fields/System.State',
            value: status
          } as JsonPatchOperation
        ];

        // Update the work item in Azure DevOps
        await witApi.updateWorkItem(
          undefined,
          patchDocument,
          workItemId,
          settings.project
        );

        return NextResponse.json({
          success: true,
          message: 'Status updated locally and synced with Azure DevOps',
          synced: true
        });

      } catch (azureError) {
        console.error('Azure DevOps update error:', azureError);
        const errorMessage = azureError instanceof Error ? azureError.message : 'Unknown error';
        
        return NextResponse.json({
          success: true,
          message: `Status updated locally. Failed to sync with Azure DevOps: ${errorMessage}`,
          localOnly: true,
          azureError: errorMessage
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Status updated successfully',
      localOnly: !task.external_source
    });

  } catch (error) {
    console.error('Status update error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to update status', details: errorMessage },
      { status: 500 }
    );
  }
}
