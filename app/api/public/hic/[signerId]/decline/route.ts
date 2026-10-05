import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashSigningToken } from "@/lib/hic/signing-token";
import { sendHicEmail } from "@/lib/hic/send-email";
import { checkSigningRateLimit } from "@/lib/hic/rate-limit";
import { getClientIp, getUserAgent } from "@/lib/hic/request-info";

type DeclineBody = { token: string; reason?: string };

// Declining invalidates the whole HIC, not just this signer's own link —
// a partially-executed contract isn't valid, so the other signer's link
// is implicitly cut off too (the sibling GET/sign routes both reject
// once hics.status = 'declined').
export async function POST(request: Request, { params }: { params: Promise<{ signerId: string }> }) {
  const { signerId } = await params;

  const ip = getClientIp(request);
  const allowed = await checkSigningRateLimit(signerId, ip);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

  let body: DeclineBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.token) return NextResponse.json({ error: "Missing signing token." }, { status: 400 });

  const admin = createAdminClient();

  const { data: signer, error: signerError } = await admin
    .from("hic_signers")
    .select("id, hic_id, role, full_name, token_hash, status")
    .eq("id", signerId)
    .single();
  if (signerError || !signer) return NextResponse.json({ error: "Signing link not found." }, { status: 404 });

  if (hashSigningToken(body.token) !== signer.token_hash) {
    return NextResponse.json({ error: "Invalid signing link." }, { status: 403 });
  }
  if (signer.status === "signed") return NextResponse.json({ error: "You've already signed this document." }, { status: 409 });

  const { data: hic, error: hicError } = await admin
    .from("hics")
    .select("id, customer_name, language, created_by, status")
    .eq("id", signer.hic_id)
    .single();
  if (hicError || !hic) return NextResponse.json({ error: "HIC not found." }, { status: 404 });
  if (hic.status === "voided" || hic.status === "declined") {
    return NextResponse.json({ ok: true }); // already in a terminal state, nothing more to do
  }

  const now = new Date().toISOString();
  await admin
    .from("hic_signers")
    .update({ status: "declined", declined_at: now, decline_reason: body.reason ?? null, ip_address: ip, user_agent: getUserAgent(request) })
    .eq("id", signer.id);
  await admin.from("hics").update({ status: "declined", declined_at: now }).eq("id", hic.id);
  await admin.from("hic_events").insert({
    hic_id: hic.id,
    signer_id: signer.id,
    event_type: "declined",
    new_value: body.reason ?? null,
    metadata: { ip, user_agent: getUserAgent(request) },
  });

  const { data: rep } = await admin.from("profiles").select("email").eq("id", hic.created_by).single();
  if (rep?.email) {
    await sendHicEmail({
      emailType: "declined_notify",
      language: hic.language,
      to: rep.email,
      mergeFields: { customer_name: hic.customer_name, decline_reason: body.reason ?? "No reason given" },
    });
  }

  return NextResponse.json({ ok: true });
}
