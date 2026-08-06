// Supabase Edge Function: invite-user
//
// Lets an admin invite a new user by email only, from either the web app
// (which already has this via inviteRep's Server Action + service-role
// createAdminClient) or the iOS app, which has no server of its own and
// so can't call the service-role Auth Admin API directly — this function
// is that missing server. The invited user supplies their own name and
// password once they open the invite link (see app/invite/page.tsx's
// name_pending handling).
//
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already
// injected automatically into every Edge Function's environment.
// PUBLIC_SITE_URL must be set by hand (`supabase secrets set
// PUBLIC_SITE_URL=https://fenixsun.com`) — a Deno function has no
// request-host of its own to infer it from.

import { createClient } from "jsr:@supabase/supabase-js@2";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_ROLES = new Set(["admin", "super_admin"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const jwt = authHeader.slice("Bearer ".length);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Two independent checks, not one: getUser(jwt) only proves this is a
  // valid, currently-signed-in Supabase user — it says nothing about
  // whether they're an admin. The profiles.role lookup right after is
  // the actual authorization boundary, same two-layer shape as every
  // other admin check in this codebase (see lib/auth/admin.ts).
  const {
    data: { user: caller },
    error: callerError,
  } = await supabaseAdmin.auth.getUser(jwt);
  if (callerError || !caller) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from("profiles")
    .select("role, active")
    .eq("id", caller.id)
    .single();

  if (callerProfileError || !callerProfile?.active || !ADMIN_ROLES.has(callerProfile.role)) {
    return new Response("Forbidden — admin access required", { status: 403 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return new Response("A valid email is required", { status: 400 });
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    return new Response("A user with this email already exists", { status: 409 });
  }

  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!siteUrl) {
    console.error("invite-user: PUBLIC_SITE_URL not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${siteUrl}/invite` }
  );
  if (authError || !authUser.user) {
    return new Response(authError?.message ?? "Failed to send invite", { status: 500 });
  }

  // Row created immediately, not deferred until the user finishes
  // signup — every other admin screen (zip assignment, role editing,
  // the door-knock leaderboard) already expects a profiles row to exist
  // for anyone in auth.users, and name_pending is what tells /invite to
  // still ask for a name. Placeholder name is the local part of their
  // email, purely so nothing else in the UI shows a blank name in the
  // meantime.
  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: authUser.user.id,
    full_name: email.split("@")[0],
    email,
    role: "rep",
    name_pending: true,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    return new Response(profileError.message, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
