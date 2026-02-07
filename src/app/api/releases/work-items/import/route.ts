import { NextRequest, NextResponse } from "next/server";
import * as azdev from "azure-devops-node-api";
import { WorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import db from "@/lib/db";
import type { ReleaseWorkItem, Settings, AzureDevOpsSettings } from "@/types";

interface ImportRequest {
  releaseId?: number;
  workItemIds?: number[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImportRequest;
    const releaseId = body.releaseId;
    const workItemIds = body.workItemIds ?? [];

    if (!releaseId) {
      return NextResponse.json(
        { error: "Release id is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(workItemIds) || workItemIds.length === 0) {
      return NextResponse.json(
        { error: "Work item ids are required" },
        { status: 400 }
      );
    }

    const release = db
      .prepare("SELECT id FROM releases WHERE id = ?")
      .get(releaseId) as { id: number } | undefined;

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const settingRow = db
      .prepare("SELECT * FROM settings WHERE key = ?")
      .get("azure_devops") as Settings | undefined;

    if (!settingRow) {
      return NextResponse.json(
        {
          error:
            "Azure DevOps settings not configured. Please configure in Settings.",
        },
        { status: 400 }
      );
    }

    let settings: AzureDevOpsSettings;
    try {
      settings = JSON.parse(settingRow.value) as AzureDevOpsSettings;
    } catch {
      return NextResponse.json(
        { error: "Invalid Azure DevOps settings format" },
        { status: 400 }
      );
    }

    if (!settings.organization || !settings.project || !settings.pat) {
      return NextResponse.json(
        {
          error:
            "Azure DevOps settings incomplete. Please check organization, project, and PAT.",
        },
        { status: 400 }
      );
    }

    const orgUrl = `https://dev.azure.com/${settings.organization}`;
    const authHandler = azdev.getPersonalAccessTokenHandler(settings.pat);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const witApi: WorkItemTrackingApi =
      await connection.getWorkItemTrackingApi();

    const workItems = await witApi.getWorkItems(
      workItemIds,
      undefined,
      undefined,
      undefined,
      undefined
    );

    const imported: ReleaseWorkItem[] = [];
    const skipped: Array<{ id: number; reason: string }> = [];

    for (const workItem of workItems || []) {
      if (!workItem.id || !workItem.fields) {
        continue;
      }

      const existing = db
        .prepare(
          "SELECT id FROM release_work_items WHERE release_id = ? AND external_id = ? AND external_source = 'azure_devops'"
        )
        .get(releaseId, workItem.id) as { id: number } | undefined;

      if (existing) {
        skipped.push({ id: workItem.id, reason: "Already added" });
        continue;
      }

      const title =
        (workItem.fields["System.Title"] as string) ||
        `Work Item ${workItem.id}`;
      const workItemType =
        (workItem.fields["System.WorkItemType"] as string) || "User Story";
      const state = (workItem.fields["System.State"] as string) || null;
      const tagsString = (workItem.fields["System.Tags"] as string) || null;

      // Get the max display_order for this release
      const maxOrderRow = db
        .prepare("SELECT MAX(display_order) as max_order FROM release_work_items WHERE release_id = ?")
        .get(releaseId) as { max_order: number | null } | undefined;
      const nextOrder = (maxOrderRow?.max_order ?? -1) + 1;

      const stmt = db.prepare(
        `
        INSERT INTO release_work_items
          (release_id, title, external_id, external_source, work_item_type, state, tags, display_order)
        VALUES
          (?, ?, ?, 'azure_devops', ?, ?, ?, ?)
      `
      );

      const result = stmt.run(releaseId, title, workItem.id, workItemType, state, tagsString, nextOrder);
      const newItem = db
        .prepare("SELECT * FROM release_work_items WHERE id = ?")
        .get(result.lastInsertRowid) as ReleaseWorkItem;
      imported.push(newItem);
    }

    return NextResponse.json({
      imported: imported.length,
      skipped: skipped.length,
      items: imported,
      skippedDetails: skipped,
    });
  } catch (error) {
    console.error("Release work item import error:", error);
    return NextResponse.json(
      {
        error: "Failed to import user stories",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
