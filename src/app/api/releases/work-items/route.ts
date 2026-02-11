import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { ReleaseWorkItem } from "@/types";
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

    return NextResponse.json(items);
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
