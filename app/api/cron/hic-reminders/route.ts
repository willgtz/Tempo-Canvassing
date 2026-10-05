import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendHicEmail } from "@/lib/hic/send-email";
import { getSiteUrl } from "@/lib/hic/site-url";
import { generateSigningToken } from "@/lib/hic/signing-token";
import { getHicSettings } from "@/lib/hic/settings";

const AWAITING_SIGNATURE_STATUSES = ["sent", "viewed", "partially_signed"];

// Vercel Cron hits this once daily (vercel.json). No end-user session at
// all — authenticated by CRON_SECRET, which Vercel automatically sends
// as a Bearer token on scheduled invocations once that env var is set
// on the project (their own documented convention, not something this
// route has to wire up itself). Service-role client throughout, same
// reasoning as the public signing routes: no auth.uid() exists here for
// RLS to key off.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const settings = await getHicSettings(admin);

  let remindersSent = 0;
  let expired = 0;

  if (settings.remindersEnabled) {
    const reminderCutoff = new Date(Date.now() - settings.reminderDaysBetween * 24 * 60 * 60 * 1000).toISOString();

    const { data: candidates } = await admin
      .from("hic_signers")
      .select("id, hic_id, full_name, email, sent_at, token_expires_at, reminder_count, last_reminder_at")
      .in("status", ["sent", "viewed"])
      .not("sent_at", "is", null)
      .lt("reminder_count", settings.reminderMaxCount)
      .or(`last_reminder_at.is.null,last_reminder_at.lt.${reminderCutoff}`);

    const siteUrl = await getSiteUrl();

    for (const signer of candidates ?? []) {
      if (signer.token_expires_at && new Date(signer.token_expires_at) < new Date()) continue;

      const { data: hic } = await admin
        .from("hics")
        .select("id, status, language, sales_rep_name")
        .eq("id", signer.hic_id)
        .single();
      if (!hic || !AWAITING_SIGNATURE_STATUSES.includes(hic.status)) continue;

      // Fresh token on every automatic reminder too — no reason for a
      // reminder link to be weaker than a manual resend's.
      const { token, tokenHash } = generateSigningToken();
      const tokenExpiresAt = new Date(Date.now() + settings.linkExpirationDays * 24 * 60 * 60 * 1000).toISOString();
      await admin.from("hic_signers").update({ token_hash: tokenHash, token_expires_at: tokenExpiresAt }).eq("id", signer.id);

      const result = await sendHicEmail({
        emailType: "reminder",
        language: hic.language,
        to: signer.email,
        mergeFields: {
          signer_name: signer.full_name,
          rep_name: hic.sales_rep_name,
          sign_link: `${siteUrl}/sign/${signer.id}?t=${token}`,
        },
      });

      await admin
        .from("hic_signers")
        .update({ reminder_count: signer.reminder_count + 1, last_reminder_at: new Date().toISOString() })
        .eq("id", signer.id);
      await admin.from("hic_events").insert({
        hic_id: hic.id,
        signer_id: signer.id,
        event_type: "reminder_sent",
        new_value: result.ok ? null : result.error,
      });
      if (result.ok) remindersSent++;
    }
  }

  // Expiration pass — independent of the reminders toggle above, any
  // unsigned HIC whose link has simply run out of time moves to
  // 'expired' regardless of whether reminders were ever enabled for it.
  const { data: expiredSigners } = await admin
    .from("hic_signers")
    .select("hic_id")
    .not("status", "eq", "signed")
    .lt("token_expires_at", new Date().toISOString());

  const expiredHicIds = Array.from(new Set((expiredSigners ?? []).map((s) => s.hic_id)));
  for (const hicId of expiredHicIds) {
    const { count } = await admin
      .from("hics")
      .update({ status: "expired" }, { count: "exact" })
      .eq("id", hicId)
      .in("status", AWAITING_SIGNATURE_STATUSES);
    if (count) {
      await admin.from("hic_events").insert({ hic_id: hicId, event_type: "expired" });
      expired++;
    }
  }

  return NextResponse.json({ ok: true, remindersSent, expired });
}
