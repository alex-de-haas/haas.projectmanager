import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { User } from "@/types";
import { createInvitationToken, hashInvitationToken, INVITATION_EXPIRY_SECONDS } from "@/lib/invitations";

const parseUserId = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeEmail = (value: unknown): string => {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
};

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const fallbackNameFromEmail = (email: string): string => {
  const [localPart] = email.split("@");
  return localPart || email;
};

export async function GET() {
  try {
    const users = db
      .prepare("SELECT id, name, email, created_at FROM users ORDER BY created_at ASC")
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
    const email = normalizeEmail(body?.email);
    const rawName = typeof body?.name === "string" ? body.name : "";
    const name = rawName.trim() || fallbackNameFromEmail(email);

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "User name is required" }, { status: 400 });
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?)")
      .get(email) as { id: number } | undefined;
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const invitationToken = createInvitationToken();
    const invitationTokenHash = hashInvitationToken(invitationToken);
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + INVITATION_EXPIRY_SECONDS;

    const createUserWithInvitation = db.transaction(() => {
      const result = db
        .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, NULL)")
        .run(name, email);
      const user = db
        .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
        .get(result.lastInsertRowid) as User;

      db.prepare(
        "INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, ?, ?)"
      ).run(user.id, "default_day_length", "8");

      db.prepare("DELETE FROM user_invitations WHERE user_id = ?").run(user.id);
      db.prepare("INSERT INTO user_invitations (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
        .run(user.id, invitationTokenHash, expiresAtSeconds);
      return user;
    });

    const user = createUserWithInvitation();

    const inviteLink = `${request.nextUrl.origin}/invite?token=${encodeURIComponent(invitationToken)}`;
    return NextResponse.json(
      {
        ...user,
        invitation_link: inviteLink,
        invitation_expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
      },
      { status: 201 }
    );
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
    const email = body?.email !== undefined ? normalizeEmail(body.email) : undefined;
    const name = rawName.trim();

    if (!name) {
      return NextResponse.json({ error: "User name is required" }, { status: 400 });
    }
    if (email !== undefined && (!email || !isValidEmail(email))) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
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

    if (email !== undefined) {
      const duplicateEmail = db
        .prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?")
        .get(email, userId) as { id: number } | undefined;
      if (duplicateEmail) {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }
    }

    if (email !== undefined) {
      db.prepare("UPDATE users SET name = ?, email = ? WHERE id = ?").run(name, email, userId);
    } else {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, userId);
    }
    const updated = db
      .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
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
