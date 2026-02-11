import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

export const USER_COOKIE_NAME = "pm_user_id";
export const DEFAULT_USER_ID = 1;
export const PROJECT_COOKIE_NAME = "pm_project_id";
const DEFAULT_PROJECT_NAME = "Default";

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
  const fromAuth = getAuthenticatedUserId(request);
  if (fromAuth) return resolveKnownUserId(fromAuth);

  const fromHeader = parseUserId(request.headers.get("x-user-id"));
  if (fromHeader) return resolveKnownUserId(fromHeader);

  const fromQuery = parseUserId(request.nextUrl.searchParams.get("userId"));
  if (fromQuery) return resolveKnownUserId(fromQuery);

  const fromCookie = parseUserId(request.cookies.get(USER_COOKIE_NAME)?.value);
  return resolveKnownUserId(fromCookie);
};

const parseProjectId = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const ensureDefaultProjectForUser = (userId: number): number => {
  const existingMembership = db
    .prepare(`
      SELECT p.id
      FROM project_members pm
      INNER JOIN projects p ON p.id = pm.project_id
      WHERE pm.user_id = ?
      ORDER BY p.created_at ASC, p.id ASC
      LIMIT 1
    `)
    .get(userId) as { id: number } | undefined;

  if (existingMembership) {
    return existingMembership.id;
  }

  const projectInserted = db
    .prepare("INSERT INTO projects (user_id, name) VALUES (?, ?)")
    .run(userId, DEFAULT_PROJECT_NAME);
  const projectId = Number(projectInserted.lastInsertRowid);
  db.prepare(
    "INSERT OR IGNORE INTO project_members (project_id, user_id, added_by_user_id) VALUES (?, ?, ?)"
  ).run(projectId, userId, userId);
  return projectId;
};

const resolveKnownProjectId = (userId: number, candidateProjectId: number | null): number => {
  const fallbackProjectId = ensureDefaultProjectForUser(userId);

  if (!candidateProjectId) {
    return fallbackProjectId;
  }

  const project = db
    .prepare("SELECT project_id as id FROM project_members WHERE project_id = ? AND user_id = ?")
    .get(candidateProjectId, userId) as { id: number } | undefined;

  return project ? candidateProjectId : fallbackProjectId;
};

export const getRequestProjectId = (
  request: NextRequest,
  resolvedUserId?: number
): number => {
  const userId = resolvedUserId ?? getRequestUserId(request);
  const fromHeader = parseProjectId(request.headers.get("x-project-id"));
  if (fromHeader) return resolveKnownProjectId(userId, fromHeader);

  const fromQuery = parseProjectId(request.nextUrl.searchParams.get("projectId"));
  if (fromQuery) return resolveKnownProjectId(userId, fromQuery);

  const fromCookie = parseProjectId(request.cookies.get(PROJECT_COOKIE_NAME)?.value);
  return resolveKnownProjectId(userId, fromCookie);
};
