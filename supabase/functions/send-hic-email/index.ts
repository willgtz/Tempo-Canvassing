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

// Tempo Solar World's own logo, embedded as a data: URI (not an
// external image URL) so it always renders regardless of image-
// blocking settings or whether some external host stays reachable
// later. Re-encoded from the original 1920x1080 PNG William provided:
// resized to 320px wide and converted to an indexed (32-color)
// palette — this is a flat-color logo (navy/gold/black/white, no
// photo/gradient content), so palette compression drops it from
// ~590KB to ~5KB with no visible quality loss, instead of bloating
// every single email with a huge embedded image.
const LOGO_DATA_URI = "data:image/png;base64,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";

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
  // The logo's own background is opaque white (not transparent), so
  // the header band itself needs to be white too — a colored (e.g.
  // navy) band behind it would show as a visible white box around the
  // logo instead of blending in. The gold rule directly below does the
  // job a colored header band would have, as the brand accent.
  const logo = LOGO_DATA_URI
    ? `<img src="${LOGO_DATA_URI}" width="200" height="112" alt="Tempo Solar World" style="display:inline-block;max-width:200px;height:auto;" />`
    : `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:${BRAND.navy};letter-spacing:0.5px;">TEMPO SOLAR WORLD</span>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:${BRAND.bg};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BRAND.bg};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;background-color:#ffffff;border-radius:8px;overflow:hidden;" cellspacing="0" cellpadding="0">
            <tr>
              <td style="background-color:#ffffff;padding:24px 24px 16px 24px;text-align:center;">
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
