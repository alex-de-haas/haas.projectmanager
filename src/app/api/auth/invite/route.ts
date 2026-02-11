export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { AUTH_COOKIE_NAME, createAuthToken, getSessionMaxAgeSeconds } from "@/lib/auth";
import { hashInvitationToken } from "@/lib/invitations";
import type { User } from "@/types";
import { PROJECT_COOKIE_NAME } from "@/lib/user-context";

const parseToken = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const findValidInvitation = (token: string) => {
  const tokenHash = hashInvitationToken(token);
  return db
    .prepare(
      `
      SELECT i.id as invitation_id, i.user_id, i.expires_at, u.name, u.email
      FROM user_invitations i
      INNER JOIN users u ON u.id = i.user_id
      WHERE i.token_hash = ?
        AND i.used_at IS NULL
        AND i.expires_at > CAST(strftime('%s', 'now') AS INTEGER)
      `
    )
    .get(tokenHash) as
    | {
        invitation_id: number;
        user_id: number;
        expires_at: number;
        name: string;
        email?: string | null;
      }
    | undefined;
};

export async function GET(request: NextRequest) {
  try {
    const token = parseToken(request.nextUrl.searchParams.get("token"));
    if (!token) {
      return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });
    }

    const invitation = findValidInvitation(token);
    if (!invitation) {
      return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: invitation.user_id,
        name: invitation.name,
        email: invitation.email ?? null,
      },
      expires_at: new Date(invitation.expires_at * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Invitation lookup error:", error);
    return NextResponse.json({ error: "Failed to validate invitation" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = parseToken(body?.token);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    const invitation = findValidInvitation(token);
    if (!invitation) {
      return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 404 });
    }

    const acceptInvitation = db.transaction(() => {
      const passwordHash = hashPassword(password);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, invitation.user_id);
      db.prepare("UPDATE user_invitations SET used_at = CAST(strftime('%s', 'now') AS INTEGER) WHERE id = ?")
        .run(invitation.invitation_id);
      db.prepare(
        "DELETE FROM user_invitations WHERE user_id = ? AND id != ?"
      ).run(invitation.user_id, invitation.invitation_id);

      return db
        .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
        .get(invitation.user_id) as User;
    });

    const user = acceptInvitation();
    const authToken = createAuthToken(user.id);
    const project = db
      .prepare("SELECT id FROM projects WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 1")
      .get(user.id) as { id: number } | undefined;
    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email ?? null,
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
    if (project?.id) {
      response.cookies.set(PROJECT_COOKIE_NAME, String(project.id), {
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: getSessionMaxAgeSeconds(),
      });
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.name")) {
      return NextResponse.json({ error: "A user with this name already exists" }, { status: 409 });
    }
    console.error("Invitation accept error:", error);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}
