import { NextRequest, NextResponse } from "next/server";
import * as azdev from "azure-devops-node-api";
import { WorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import db from "@/lib/db";
import type {
  Settings,
  AzureDevOpsSettings,
  AzureDevOpsWorkItem,
} from "@/types";
import { getRequestProjectId, getRequestUserId } from "@/lib/user-context";

export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const searchParams = request.nextUrl.searchParams;
    const releaseIdParam = searchParams.get("releaseId");
    const releaseId = releaseIdParam ? Number(releaseIdParam) : null;
    const specificIdParam = searchParams.get("specificId");
    const specificId = specificIdParam ? Number(specificIdParam) : null;

    if (releaseIdParam && Number.isNaN(releaseId)) {
      return NextResponse.json(
        { error: "Release id must be a number" },
        { status: 400 }
      );
    }

    if (specificIdParam && Number.isNaN(specificId)) {
      return NextResponse.json(
        { error: "Specific id must be a number" },
        { status: 400 }
      );
    }

    const settingRow = db
      .prepare("SELECT * FROM settings WHERE key = ? AND user_id = ? AND project_id = ?")
      .get("azure_devops", userId, projectId) as Settings | undefined;

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

    let wiqlQuery = `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.WorkItemType] = 'User Story'
        AND [System.State] <> 'Closed'
        AND [System.State] <> 'Removed'
        AND [System.State] <> 'Released'
        AND [System.State] <> 'Resolved'
      ORDER BY [System.ChangedDate] DESC
    `;

    // If specific ID is provided, include it regardless of state
    if (specificId) {
      wiqlQuery = `
        SELECT [System.Id]
        FROM WorkItems
        WHERE (
          (
            [System.WorkItemType] = 'User Story'
            AND [System.State] <> 'Closed'
            AND [System.State] <> 'Removed'
            AND [System.State] <> 'Released'
            AND [System.State] <> 'Resolved'
          )
          OR [System.Id] = ${specificId}
        )
        ORDER BY [System.ChangedDate] DESC
      `;
    }

    const wiql = { query: wiqlQuery };

    const queryResult = await witApi.queryByWiql(wiql, {
      project: settings.project,
    });
    const workItemIds =
      queryResult?.workItems?.map((wi) => wi.id!).filter(Boolean) || [];

    if (workItemIds.length === 0) {
      return NextResponse.json({ workItems: [] });
    }

    // Fetch work items in batches to avoid request header size limits
    const batchSize = 200;
    const allWorkItems = [];
    
    for (let i = 0; i < workItemIds.length; i += batchSize) {
      const batch = workItemIds.slice(i, i + batchSize);
      const batchItems = await witApi.getWorkItems(
        batch,
        undefined,
        undefined,
        undefined,
        undefined
      );
      if (batchItems) {
        allWorkItems.push(...batchItems);
      }
    }

    const workItems = allWorkItems;

    const importedIds = new Set<number>();

    if (releaseId) {
      const importedRows = db
        .prepare(
          `
          SELECT external_id
          FROM release_work_items
          WHERE release_id = ?
            AND user_id = ?
            AND project_id = ?
            AND external_source = 'azure_devops'
            AND external_id IS NOT NULL
        `
        )
        .all(releaseId, userId, projectId) as Array<{ external_id: string | number | null }>;

      importedRows.forEach((row) => {
        const numericId = Number(row.external_id);
        if (!Number.isNaN(numericId)) {
          importedIds.add(numericId);
        }
      });
    }

    const result: AzureDevOpsWorkItem[] = (workItems || [])
      .filter((wi) => wi.id && wi.fields)
      .map((wi) => {
        const tagsString = wi.fields?.["System.Tags"] as string | undefined;
        const tags = tagsString ? tagsString.split(';').map(t => t.trim()).filter(Boolean) : [];
        return {
          id: wi.id!,
          title: wi.fields?.["System.Title"] || "Untitled",
          type: wi.fields?.["System.WorkItemType"] || "Unknown",
          state: wi.fields?.["System.State"] || "Unknown",
          tags: tags.length > 0 ? tags : undefined,
        };
      })
      .filter((item) => !importedIds.has(item.id));

    return NextResponse.json({ workItems: result });
  } catch (error) {
    console.error("Error fetching Azure DevOps user stories:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch user stories",
      },
      { status: 500 }
    );
  }
}
