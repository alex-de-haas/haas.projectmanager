import { NextRequest, NextResponse } from "next/server";
import * as azdev from "azure-devops-node-api";
import { WorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import db from "@/lib/db";
import type { Settings, AzureDevOpsSettings } from "@/types";
import { getRequestProjectId, getRequestUserId } from "@/lib/user-context";

interface ChildWorkItem {
  id: number;
  parentId: number;
  title: string;
  type: string;
  state: string;
  assignedTo?: string;
}

const parseSettings = (value: string): AzureDevOpsSettings | null => {
  try {
    return JSON.parse(value) as AzureDevOpsSettings;
  } catch {
    return null;
  }
};

const getWitApi = async (
  projectId: number
): Promise<{ witApi: WorkItemTrackingApi; project: string } | null> => {
  const settingRow = db
    .prepare(
      "SELECT id, key, value, created_at, updated_at FROM project_settings WHERE key = ? AND project_id = ?"
    )
    .get("azure_devops", projectId) as Settings | undefined;

  if (!settingRow) return null;

  const settings = parseSettings(settingRow.value);
  if (!settings?.organization || !settings.project || !settings.pat) return null;

  const orgUrl = `https://dev.azure.com/${settings.organization}`;
  const authHandler = azdev.getPersonalAccessTokenHandler(settings.pat);
  const connection = new azdev.WebApi(orgUrl, authHandler);
  const witApi = await connection.getWorkItemTrackingApi();
  return { witApi, project: settings.project };
};

const parseParentId = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const fetchChildrenForParentIds = async (
  witApi: WorkItemTrackingApi,
  project: string,
  parentIds: number[]
): Promise<ChildWorkItem[]> => {
  if (parentIds.length === 0) return [];

  const wiql = {
    query: `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.Parent] IN (${parentIds.join(",")})
        AND ([System.WorkItemType] = 'Task' OR [System.WorkItemType] = 'Bug')
        AND [System.State] <> 'Removed'
      ORDER BY [System.ChangedDate] DESC
    `,
  };

  const queryResult = await witApi.queryByWiql(wiql, { project });
  const ids = queryResult?.workItems?.map((wi) => wi.id!).filter(Boolean) ?? [];
  if (ids.length === 0) return [];

  const workItems = await witApi.getWorkItems(
    ids,
    [
      "System.Id",
      "System.Parent",
      "System.Title",
      "System.WorkItemType",
      "System.State",
      "System.AssignedTo",
    ],
    undefined,
    undefined,
    undefined
  );

  return (workItems ?? [])
    .filter((wi) => wi.id && wi.fields)
    .map((wi) => {
      const assignedField = wi.fields?.["System.AssignedTo"] as
        | string
        | { displayName?: string; uniqueName?: string }
        | undefined;
      const assignedTo =
        typeof assignedField === "string"
          ? assignedField
          : assignedField?.displayName || assignedField?.uniqueName;

      return {
        id: wi.id!,
        parentId: Number(wi.fields?.["System.Parent"] ?? 0),
        title: String(wi.fields?.["System.Title"] ?? "Untitled"),
        type: String(wi.fields?.["System.WorkItemType"] ?? "Unknown"),
        state: String(wi.fields?.["System.State"] ?? "Unknown"),
        assignedTo,
      };
    })
    .filter((item) => item.parentId > 0);
};

export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const parentId = parseParentId(request.nextUrl.searchParams.get("parentId"));

    if (!parentId) {
      return NextResponse.json({ error: "Valid parentId is required" }, { status: 400 });
    }

    const context = await getWitApi(projectId);
    if (!context) {
      return NextResponse.json(
        { error: "Azure DevOps settings not configured or incomplete." },
        { status: 400 }
      );
    }

    const items = await fetchChildrenForParentIds(context.witApi, context.project, [parentId]);
    const filtered = items.filter((item) => item.parentId === parentId);

    const counts = filtered.reduce(
      (acc, item) => {
        const itemType = item.type.toLowerCase();
        if (itemType === "task") acc.tasks += 1;
        if (itemType === "bug") acc.bugs += 1;
        return acc;
      },
      { tasks: 0, bugs: 0 }
    );

    return NextResponse.json({ parentId, counts, items: filtered });
  } catch (error) {
    console.error("Azure DevOps child work item query error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch child work items from Azure DevOps",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const body = await request.json();
    const rawParentIds = Array.isArray(body?.parentIds) ? body.parentIds : [];
    const parentIds = Array.from(
      new Set(
        rawParentIds
          .map((value: unknown) => parseParentId(value))
          .filter((value: number | null): value is number => value !== null)
      )
    );

    if (parentIds.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    const context = await getWitApi(projectId);
    if (!context) {
      return NextResponse.json(
        { error: "Azure DevOps settings not configured or incomplete." },
        { status: 400 }
      );
    }

    const batchSize = 100;
    const allItems: ChildWorkItem[] = [];
    for (let i = 0; i < parentIds.length; i += batchSize) {
      const batch = parentIds.slice(i, i + batchSize);
      const items = await fetchChildrenForParentIds(context.witApi, context.project, batch);
      allItems.push(...items);
    }

    const counts: Record<string, { tasks: number; bugs: number }> = {};
    for (const parentId of parentIds) {
      counts[String(parentId)] = { tasks: 0, bugs: 0 };
    }

    for (const item of allItems) {
      const key = String(item.parentId);
      if (!counts[key]) continue;
      const itemType = item.type.toLowerCase();
      if (itemType === "task") counts[key].tasks += 1;
      if (itemType === "bug") counts[key].bugs += 1;
    }

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Azure DevOps child count query error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch child work item counts from Azure DevOps",
      },
      { status: 500 }
    );
  }
}

