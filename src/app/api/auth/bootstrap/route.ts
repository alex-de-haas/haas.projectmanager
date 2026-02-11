import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AUTH_COOKIE_NAME, createAuthToken, getSessionMaxAgeSeconds } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import type { User } from "@/types";
import { PROJECT_COOKIE_NAME } from "@/lib/user-context";

export const dynamic = "force-dynamic";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeName = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const countUsers = (): number => {
  const row = db.prepare("SELECT COUNT(*) as total FROM users").get() as { total: number };
  return row.total;
};

export async function GET() {
  try {
    return NextResponse.json({ requiresSetup: countUsers() === 0 });
  } catch (error) {
    console.error("Bootstrap status error:", error);
    return NextResponse.json({ error: "Failed to resolve bootstrap status" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = normalizeName(body?.name);
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name) {
      return NextResponse.json({ error: "User name is required" }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    const createFirstUser = db.transaction(() => {
      if (countUsers() > 0) {
        return null;
      }

      const passwordHash = hashPassword(password);
      const result = db
        .prepare("INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)")
        .run(name, email, passwordHash);
      const user = db
        .prepare("SELECT id, name, email, is_admin, created_at FROM users WHERE id = ?")
        .get(result.lastInsertRowid) as User;

      const projectResult = db
        .prepare("INSERT INTO projects (user_id, name, updated_at) VALUES (?, 'Default', CURRENT_TIMESTAMP)")
        .run(user.id);
      const defaultProjectId = Number(projectResult.lastInsertRowid);
      db.prepare(
        "INSERT OR IGNORE INTO project_members (project_id, user_id, added_by_user_id) VALUES (?, ?, ?)"
      ).run(defaultProjectId, user.id, user.id);

      db.prepare("INSERT OR IGNORE INTO settings (user_id, project_id, key, value) VALUES (?, ?, ?, ?)")
        .run(user.id, defaultProjectId, "default_day_length", "8");

      return { user, defaultProjectId };
    });

    const created = createFirstUser();
    if (!created) {
      return NextResponse.json({ error: "Initial setup has already been completed" }, { status: 409 });
    }
    const { user, defaultProjectId } = created;

    const authToken = createAuthToken(user.id);
    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email ?? null,
        is_admin: user.is_admin ?? 0,
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, authToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionMaxAgeSeconds(),
    });

    response.cookies.set("pm_user_id", String(user.id), {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionMaxAgeSeconds(),
    });
    response.cookies.set(PROJECT_COOKIE_NAME, String(defaultProjectId), {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionMaxAgeSeconds(),
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.name")) {
      return NextResponse.json({ error: "A user with this name already exists" }, { status: 409 });
    }
    console.error("Bootstrap create error:", error);
    return NextResponse.json({ error: "Failed to create first user" }, { status: 500 });
  }
}
