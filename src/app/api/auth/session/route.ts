import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";
import type { User } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = db
      .prepare("SELECT id, name, email, is_admin, created_at FROM users WHERE id = ?")
      .get(userId) as User | undefined;

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email ?? null,
        is_admin: user.is_admin ?? 0,
      },
    });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({ error: "Failed to resolve session" }, { status: 500 });
  }
}
