// Supabase Edge Function: send-notification-email
//
// Triggered by trigger_notification_email() (schema.sql) via pg_net on
// `notifications` INSERT. Looks up the notified user's email and sends a
// transactional email via Resend — but only for notification types in
// EMAILABLE_TYPES below. Assignment notifications are inserted for BOTH the
// closer and the opener (notify_appointment_assignment, schema.sql), with
// different `type` values specifically so this function can email only the
// closer, not the opener, per William's request.
//
// Secrets this function needs (Dashboard -> Edge Functions -> Secrets, or
// `supabase secrets set`), never committed to the repo:
//   RESEND_API_KEY          - from resend.com
//   NOTIFICATION_FROM_EMAIL - a verified Resend sender, e.g. fenix@temposolarvegas.com
//   WEBHOOK_SECRET          - shared secret; must match the x-webhook-secret
//                             header trigger_notification_email() sends, so
//                             this function only accepts calls that actually
//                             came from that trigger, not just anyone who
//                             finds the URL (on top of the platform's own
//                             JWT check on the Authorization header).
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

// Only these notification types actually send an email — everything else
// (e.g. the opener's copy of an assignment notification) still shows up in
// the in-app bell but doesn't email. Extend this list deliberately, not by
// default-allowing every type.
const EMAILABLE_TYPES = new Set(["appointment_assigned_closer", "appointment_no_show"]);

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
  if (!EMAILABLE_TYPES.has(notification.type)) {
    return new Response("Skipped: not an emailable type", { status: 200 });
  }

  // Service-role client — this function needs to read a profile's email and
  // the appointment/lead details regardless of whose request triggered it
  // (there's no end-user request here at all, just the trigger), same
  // reasoning appointment_assignments' security-definer trigger functions
  // in schema.sql already rely on.
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

  const body = await buildEmailBody(supabase, notification);

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: profile.email,
      subject: "Fenix Appointment",
      text: body,
    }),
  });

  if (!emailResponse.ok) {
    const errorBody = await emailResponse.text();
    console.error("send-notification-email: Resend request failed", emailResponse.status, errorBody);
    return new Response("Email send failed", { status: 502 });
  }

  return new Response("OK", { status: 200 });
});

// Appointment details only — deliberately excludes current status and the
// assigned closer (per William's request), even though both are easy to
// fetch from the same appointment row.
// deno-lint-ignore no-explicit-any
async function buildEmailBody(supabase: any, notification: NotificationRow): Promise<string> {
  if (!notification.appointment_id) {
    return notification.message;
  }

  const { data: appointment } = await supabase
    .from("appointments")
    .select("scheduled_at, lead_id, created_by, custom_field_responses")
    .eq("id", notification.appointment_id)
    .single();

  if (!appointment) {
    return notification.message;
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("first_name, last_name, address_line, city, state, zipcode")
    .eq("id", appointment.lead_id)
    .single();

  const { data: opener } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", appointment.created_by)
    .single();

  const { data: formFields } = await supabase
    .from("appointment_form_fields")
    .select("id, label, field_type")
    .order("sort_order");

  const customerName = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unknown";
  const address = lead
    ? [lead.address_line, [lead.city, lead.state, lead.zipcode].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(", ")
    : "Unknown";

  // Las Vegas-area business (temposolarvegas.com) — Pacific time. This runs
  // server-side with no per-recipient timezone to key off of, so a fixed
  // zone is the simplest correct choice; revisit if the company expands
  // outside Pacific time.
  const scheduledAt = new Date(appointment.scheduled_at).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const lines = [
    notification.message,
    "",
    `Customer: ${customerName}`,
    `Address: ${address}`,
    `Scheduled: ${scheduledAt}`,
    `Opener: ${opener?.full_name ?? "Unknown"}`,
  ];

  const responses = (appointment.custom_field_responses ?? {}) as Record<string, string>;
  // deno-lint-ignore no-explicit-any
  const fields = (formFields ?? []) as any[];

  // The submission-form "Notes" field gets its own guaranteed, clearly
  // labeled line right after the core details, same distinction iOS
  // (AppointmentDetailScreen's submissionNoteText) and the web admin panel
  // already make — matched by label containing "notes", same convention
  // both of those use, rather than relying on sort_order happening to put
  // it first.
  const notesField = fields.find((f) => f.label.toLowerCase().includes("notes"));
  if (notesField) {
    const raw = responses[notesField.id]?.trim();
    if (raw) lines.push(`Notes: ${raw}`);
  }

  for (const field of fields) {
    if (field.id === notesField?.id) continue;
    const raw = responses[field.id]?.trim();
    if (!raw) continue;
    const value = field.field_type === "checkbox" ? (raw === "true" ? "Yes" : "No") : raw;
    lines.push(`${field.label}: ${value}`);
  }

  return lines.join("\n");
}
