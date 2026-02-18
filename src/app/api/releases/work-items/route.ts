export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { Blocker, ReleaseWorkItem } from "@/types";
import { getRequestProjectId, getRequestUserId } from "@/lib/user-context";

export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const searchParams = request.nextUrl.searchParams;
    const releaseIdParam = searchParams.get("releaseId");

    if (!releaseIdParam) {
      return NextResponse.json(
        { error: "Release id is required" },
        { status: 400 }
      );
    }

    const releaseId = Number(releaseIdParam);
    if (Number.isNaN(releaseId)) {
      return NextResponse.json(
        { error: "Release id must be a number" },
        { status: 400 }
      );
    }

    const items = db
      .prepare(
        "SELECT * FROM release_work_items WHERE release_id = ? AND project_id = ? ORDER BY display_order ASC, created_at DESC"
      )
      .all(releaseId, projectId) as ReleaseWorkItem[];

    const itemsWithTaskId = items.filter(
      (item) => Number.isInteger(item.task_id) && Number(item.task_id) > 0
    );
    const explicitTaskIds = itemsWithTaskId.map((item) => Number(item.task_id));

    const azureExternalIds = Array.from(
      new Set(
        items
          .filter(
            (item) =>
              item.external_source === "azure_devops" &&
              (!item.task_id || Number(item.task_id) <= 0)
          )
          .map((item) => Number(item.external_id))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    if (explicitTaskIds.length === 0 && azureExternalIds.length === 0) {
      return NextResponse.json(items);
    }

    const taskIdByExternalId = new Map<number, number>();
    if (azureExternalIds.length > 0) {
      const taskPlaceholders = azureExternalIds.map(() => "?").join(", ");
      const mappedTasks = db
        .prepare(
          `SELECT id, external_id
           FROM tasks
           WHERE project_id = ?
             AND external_source = 'azure_devops'
             AND external_id IS NOT NULL
             AND CAST(external_id AS INTEGER) IN (${taskPlaceholders})`
        )
        .all(projectId, ...azureExternalIds) as Array<{
        id: number;
        external_id: string;
      }>;

      mappedTasks.forEach((task) => {
        const externalId = Number(task.external_id);
        if (!Number.isInteger(externalId) || externalId <= 0) return;
        if (!taskIdByExternalId.has(externalId)) {
          taskIdByExternalId.set(externalId, task.id);
        }
      });
    }

    const resolvedTaskIds = Array.from(
      new Set([...explicitTaskIds, ...Array.from(taskIdByExternalId.values())])
    );

    let blockersByTaskId = new Map<number, Blocker[]>();
    if (resolvedTaskIds.length > 0) {
      const blockerPlaceholders = resolvedTaskIds.map(() => "?").join(", ");
      const blockers = db
        .prepare(
          `SELECT *
           FROM blockers
           WHERE user_id = ?
             AND project_id = ?
             AND is_resolved = 0
             AND task_id IN (${blockerPlaceholders})
           ORDER BY task_id, created_at DESC`
        )
        .all(userId, projectId, ...resolvedTaskIds) as Blocker[];

      blockersByTaskId = blockers.reduce((acc, blocker) => {
        const existing = acc.get(blocker.task_id) ?? [];
        existing.push(blocker);
        acc.set(blocker.task_id, existing);
        return acc;
      }, new Map<number, Blocker[]>());
    }

    const enrichedItems = items.map((item) => {
      const explicitTaskId =
        Number.isInteger(item.task_id) && Number(item.task_id) > 0
          ? Number(item.task_id)
          : null;
      if (explicitTaskId) {
        return {
          ...item,
          task_id: explicitTaskId,
          blockers: blockersByTaskId.get(explicitTaskId) ?? [],
        };
      }

      const externalId = Number(item.external_id);
      if (!Number.isInteger(externalId) || externalId <= 0) {
        return {
          ...item,
          task_id: null,
          blockers: [],
        };
      }
      const taskId = taskIdByExternalId.get(externalId) ?? null;
      return {
        ...item,
        task_id: taskId,
        blockers: taskId ? blockersByTaskId.get(taskId) ?? [] : [],
      };
    });

    return NextResponse.json(enrichedItems);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to fetch release work items" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const searchParams = request.nextUrl.searchParams;
    const idParam = searchParams.get("id");

    if (!idParam) {
      return NextResponse.json(
        { error: "Work item id is required" },
        { status: 400 }
      );
    }

    const id = Number(idParam);
    if (Number.isNaN(id)) {
      return NextResponse.json(
        { error: "Work item id must be a number" },
        { status: 400 }
      );
    }

    const stmt = db.prepare("DELETE FROM release_work_items WHERE id = ? AND project_id = ?");
    const result = stmt.run(id, projectId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Work item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to delete release work item" },
      { status: 500 }
    );
  }
}
