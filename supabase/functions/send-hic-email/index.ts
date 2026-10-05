// Supabase Edge Function: send-hic-email
//
// Generic Send HIC email sender — looks up subject/body from
// hic_email_templates by (emailType, language), interpolates
// {merge_field} placeholders, sends via Resend. Unlike
// send-notification-email (fired async off a DB trigger), this is
// called SYNCHRONOUSLY: once directly from a rep's Server Action when
// they hit Send (needs real-time success/failure feedback), again from
// the public signing routes on completion, and later from the Phase 4
// cron route for reminders — same function, different callers, auth'd
// the same uniform way (shared secret) since one of those callers (the
// cron) has no end-user session to present a JWT for.
//
// Secrets (Dashboard -> Edge Functions -> Secrets, or `supabase secrets
// set`):
//   RESEND_API_KEY          - same one this project's other email
//                             functions already use (from resend.com)
//   NOTIFICATION_FROM_EMAIL - same verified Resend sender
//   HIC_EMAIL_WEBHOOK_SECRET - its OWN dedicated shared secret (not the
//                             generic WEBHOOK_SECRET send-notification-
//                             email uses) — that one is baked into
//                             trigger_notification_email() in Postgres
//                             with a value Supabase secrets intentionally
//                             never expose for re-reading, so a fresh
//                             secret was generated for this function's
//                             different caller (Next.js server code,
//                             not a DB trigger) instead of risking
//                             breaking the existing one by guessing/
//                             overwriting it. Caller sends it as
//                             x-webhook-secret, same header convention.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "jsr:@supabase/supabase-js@2";

type EmailType =
  | "signer_invite"
  | "reminder"
  | "signed_confirmation"
  | "viewed_notify"
  | "signed_notify"
  | "declined_notify"
  | "voided_notify";

type RequestBody = {
  emailType: EmailType;
  language: "en" | "es";
  to: string;
  mergeFields: Record<string, string>;
  attachmentBase64?: string;
  attachmentFilename?: string;
};

function interpolate(template: string, mergeFields: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => mergeFields[key] ?? match);
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get("HIC_EMAIL_WEBHOOK_SECRET");
  if (expectedSecret && req.headers.get("x-webhook-secret") !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!body.emailType || !body.language || !body.to || !body.mergeFields) {
    return new Response("emailType, language, to, and mergeFields are required", { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: tpl, error: tplError } = await supabase
    .from("hic_email_templates")
    .select("subject, body")
    .eq("email_type", body.emailType)
    .eq("language", body.language)
    .single();
  if (tplError || !tpl) {
    return new Response(`No email template found for ${body.emailType}/${body.language}`, { status: 500 });
  }

  const subject = interpolate(tpl.subject, body.mergeFields);
  const text = interpolate(tpl.body, body.mergeFields);
  // Plain-text templates (admin-editable, Phase 5) rendered as simple
  // HTML — paragraph breaks preserved via <br>, no rich layout needed
  // for this content.
  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;white-space:pre-wrap;">${escapeHtml(text)}</body></html>`;

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL");
  if (!resendApiKey || !fromEmail) {
    return new Response("RESEND_API_KEY or NOTIFICATION_FROM_EMAIL not set", { status: 500 });
  }

  const payload: Record<string, unknown> = { from: fromEmail, to: body.to, subject, html, text };
  if (body.attachmentBase64 && body.attachmentFilename) {
    payload.attachments = [{ filename: body.attachmentFilename, content: body.attachmentBase64 }];
  }

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!emailResponse.ok) {
    return new Response(`Resend request failed: ${emailResponse.status} ${await emailResponse.text()}`, {
      status: 502,
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
