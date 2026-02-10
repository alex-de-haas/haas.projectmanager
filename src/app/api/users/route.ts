import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { User } from "@/types";

const parseUserId = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export async function GET() {
  try {
    const users = db
      .prepare("SELECT * FROM users ORDER BY created_at ASC")
      .all() as User[];
    return NextResponse.json(users);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawName = typeof body?.name === "string" ? body.name : "";
    const name = rawName.trim();

    if (!name) {
      return NextResponse.json({ error: "User name is required" }, { status: 400 });
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE LOWER(name) = LOWER(?)")
      .get(name) as { id: number } | undefined;
    if (existing) {
      return NextResponse.json({ error: "A user with this name already exists" }, { status: 409 });
    }

    const result = db.prepare("INSERT INTO users (name) VALUES (?)").run(name);
    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(result.lastInsertRowid) as User;

    db.prepare(
      "INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, ?, ?)"
    ).run(user.id, "default_day_length", "8");

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = parseUserId(request.nextUrl.searchParams.get("id"));
    if (!userId) {
      return NextResponse.json({ error: "Valid user id is required" }, { status: 400 });
    }

    const body = await request.json();
    const rawName = typeof body?.name === "string" ? body.name : "";
    const name = rawName.trim();

    if (!name) {
      return NextResponse.json({ error: "User name is required" }, { status: 400 });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE id = ?")
      .get(userId) as { id: number } | undefined;
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const duplicateName = db
      .prepare("SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND id != ?")
      .get(name, userId) as { id: number } | undefined;
    if (duplicateName) {
      return NextResponse.json({ error: "A user with this name already exists" }, { status: 409 });
    }

    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, userId);
    const updated = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as User;

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to rename user" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = parseUserId(request.nextUrl.searchParams.get("id"));
    if (!userId) {
      return NextResponse.json({ error: "Valid user id is required" }, { status: 400 });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE id = ?")
      .get(userId) as { id: number } | undefined;
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const count = db
      .prepare("SELECT COUNT(*) as total FROM users")
      .get() as { total: number };
    if (count.total <= 1) {
      return NextResponse.json({ error: "At least one user is required" }, { status: 400 });
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return NextResponse.json({ message: "User deleted" });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
