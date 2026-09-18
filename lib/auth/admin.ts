import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "admin" | "super_admin";

export type AdminSession = {
  userId: string;
  email: string;
  role: AdminRole;
};

const ADMIN_ROLES: AdminRole[] = ["admin", "super_admin"];

// Returns the current user's admin session, or null if unauthenticated /
// not an active admin. Never redirects — safe to call from Route Handlers,
// which should respond with 401/403 JSON rather than a redirect.
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !profile.active ||
    !ADMIN_ROLES.includes(profile.role as AdminRole)
  ) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    role: profile.role as AdminRole,
  };
}

export type TeamLeadRole = "team_lead" | "admin" | "super_admin";

export type TeamLeadSession = {
  userId: string;
  email: string;
  role: TeamLeadRole;
};

const TEAM_LEAD_ROLES: TeamLeadRole[] = ["team_lead", "admin", "super_admin"];

// Same shape/pattern as getAdminSession above, one tier lower. The real
// security boundary for archiving is archive_lead's own inline role
// check (schema.sql) — this just gives a clean UI gate/error instead of
// letting a rep's archive attempt fail silently at the DB.
export async function getTeamLeadSession(): Promise<TeamLeadSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !profile.active ||
    !TEAM_LEAD_ROLES.includes(profile.role as TeamLeadRole)
  ) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    role: profile.role as TeamLeadRole,
  };
}

// Defense-in-depth check for admin/super_admin, meant to be called at the
// top of every admin page and Server Action. The real security boundary is
// Postgres RLS (see schema.sql: is_admin(), the leads_insert_admin /
// batches_admin policies) — this just gives a clean redirect instead of
// letting a non-admin's writes fail at the DB.
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
