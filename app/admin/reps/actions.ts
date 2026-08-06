"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AddRepInput = {
  fullName: string;
  email: string;
  phone: string | null;
  password: string;
  managerId: string | null;
};

export type AddRepResult = { ok: true } | { ok: false; error: string };

export type UserRole = "rep" | "team_lead" | "admin" | "super_admin";
const ADMIN_ROLES: UserRole[] = ["admin", "super_admin"];

export type UpdateUserInput = {
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  managerId: string | null;
  canViewCompanyLeaderboard: boolean;
  excludedFromLeaderboard: boolean;
};

export type UpdateUserResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addRep(input: AddRepInput): Promise<AddRepResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;

  if (!fullName) return { ok: false, error: "Name is required." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email." };
  if (input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const adminClient = createAdminClient();

  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    return { ok: false, error: authError?.message ?? "Failed to create user." };
  }

  // profiles insert runs under the calling admin's own session (RLS:
  // profiles_insert_admin) — service role was only needed for auth.users.
  const supabase = await createClient();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    full_name: fullName,
    email,
    phone,
    role: "rep",
    manager_id: input.managerId,
  });

  if (profileError) {
    // Avoid leaving an orphaned auth user with no profile behind.
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/admin/reps/manage");
  revalidatePath("/admin/reps/add");
  return { ok: true };
}

async function getSiteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export type InviteRepInput = {
  fullName: string;
  email: string;
  phone: string | null;
  managerId: string | null;
};

export type InviteRepResult = { ok: true } | { ok: false; error: string };

// Alternative to addRep: no password set here — Supabase emails the invite,
// the rep sets their own password on the /invite page. Requires SMTP to be
// configured on the Supabase project and the redirect URL to be allow-
// listed (Authentication -> URL Configuration) — neither is verifiable
// from here, so a silent failure on either usually means one of those.
export async function inviteRep(input: InviteRepInput): Promise<InviteRepResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;

  if (!fullName) return { ok: false, error: "Name is required." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email." };

  const adminClient = createAdminClient();
  const siteUrl = await getSiteUrl();

  const { data: authUser, error: authError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${siteUrl}/invite` }
  );

  if (authError || !authUser.user) {
    return { ok: false, error: authError?.message ?? "Failed to send invite." };
  }

  const supabase = await createClient();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    full_name: fullName,
    email,
    phone,
    role: "rep",
    manager_id: input.managerId,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/admin/reps/manage");
  revalidatePath("/admin/reps/add");
  return { ok: true };
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput
): Promise<UpdateUserResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  if (userId === session.userId) {
    return { ok: false, error: "You can't edit your own account." };
  }

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;

  if (!fullName) return { ok: false, error: "Name is required." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email." };

  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("profiles")
    .select("role, active, email")
    .eq("id", userId)
    .single();

  if (currentError || !current) {
    return { ok: false, error: currentError?.message ?? "User not found." };
  }

  const wasActiveAdmin = ADMIN_ROLES.includes(current.role as UserRole) && current.active;
  const willBeActiveAdmin = ADMIN_ROLES.includes(input.role) && input.active;

  if (wasActiveAdmin && !willBeActiveAdmin) {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ADMIN_ROLES)
      .eq("active", true)
      .neq("id", userId);

    if (!count) {
      return {
        ok: false,
        error: "Can't remove the last remaining admin/super_admin.",
      };
    }
  }

  // profiles.email is a denormalized copy — the actual login identity is
  // auth.users.email. Without syncing this via the admin API, the user's
  // displayed email would change but they'd still have to log in with the
  // old one. email_confirm:true skips the double-opt-in confirmation email,
  // consistent with how accounts are created (avoids depending on SMTP).
  if (email !== current.email) {
    const adminClient = createAdminClient();
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (authError) {
      return { ok: false, error: authError.message };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      email,
      phone,
      role: input.role,
      active: input.active,
      manager_id: input.managerId,
      can_view_company_leaderboard: input.canViewCompanyLeaderboard,
      excluded_from_leaderboard: input.excludedFromLeaderboard,
    })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/reps/manage");
  revalidatePath("/admin/reps/add");
  return { ok: true };
}

export type AssignZipResult =
  | { ok: true; assignment: { id: string; zipcode: string } }
  | { ok: false; error: string };

export type UnassignZipResult = { ok: true } | { ok: false; error: string };

export async function assignZip(userId: string, zipcode: string): Promise<AssignZipResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const zip = zipcode.trim();
  if (!/^\d{5}$/.test(zip)) {
    return { ok: false, error: "Zip must be exactly 5 digits." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("zip_assignments")
    .select("id")
    .eq("user_id", userId)
    .eq("zipcode", zip)
    .is("unassigned_at", null)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: `Already assigned ${zip}.` };
  }

  const { data, error } = await supabase
    .from("zip_assignments")
    .insert({ user_id: userId, zipcode: zip, assigned_by: session.userId })
    .select("id, zipcode")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to assign zip." };
  }

  revalidatePath("/admin/reps/manage");
  revalidatePath("/admin/reps/add");
  return { ok: true, assignment: { id: data.id, zipcode: data.zipcode } };
}

export type GrantVisibilityResult =
  | { ok: true; grant: { id: string; granteeId: string; targetId: string } }
  | { ok: false; error: string };

export type RevokeVisibilityResult = { ok: true } | { ok: false; error: string };

// door_knock_visibility_grants (schema.sql) — asymmetric: granting Ricky
// visibility into Ryan's count doesn't give Ryan visibility into Ricky's.
// RLS (dkvg_admin_write) independently enforces the admin-only write here
// too; this check just produces a clean error instead of a raw DB one.
export async function grantDoorKnockVisibility(
  granteeId: string,
  targetId: string
): Promise<GrantVisibilityResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (granteeId === targetId) return { ok: false, error: "Can't grant a user visibility into their own count." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("door_knock_visibility_grants")
    .insert({ grantee_id: granteeId, target_id: targetId, granted_by: session.userId })
    .select("id, grantee_id, target_id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to add grant." };
  }

  revalidatePath("/admin/settings");
  return { ok: true, grant: { id: data.id, granteeId: data.grantee_id, targetId: data.target_id } };
}

export async function revokeDoorKnockVisibility(grantId: string): Promise<RevokeVisibilityResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("door_knock_visibility_grants").delete().eq("id", grantId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

export type UpdateRadiusResult = { ok: true } | { ok: false; error: string };

export async function updateDoorKnockRadius(feet: number): Promise<UpdateRadiusResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!Number.isFinite(feet) || feet <= 0) {
    return { ok: false, error: "Radius must be a positive number." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ value: feet, updated_at: new Date().toISOString(), updated_by: session.userId })
    .eq("key", "door_knock_radius_feet");

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function unassignZip(assignmentId: string): Promise<UnassignZipResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();

  // Row stays — this only closes it out, matching the history-preserving
  // design in schema.sql (reassigning closes old row, opens new one).
  const { error } = await supabase
    .from("zip_assignments")
    .update({ unassigned_at: new Date().toISOString(), unassigned_by: session.userId })
    .eq("id", assignmentId)
    .is("unassigned_at", null);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/reps/manage");
  revalidatePath("/admin/reps/add");
  return { ok: true };
}
