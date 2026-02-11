import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { Project } from "@/types";
import { getRequestUserId } from "@/lib/user-context";

export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projects = db
      .prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at ASC, id ASC")
      .all(userId) as Project[];
    return NextResponse.json(projects);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const body = await request.json();
    const name = String(body?.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    const duplicate = db
      .prepare("SELECT id FROM projects WHERE user_id = ? AND lower(name) = lower(?)")
      .get(userId, name) as { id: number } | undefined;
    if (duplicate) {
      return NextResponse.json({ error: "A project with this name already exists" }, { status: 409 });
    }

    const inserted = db
      .prepare("INSERT INTO projects (user_id, name, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
      .run(userId, name);

    const project = db
      .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
      .get(inserted.lastInsertRowid, userId) as Project | undefined;

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const body = await request.json();
    const projectId = Number(body?.id);
    const name = String(body?.name ?? "").trim();

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Valid project ID is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    const duplicate = db
      .prepare("SELECT id FROM projects WHERE user_id = ? AND lower(name) = lower(?) AND id != ?")
      .get(userId, name, projectId) as { id: number } | undefined;
    if (duplicate) {
      return NextResponse.json({ error: "A project with this name already exists" }, { status: 409 });
    }

    const result = db
      .prepare("UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .run(name, projectId, userId);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const updated = db
      .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
      .get(projectId, userId) as Project | undefined;
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projectId = Number(request.nextUrl.searchParams.get("id"));

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Valid project ID is required" }, { status: 400 });
    }

    const projectCount = db
      .prepare("SELECT COUNT(*) as total FROM projects WHERE user_id = ?")
      .get(userId) as { total: number };
    if (projectCount.total <= 1) {
      return NextResponse.json({ error: "At least one project must remain" }, { status: 400 });
    }

    const refs = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM settings WHERE user_id = ? AND project_id = ?) as settings_count,
          (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND project_id = ?) as tasks_count,
          (SELECT COUNT(*) FROM day_offs WHERE user_id = ? AND project_id = ?) as day_offs_count,
          (SELECT COUNT(*) FROM releases WHERE user_id = ? AND project_id = ?) as releases_count
      `)
      .get(userId, projectId, userId, projectId, userId, projectId, userId, projectId) as {
        settings_count: number;
        tasks_count: number;
        day_offs_count: number;
        releases_count: number;
      };

    if (
      refs.settings_count > 0 ||
      refs.tasks_count > 0 ||
      refs.day_offs_count > 0 ||
      refs.releases_count > 0
    ) {
      return NextResponse.json(
        { error: "Cannot delete a project that still contains data" },
        { status: 400 }
      );
    }

    const result = db
      .prepare("DELETE FROM projects WHERE id = ? AND user_id = ?")
      .run(projectId, userId);
    if (result.changes === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
