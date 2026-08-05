"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string } | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: "Invalid email or password." };
  }

  // Every login used to land on /admin/leads/upload, which bounced anyone
  // who isn't admin/super_admin straight back to /login (the admin layout's
  // gate) with no explanation. Route by role instead now that reps/
  // team_leads have their own screen.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", data.user.id)
    .single();

  if (!profile || !profile.active) {
    // Credentials were valid, but requireSession()/requireAdmin() would
    // just silently bounce this session back to /login anyway — sign them
    // back out and say why, instead of a confusing redirect loop.
    await supabase.auth.signOut();
    return { error: "This account has been deactivated. Contact your admin." };
  }

  if (profile.role === "admin" || profile.role === "super_admin") {
    redirect("/admin/dashboard");
  }
  redirect("/dashboard");
}
