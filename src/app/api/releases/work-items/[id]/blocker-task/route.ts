export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getRequestProjectId, getRequestUserId } from "@/lib/user-context";

interface ReleaseWorkItemRow {
  id: number;
  user_id: number;
  project_id: number;
  title: string;
  external_id?: string | null;
  external_source?: string | null;
  work_item_type?: string | null;
  state?: string | null;
  task_id?: number | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = getRequestUserId(request);
    const projectId = getRequestProjectId(request, userId);
    const id = Number(params.id);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { error: "Work item id must be a number" },
        { status: 400 }
      );
    }

    const workItem = db
      .prepare(
        `SELECT id, user_id, project_id, title, external_id, external_source, work_item_type, state, task_id
         FROM release_work_items
         WHERE id = ? AND project_id = ?`
      )
      .get(id, projectId) as ReleaseWorkItemRow | undefined;

    if (!workItem) {
      return NextResponse.json({ error: "Work item not found" }, { status: 404 });
    }

    if (workItem.task_id) {
      const existingTask = db
        .prepare("SELECT id FROM tasks WHERE id = ? AND project_id = ?")
        .get(workItem.task_id, projectId) as { id: number } | undefined;
      if (existingTask) {
        return NextResponse.json({ taskId: existingTask.id });
      }
    }

    let taskId: number | null = null;
    const externalIdAsNumber = Number(workItem.external_id);
    const hasValidExternalId =
      Number.isInteger(externalIdAsNumber) && externalIdAsNumber > 0;

    if (
      hasValidExternalId &&
      workItem.external_source === "azure_devops"
    ) {
      const mappedTask = db
        .prepare(
          `SELECT id
           FROM tasks
           WHERE project_id = ?
             AND external_source = 'azure_devops'
             AND CAST(external_id AS INTEGER) = ?
           ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, id ASC
           LIMIT 1`
        )
        .get(projectId, externalIdAsNumber, userId) as { id: number } | undefined;
      taskId = mappedTask?.id ?? null;
    }

    if (!taskId) {
      const normalizedType = (workItem.work_item_type || "").toLowerCase();
      const taskType = normalizedType === "bug" ? "bug" : "task";
      const maxOrderRow = db
        .prepare(
          "SELECT MAX(display_order) as max_order FROM tasks WHERE user_id = ? AND project_id = ?"
        )
        .get(userId, projectId) as { max_order: number | null };
      const nextOrder = (maxOrderRow.max_order ?? -1) + 1;

      const insertResult = db
        .prepare(
          `INSERT INTO tasks
            (user_id, project_id, title, type, status, external_id, external_source, display_order)
           VALUES
            (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          userId,
          projectId,
          workItem.title,
          taskType,
          workItem.state || null,
          workItem.external_id || null,
          workItem.external_source || null,
          nextOrder
        );
      taskId = Number(insertResult.lastInsertRowid);
    }

    db.prepare(
      "UPDATE release_work_items SET task_id = ? WHERE id = ? AND project_id = ?"
    ).run(taskId, id, projectId);

    return NextResponse.json({ taskId });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to prepare blocker task" },
      { status: 500 }
    );
  }
}
