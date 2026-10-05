import "server-only";

type EmailType =
  | "signer_invite"
  | "reminder"
  | "signed_confirmation"
  | "viewed_notify"
  | "signed_notify"
  | "declined_notify"
  | "voided_notify";

type SendHicEmailInput = {
  emailType: EmailType;
  language: "en" | "es";
  to: string;
  mergeFields: Record<string, string>;
  attachmentBase64?: string;
  attachmentFilename?: string;
};

// Direct, synchronous HTTP call to the send-hic-email Edge Function —
// not routed through the DB-trigger/notifications pattern the rest of
// this app's email uses, since callers here (a rep's own Send action,
// the public signing routes on completion, later Phase 4's cron) all
// need real request/response feedback, not fire-and-forget. Called
// server-side only — HIC_EMAIL_WEBHOOK_SECRET must never reach the
// browser.
export async function sendHicEmail(input: SendHicEmailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const webhookSecret = process.env.HIC_EMAIL_WEBHOOK_SECRET;
  if (!supabaseUrl || !anonKey || !webhookSecret) {
    return { ok: false, error: "Server is missing Supabase URL/anon key or HIC_EMAIL_WEBHOOK_SECRET" };
  }

  try {
    // Two layers, same as every other Edge Function call in this app:
    // the anon-key bearer token satisfies Supabase's own platform-level
    // gateway check (every function requires *some* valid Authorization
    // header before it even runs, regardless of in-function logic); the
    // x-webhook-secret header below is this function's own actual
    // authorization boundary.
    const res = await fetch(`${supabaseUrl}/functions/v1/send-hic-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      return { ok: false, error: `Email send failed: ${res.status} ${await res.text()}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to send email." };
  }
}
