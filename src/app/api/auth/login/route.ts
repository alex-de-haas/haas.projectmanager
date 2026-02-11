import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { AUTH_COOKIE_NAME, createAuthToken, getSessionMaxAgeSeconds } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import type { User } from "@/types";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = db
      .prepare("SELECT id, name, email, is_admin, password_hash, created_at FROM users WHERE LOWER(email) = LOWER(?)")
      .get(email) as (User & { password_hash?: string | null }) | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

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

    return response;
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Failed to login" }, { status: 500 });
  }
}
