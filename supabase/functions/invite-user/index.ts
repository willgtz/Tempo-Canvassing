// Supabase Edge Function: invite-user
//
// Lets an admin invite a new user by email only, from either the web app
// or the iOS app — both call this same function the same way (POST with
// an admin's bearer token + { email }), so changing what happens inside
// it never requires a change on either caller. That matters here
// specifically: iOS calls this unchanged from AdminSettingsScreen's
// invite flow, and is currently under App Store review, so this function
// was deliberately changed only internally (how the invite email gets
// sent) with its request/response contract left byte-for-byte identical.
// The invited user supplies their own name and password once they open
// the invite link (see app/invite/page.tsx's name_pending handling).
//
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already
// injected automatically into every Edge Function's environment.
// PUBLIC_SITE_URL must be set by hand (`supabase secrets set
// PUBLIC_SITE_URL=https://fenixsun.com`) — a Deno function has no
// request-host of its own to infer it from. RESEND_API_KEY and
// NOTIFICATION_FROM_EMAIL are the same two secrets send-notification-email
// already requires (Edge Function secrets are project-wide, not
// per-function) — if appointment-notification emails already work, these
// invite emails need no additional setup.

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

  // A still-pending invite (name_pending: true — the profile row exists
  // but they've never actually signed in and set a password) is allowed
  // to go through again: this is what powers the "Resend Invite" button
  // on the web Manage page, in case the email never arrived or went to
  // spam. Only a genuinely completed account (name_pending: false)
  // blocks a re-invite.
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, name_pending")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile && !existingProfile.name_pending) {
    return new Response("A user with this email already exists", { status: 409 });
  }

  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  if (!siteUrl) {
    console.error("invite-user: PUBLIC_SITE_URL not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  // generateLink (not inviteUserByEmail) — creates the auth user exactly
  // like inviteUserByEmail did, but returns the raw action_link instead
  // of Supabase sending its own generic default-template email. That
  // link is what lets us send a Fenix Sun-branded email ourselves below
  // instead of Supabase's plain "You have been invited" template. For a
  // resend, the user already exists and is still unconfirmed, so this
  // just issues a fresh token/link for the same account rather than
  // erroring.
  const { data: linkData, error: authError } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${siteUrl}/invite` },
  });
  if (authError || !linkData?.user) {
    return new Response(authError?.message ?? "Failed to create invite", { status: 500 });
  }

  // Row created immediately, not deferred until the user finishes
  // signup — every other admin screen (zip assignment, role editing,
  // the door-knock leaderboard) already expects a profiles row to exist
  // for anyone in auth.users, and name_pending is what tells /invite to
  // still ask for a name. Placeholder name is the local part of their
  // email, purely so nothing else in the UI shows a blank name in the
  // meantime. Skipped entirely on a resend — the row's already there.
  if (!existingProfile) {
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: linkData.user.id,
      full_name: email.split("@")[0],
      email,
      role: "rep",
      name_pending: true,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(linkData.user.id);
      return new Response(profileError.message, { status: 500 });
    }
  }

  // Our own page's URL with the raw token, not Supabase's action_link
  // (which points at <project>.supabase.co/auth/v1/verify and consumes
  // the one-time token via a plain server-side redirect). Email security
  // scanners (Outlook Safe Links, Gmail's own link-safety prefetching,
  // corporate spam gateways) routinely fetch links in incoming mail to
  // check them before the recipient ever clicks — a bare GET is enough
  // to burn a one-time verify token, which is exactly what
  // otp_expired/access_denied on a just-received invite means. A link to
  // our own domain is just a normal webpage to a scanner; only a real
  // browser running /invite's JS actually calls verifyOtp and consumes
  // the token, so a non-JS prefetch can't burn it.
  const inviteLink = `${siteUrl}/invite?token_hash=${linkData.properties.hashed_token}&type=invite`;

  const emailError = await sendInviteEmail(email, inviteLink);
  if (emailError) {
    // The account already exists and the link is valid at this point —
    // failing the whole request here would leave a user with no way to
    // find out an account was created for them, which is worse than
    // just surfacing the send failure and letting the admin resend/share
    // the link manually if needed. Not rolled back.
    console.error("invite-user: failed to send branded invite email", emailError);
    return new Response(JSON.stringify({ ok: true, emailWarning: emailError }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// Table-based layout + inline styles throughout — the usual constraints
// for HTML email, where most clients (Outlook especially) don't support
// flexbox/grid or external/embedded <style> reliably.
async function sendInviteEmail(email: string, actionLink: string): Promise<string | null> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL");
  if (!resendApiKey || !fromEmail) {
    return "RESEND_API_KEY or NOTIFICATION_FROM_EMAIL not set";
  }

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:440px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td align="center" style="background-color:#2563eb;padding:32px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                  <tr>
                    <td style="padding-right:10px;vertical-align:middle;">
                      <img
                        src="https://www.fenixsun.com/icon.png"
                        width="40"
                        height="40"
                        alt=""
                        style="display:block;width:40px;height:40px;border-radius:9px;"
                      />
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Fenix</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111827;">You're invited to join the team</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#4b5563;">
                  Set up your Fenix account to get started — you'll choose your name and password on the next page.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px;background-color:#2563eb;">
                      <a href="${actionLink}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">
                        Set Up Your Account
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#9ca3af;">
                  If you weren't expecting this invite, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `You're invited to join the Fenix team.\n\nSet up your account: ${actionLink}\n\nIf you weren't expecting this invite, you can safely ignore this email.`;

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: email,
      subject: "You're invited to join Fenix",
      html,
      text,
    }),
  });

  if (!emailResponse.ok) {
    return `Resend request failed: ${emailResponse.status} ${await emailResponse.text()}`;
  }
  return null;
}
