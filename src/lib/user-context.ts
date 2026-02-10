import type { NextRequest } from "next/server";
import db from "@/lib/db";

export const USER_COOKIE_NAME = "pm_user_id";
export const DEFAULT_USER_ID = 1;

const parseUserId = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const resolveKnownUserId = (candidateUserId: number | null): number => {
  const defaultUser = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(DEFAULT_USER_ID) as { id: number } | undefined;
  const fallbackUser = defaultUser
    ? defaultUser
    : (db
        .prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
        .get() as { id: number } | undefined);

  if (!fallbackUser) {
    return DEFAULT_USER_ID;
  }

  if (!candidateUserId) {
    return fallbackUser.id;
  }

  const user = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(candidateUserId) as { id: number } | undefined;
  return user ? candidateUserId : fallbackUser.id;
};

export const getRequestUserId = (request: NextRequest): number => {
  const fromHeader = parseUserId(request.headers.get("x-user-id"));
  if (fromHeader) return resolveKnownUserId(fromHeader);

  const fromQuery = parseUserId(request.nextUrl.searchParams.get("userId"));
  if (fromQuery) return resolveKnownUserId(fromQuery);

  const fromCookie = parseUserId(request.cookies.get(USER_COOKIE_NAME)?.value);
  return resolveKnownUserId(fromCookie);
};
