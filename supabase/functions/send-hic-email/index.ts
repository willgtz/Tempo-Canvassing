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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tempo Solar World's own brand colors, matched to the navy header
// bands / gold accent rules already used on the real HIC PDF templates
// — so the email and the document it's about actually look like the
// same company sent them, not two unrelated systems.
const BRAND = {
  navy: "#0f2a4a",
  gold: "#f5a623",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f4f4f5",
};

// TODO: replace with the real Tempo Solar World logo once provided —
// placeholder keeps the branded layout (header band, accent rule,
// footer) fully working and testable in the meantime. A data: URI
// (not an external image URL) so the logo always renders regardless
// of image-blocking settings or whether some external host is still
// reachable later.
const LOGO_DATA_URI: string | null = null;

// Only the two merge fields that are ever an actual URL — turned into
// a styled button instead of a raw link. Every other {field} just
// becomes escaped plain text.
const BUTTON_LABELS: Partial<Record<string, { en: string; es: string }>> = {
  sign_link: { en: "Review &amp; Sign", es: "Revisar y Firmar" },
  download_link: { en: "Download Document", es: "Descargar Documento" },
};

function renderButton(url: string, label: string): string {
  return (
    `<div style="margin:20px 0;">` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:6px;background-color:${BRAND.gold};">` +
    `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;border-radius:6px;">${label}</a>` +
    `</td></tr></table>` +
    `</div>`
  );
}

// Escapes the template text first (so admin-written body text can
// never inject raw HTML), then substitutes {field} tokens — known
// link fields become a button, everything else becomes escaped plain
// text. Token substitution happens on the already-escaped string,
// which is safe since "{field}" itself has no characters escapeHtml
// would touch.
function renderBodyHtml(template: string, mergeFields: Record<string, string>, language: "en" | "es"): string {
  const escapedTemplate = escapeHtml(template);
  return escapedTemplate.replace(/\{(\w+)\}/g, (match, key) => {
    const value = mergeFields[key];
    if (value === undefined) return match;
    const buttonLabel = BUTTON_LABELS[key];
    if (buttonLabel && /^https?:\/\//.test(value)) {
      return renderButton(value, buttonLabel[language]);
    }
    return escapeHtml(value);
  });
}

function wrapEmailHtml(bodyHtml: string): string {
  const logo = LOGO_DATA_URI
    ? `<img src="${LOGO_DATA_URI}" alt="Tempo Solar World" style="height:44px;display:inline-block;" />`
    : `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">TEMPO SOLAR WORLD</span>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:${BRAND.bg};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BRAND.bg};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;background-color:#ffffff;border-radius:8px;overflow:hidden;" cellspacing="0" cellpadding="0">
            <tr>
              <td style="background-color:${BRAND.navy};padding:28px 24px;text-align:center;">
                ${logo}
              </td>
            </tr>
            <tr>
              <td style="height:4px;background-color:${BRAND.gold};line-height:4px;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.text};white-space:pre-wrap;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted};border-top:1px solid ${BRAND.border};">
                Tempo Solar World LLC &middot; 2925 E Patrick Ln Ste G, Las Vegas, NV 89120
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
  const html = wrapEmailHtml(renderBodyHtml(tpl.body, body.mergeFields, body.language));

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
