import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import db from "@/lib/db";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";
import { PROJECT_COOKIE_NAME } from "@/lib/user-context";
import { getProjectsForUser } from "@/lib/projects";

interface SidebarUser {
  id: number;
  name: string;
  email?: string | null;
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const authToken = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const payload = verifyAuthToken(authToken);

  if (!payload) {
    redirect("/login");
  }

  const currentUser = db
    .prepare("SELECT id, name, email FROM users WHERE id = ?")
    .get(payload.uid) as SidebarUser | undefined;

  if (!currentUser) {
    redirect("/login");
  }

  const projects = getProjectsForUser(payload.uid);
  const cookieProjectId = cookieStore.get(PROJECT_COOKIE_NAME)?.value ?? "";
  const activeProjectId = projects.some(
    (project) => String(project.id) === cookieProjectId
  )
    ? cookieProjectId
    : projects[0]
    ? String(projects[0].id)
    : "";

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        initialUser={currentUser}
        initialProjects={projects}
        initialActiveProjectId={activeProjectId}
      />
      <main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
