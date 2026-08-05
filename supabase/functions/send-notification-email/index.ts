// Supabase Edge Function: send-notification-email
//
// Triggered by a Database Webhook on `notifications` INSERT (configured in
// the Supabase Dashboard, not in code — see the deployment steps in this
// repo's README/chat instructions). Looks up the notified user's email and
// sends a transactional email via Resend.
//
// Secrets this function needs (Dashboard -> Edge Functions -> Secrets, or
// `supabase secrets set`), never committed to the repo:
//   RESEND_API_KEY        - from resend.com
//   NOTIFICATION_FROM_EMAIL - a verified Resend sender, e.g. notifications@yourdomain.com
//   WEBHOOK_SECRET         - shared secret; must match the "Custom Header"
//                            configured on the Database Webhook, so this
//                            function only accepts calls that actually came
//                            from that webhook, not just anyone who finds
//                            the URL.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already injected
// automatically into every Edge Function's environment — not set by hand.

import { createClient } from "jsr:@supabase/supabase-js@2";

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  appointment_id: string | null;
  message: string;
};

type WebhookPayload = {
  type: "INSERT";
  table: string;
  record: NotificationRow;
};

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get("WEBHOOK_SECRET");
  if (expectedSecret && req.headers.get("x-webhook-secret") !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = (await req.json()) as WebhookPayload;
  if (payload.table !== "notifications" || payload.type !== "INSERT") {
    return new Response("Ignored", { status: 200 });
  }

  const notification = payload.record;

  // Service-role client — this function needs to read a profile's email
  // regardless of whose request triggered it (there's no end-user request
  // here at all, just the webhook), same reasoning appointment_assignments'
  // security-definer trigger functions in schema.sql already rely on.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", notification.user_id)
    .single();

  if (profileError || !profile?.email) {
    console.error("send-notification-email: no profile/email for user", notification.user_id, profileError);
    return new Response("No recipient email", { status: 200 });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL");
  if (!resendApiKey || !fromEmail) {
    console.error("send-notification-email: RESEND_API_KEY or NOTIFICATION_FROM_EMAIL not set");
    return new Response("Email not configured", { status: 200 });
  }

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: profile.email,
      subject: "Tempo Solar Canvass",
      text: notification.message,
    }),
  });

  if (!emailResponse.ok) {
    const body = await emailResponse.text();
    console.error("send-notification-email: Resend request failed", emailResponse.status, body);
    return new Response("Email send failed", { status: 502 });
  }

  return new Response("OK", { status: 200 });
});
