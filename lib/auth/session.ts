import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "rep" | "team_lead" | "admin" | "super_admin";

export type UserSession = {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
};

// Like getAdminSession/requireAdmin in lib/auth/admin.ts, but for any
// authenticated + active user regardless of role — used by rep-facing
// screens (e.g. app/leads) that admins should also be able to reach.
export async function getSession(): Promise<UserSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile.full_name,
    role: profile.role as UserRole,
  };
}

export async function requireSession(): Promise<UserSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
