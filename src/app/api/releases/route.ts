import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { Release } from "@/types";

export async function GET() {
  try {
    const releases = db
      .prepare("SELECT * FROM releases ORDER BY start_date ASC")
      .all() as Release[];
    return NextResponse.json(releases);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, start_date, end_date } = body as {
      name?: string;
      start_date?: string;
      end_date?: string;
    };

    if (!name || !start_date || !end_date) {
      return NextResponse.json(
        { error: "Name, start date, and end date are required" },
        { status: 400 }
      );
    }

    if (end_date < start_date) {
      return NextResponse.json(
        { error: "End date must be after start date" },
        { status: 400 }
      );
    }

    const stmt = db.prepare(
      "INSERT INTO releases (name, start_date, end_date) VALUES (?, ?, ?)"
    );
    const result = stmt.run(name.trim(), start_date, end_date);

    const release = db
      .prepare("SELECT * FROM releases WHERE id = ?")
      .get(result.lastInsertRowid) as Release;

    return NextResponse.json(release, { status: 201 });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to create release" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const idParam = searchParams.get("id");

    if (!idParam) {
      return NextResponse.json(
        { error: "Release id is required" },
        { status: 400 }
      );
    }

    const id = Number(idParam);
    if (Number.isNaN(id)) {
      return NextResponse.json(
        { error: "Release id must be a number" },
        { status: 400 }
      );
    }

    const stmt = db.prepare("DELETE FROM releases WHERE id = ?");
    const result = stmt.run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to delete release" },
      { status: 500 }
    );
  }
}
