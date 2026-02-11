import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { Project } from "@/types";
import { getRequestUserId } from "@/lib/user-context";

const canManageProject = (userId: number, projectOwnerUserId: number): boolean => {
  if (userId === projectOwnerUserId) return true;
  const currentUser = db
    .prepare("SELECT is_admin FROM users WHERE id = ?")
    .get(userId) as { is_admin?: number } | undefined;
  return currentUser?.is_admin === 1;
};

export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const projects = db
      .prepare(`
        SELECT p.*
        FROM projects p
        INNER JOIN project_members pm ON pm.project_id = p.id
        WHERE pm.user_id = ?
        ORDER BY p.created_at ASC, p.id ASC
      `)
      .all(userId) as Project[];

    const result = projects.map((project) => {
      const members = db
        .prepare("SELECT user_id FROM project_members WHERE project_id = ? ORDER BY user_id ASC")
        .all(project.id) as Array<{ user_id: number }>;

      return {
        ...project,
        member_user_ids: members.map((member) => member.user_id),
      };
    });
    return NextResponse.json(result);
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
    const projectId = Number(inserted.lastInsertRowid);
    db.prepare(
      "INSERT OR IGNORE INTO project_members (project_id, user_id, added_by_user_id) VALUES (?, ?, ?)"
    ).run(projectId, userId, userId);

    const project = db
      .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
      .get(projectId, userId) as Project | undefined;

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
    const name = body?.name !== undefined ? String(body?.name).trim() : undefined;
    const memberUserIds = Array.isArray(body?.memberUserIds)
      ? body.memberUserIds
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0)
      : undefined;

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Valid project ID is required" }, { status: 400 });
    }

    const project = db
      .prepare("SELECT id, user_id, name FROM projects WHERE id = ?")
      .get(projectId) as { id: number; user_id: number; name: string } | undefined;
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!canManageProject(userId, project.user_id)) {
      return NextResponse.json({ error: "Only project owner or admin can manage assignments" }, { status: 403 });
    }

    if (name !== undefined && !name) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    if (name !== undefined) {
      const duplicate = db
        .prepare("SELECT id FROM projects WHERE user_id = ? AND lower(name) = lower(?) AND id != ?")
        .get(project.user_id, name, projectId) as { id: number } | undefined;
      if (duplicate) {
        return NextResponse.json({ error: "A project with this name already exists" }, { status: 409 });
      }

      db.prepare("UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(name, projectId);
    }

    if (memberUserIds !== undefined) {
      const transaction = db.transaction((projectMemberIds: number[]) => {
        const unique = Array.from(new Set(projectMemberIds));
        if (!unique.includes(project.user_id)) {
          unique.push(project.user_id);
        }

        db.prepare("DELETE FROM project_members WHERE project_id = ?").run(projectId);
        const insert = db.prepare(
          "INSERT INTO project_members (project_id, user_id, added_by_user_id) VALUES (?, ?, ?)"
        );
        for (const memberId of unique) {
          const exists = db
            .prepare("SELECT id FROM users WHERE id = ?")
            .get(memberId) as { id: number } | undefined;
          if (exists) {
            insert.run(projectId, memberId, userId);
          }
        }
      });
      transaction(memberUserIds);
    }

    const updated = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as Project | undefined;
    const members = db
      .prepare("SELECT user_id FROM project_members WHERE project_id = ? ORDER BY user_id ASC")
      .all(projectId) as Array<{ user_id: number }>;

    return NextResponse.json({
      ...updated,
      member_user_ids: members.map((member) => member.user_id),
    });
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

    const project = db
      .prepare("SELECT id, user_id FROM projects WHERE id = ?")
      .get(projectId) as { id: number; user_id: number } | undefined;
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!canManageProject(userId, project.user_id)) {
      return NextResponse.json({ error: "Only project owner or admin can delete this project" }, { status: 403 });
    }

    const projectCount = db
      .prepare("SELECT COUNT(*) as total FROM projects WHERE user_id = ?")
      .get(project.user_id) as { total: number };
    if (projectCount.total <= 1) {
      return NextResponse.json({ error: "At least one owned project must remain" }, { status: 400 });
    }

    const refs = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM tasks WHERE project_id = ?) as tasks_count,
          (SELECT COUNT(*) FROM releases WHERE project_id = ?) as releases_count,
          (SELECT COUNT(*) FROM project_settings WHERE project_id = ?) as project_settings_count
      `)
      .get(projectId, projectId, projectId) as {
        tasks_count: number;
        releases_count: number;
        project_settings_count: number;
      };

    if (
      refs.tasks_count > 0 ||
      refs.releases_count > 0 ||
      refs.project_settings_count > 0
    ) {
      return NextResponse.json(
        { error: "Cannot delete a project that still contains data" },
        { status: 400 }
      );
    }

    const result = db
      .prepare("DELETE FROM projects WHERE id = ?")
      .run(projectId);
    if (result.changes === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
