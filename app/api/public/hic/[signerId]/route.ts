import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashSigningToken } from "@/lib/hic/signing-token";
import { getHicSignedUrl } from "@/lib/hic/storage";
import { resolveSignerFields } from "@/lib/hic/pdf/resolve-signer-fields";
import { checkSigningRateLimit } from "@/lib/hic/rate-limit";
import { getClientIp } from "@/lib/hic/request-info";
import type { Hic } from "@/app/appointments/send-hic/types";

const SIGNING_DOCUMENT_URL_EXPIRES_SECONDS = 60 * 60 * 24; // 24 hours

// Genuinely public, unauthenticated — no requireSession anywhere in this
// route. Uses the service-role client throughout (case 2 in
// lib/supabase/admin.ts's exception list: no auth.uid() exists here at
// all for RLS to key off), gated instead by the signer's own hashed
// token, re-verified on every call. Never returns another signer's data
// — only this one signer's own role-scoped fields.
export async function GET(request: Request, { params }: { params: Promise<{ signerId: string }> }) {
  const { signerId } = await params;
  const token = new URL(request.url).searchParams.get("t");
  if (!token) return NextResponse.json({ error: "Missing signing token." }, { status: 400 });

  const ip = getClientIp(request);
  const allowed = await checkSigningRateLimit(signerId, ip);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

  const admin = createAdminClient();

  const { data: signer, error: signerError } = await admin
    .from("hic_signers")
    .select("id, hic_id, role, full_name, email, status, token_hash, token_expires_at")
    .eq("id", signerId)
    .single();
  if (signerError || !signer) return NextResponse.json({ error: "Signing link not found." }, { status: 404 });

  if (hashSigningToken(token) !== signer.token_hash) {
    return NextResponse.json({ error: "Invalid signing link." }, { status: 403 });
  }
  if (signer.token_expires_at && new Date(signer.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "This signing link has expired." }, { status: 410 });
  }

  const { data: hic, error: hicError } = await admin.from("hics").select("*").eq("id", signer.hic_id).single();
  if (hicError || !hic) return NextResponse.json({ error: "HIC not found." }, { status: 404 });

  if (hic.status === "voided") return NextResponse.json({ error: "This HIC has been voided." }, { status: 410 });
  if (hic.status === "declined") {
    return NextResponse.json({ error: "This HIC was declined and can no longer be signed." }, { status: 410 });
  }
  if (signer.status === "declined") {
    return NextResponse.json({ error: "You previously declined to sign this document." }, { status: 410 });
  }

  // First view — record it, bump the parent HIC's status if this is the
  // first time anyone's opened it at all.
  if (signer.status === "pending") {
    await admin
      .from("hic_signers")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", signer.id);
    if (hic.status === "sent") {
      await admin.from("hics").update({ status: "viewed" }).eq("id", hic.id);
    }
    await admin.from("hic_events").insert({
      hic_id: hic.id,
      signer_id: signer.id,
      event_type: "viewed",
      metadata: { ip, user_agent: request.headers.get("user-agent") },
    });
  }

  let documentUrl: string;
  try {
    // Long-lived on purpose: the signing page remounts every page canvas
    // (re-fetching this URL) when the customer moves from "review" past
    // "adopt signature" into "sign", and pdf.js also fetches byte ranges
    // lazily. With the old 5-minute default, anyone who spent more than
    // five minutes reading got a 400 from Storage on every page.
    documentUrl = await getHicSignedUrl(`generated/${hic.id}/draft.pdf`, SIGNING_DOCUMENT_URL_EXPIRES_SECONDS);
  } catch {
    return NextResponse.json({ error: "The document package isn't ready yet. Try again shortly." }, { status: 503 });
  }

  const { fields, totalPageCount } = await resolveSignerFields(
    hic as Hic,
    signer.role as "homeowner" | "co_borrower"
  );

  return NextResponse.json({
    hic: { customerName: hic.customer_name, hasCoBorrower: hic.has_co_borrower, language: hic.language },
    signer: { id: signer.id, role: signer.role, fullName: signer.full_name, status: signer.status === "pending" ? "viewed" : signer.status },
    documentUrl,
    pageCount: totalPageCount,
    fields,
  });
}
