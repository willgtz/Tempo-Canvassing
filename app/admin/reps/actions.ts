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
  email: string;
};

export type InviteRepResult = { ok: true } | { ok: false; error: string };

// Alternative to addRep: no password set here, and (unlike addRep) no name
// collected upfront either — the invited person supplies both their own
// name and password on the /invite page. This is now a thin wrapper
// around the invite-user Edge Function rather than its own separate
// implementation: that function is also what the iOS admin panel calls
// for the exact same "invite by email only" flow, so routing web through
// it too means there's one branded-email implementation instead of two
// that could drift apart, and zero risk of this change touching iOS
// (which is currently under App Store review) — iOS keeps calling the
// same function the same way regardless of what changes inside it.
export async function inviteRep(input: InviteRepInput): Promise<InviteRepResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email." };

  const supabase = await createClient();
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  if (!authSession) return { ok: false, error: "Unauthorized" };

  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: { email },
    headers: { Authorization: `Bearer ${authSession.access_token}` },
  });

  if (error) {
    return { ok: false, error: error.message ?? "Failed to send invite." };
  }
  if (data?.emailWarning) {
    return { ok: false, error: `Account created, but the invite email failed to send: ${data.emailWarning}` };
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
  | { ok: true; grants: { id: string; granteeId: string; targetId: string }[] }
  | { ok: false; error: string };

export type RevokeVisibilityResult = { ok: true } | { ok: false; error: string };

// door_knock_visibility_grants (schema.sql) — asymmetric: granting Ricky
// visibility into Ryan's count doesn't give Ryan visibility into Ricky's.
// RLS (dkvg_admin_write) independently enforces the admin-only write here
// too; this check just produces a clean error instead of a raw DB one.
//
// Takes multiple targets in one call (one grantee can be given visibility
// into several other reps at once from the settings UI) — upsert with
// ignoreDuplicates so re-adding a grant that already exists is a silent
// no-op instead of a unique-constraint error aborting the whole batch.
export async function grantDoorKnockVisibility(
  granteeId: string,
  targetIds: string[]
): Promise<GrantVisibilityResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  const filteredTargetIds = targetIds.filter((id) => id !== granteeId);
  if (filteredTargetIds.length === 0) {
    return { ok: false, error: "Pick at least one target other than the grantee." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("door_knock_visibility_grants")
    .upsert(
      filteredTargetIds.map((targetId) => ({
        grantee_id: granteeId,
        target_id: targetId,
        granted_by: session.userId,
      })),
      { onConflict: "grantee_id,target_id", ignoreDuplicates: true }
    )
    .select("id, grantee_id, target_id");

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to add grants." };
  }

  revalidatePath("/admin/reps/settings");
  return {
    ok: true,
    grants: data.map((g) => ({ id: g.id, granteeId: g.grantee_id, targetId: g.target_id })),
  };
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

export type SendPasswordResetResult = { ok: true } | { ok: false; error: string };

// resetPasswordForEmail is a public, non-privileged call by design (it
// doesn't check who's calling or require the caller to already be that
// user or an admin, so it can't be used to enumerate which emails have
// accounts) — the getAdminSession() check below is a UX affordance
// (only admins see this button), not what actually secures this call.
export async function sendPasswordReset(email: string): Promise<SendPasswordResetResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/reset-password`,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type SetUserPasswordResult = { ok: true } | { ok: false; error: string };

// Unlike sendPasswordReset (an email link the user completes themselves),
// this sets the password directly and immediately — genuinely privileged,
// requires the service-role Admin API (adminClient), not a plain RLS-
// checked table write. Real admin auth boundary is getAdminSession() below
// combined with the service-role key never being exposed client-side; RLS
// doesn't apply to auth.users at all.
export async function setUserPassword(
  userId: string,
  newPassword: string
): Promise<SetUserPasswordResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  if (newPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
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
