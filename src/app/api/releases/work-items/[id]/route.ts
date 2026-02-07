import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (Number.isNaN(id)) {
      return NextResponse.json(
        { error: "Work item id must be a number" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { release_id } = body;

    if (!release_id) {
      return NextResponse.json(
        { error: "Release id is required" },
        { status: 400 }
      );
    }

    const releaseId = Number(release_id);
    if (Number.isNaN(releaseId)) {
      return NextResponse.json(
        { error: "Release id must be a number" },
        { status: 400 }
      );
    }

    // Check if the work item exists
    const workItem = db
      .prepare("SELECT * FROM release_work_items WHERE id = ?")
      .get(id);

    if (!workItem) {
      return NextResponse.json(
        { error: "Work item not found" },
        { status: 404 }
      );
    }

    // Check if the target release exists
    const release = db
      .prepare("SELECT * FROM releases WHERE id = ?")
      .get(releaseId);

    if (!release) {
      return NextResponse.json(
        { error: "Target release not found" },
        { status: 404 }
      );
    }

    // Get the maximum display_order for the target release
    const maxOrderResult = db
      .prepare(
        "SELECT MAX(display_order) as max_order FROM release_work_items WHERE release_id = ?"
      )
      .get(releaseId) as { max_order: number | null };

    const nextOrder = (maxOrderResult.max_order ?? -1) + 1;

    // Update the work item with the new release_id and display_order
    const stmt = db.prepare(
      "UPDATE release_work_items SET release_id = ?, display_order = ? WHERE id = ?"
    );
    const result = stmt.run(releaseId, nextOrder, id);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Failed to update work item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to move work item" },
      { status: 500 }
    );
  }
}
