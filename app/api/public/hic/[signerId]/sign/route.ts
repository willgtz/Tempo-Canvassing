import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashSigningToken } from "@/lib/hic/signing-token";
import { generateDraftPreview } from "@/lib/hic/pdf/generate-draft-preview";
import { completeHic } from "@/lib/hic/pdf/complete-hic";
import { resolveSignerFields } from "@/lib/hic/pdf/resolve-signer-fields";
import { uploadHicDocument, getHicSignedUrl } from "@/lib/hic/storage";
import { sendHicEmail } from "@/lib/hic/send-email";
import { checkSigningRateLimit } from "@/lib/hic/rate-limit";
import { getClientIp, getUserAgent } from "@/lib/hic/request-info";
import type { Hic, HicSigner } from "@/app/appointments/send-hic/types";

type SignBody = {
  token: string;
  consent: boolean;
  signatureType: "typed" | "drawn";
  signatureText?: string;
  signatureImageDataUrl?: string;
  initialsText?: string;
  initialsImageDataUrl?: string;
};

function decodeDataUrlPng(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

// Genuinely public, unauthenticated — same reasoning/boundary as the
// sibling GET route (service-role client throughout, gated by the
// signer's own hashed token re-verified here independently, never
// trusting that a prior GET already checked it).
export async function POST(request: Request, { params }: { params: Promise<{ signerId: string }> }) {
  const { signerId } = await params;

  const ip = getClientIp(request);
  const allowed = await checkSigningRateLimit(signerId, ip);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

  let body: SignBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.token) return NextResponse.json({ error: "Missing signing token." }, { status: 400 });
  if (!body.consent) {
    return NextResponse.json({ error: "You must agree to use electronic records and signatures." }, { status: 400 });
  }
  if (body.signatureType === "typed" && !body.signatureText?.trim()) {
    return NextResponse.json({ error: "A typed signature is required." }, { status: 400 });
  }
  if (body.signatureType === "drawn" && !body.signatureImageDataUrl) {
    return NextResponse.json({ error: "A drawn signature is required." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: signer, error: signerError } = await admin
    .from("hic_signers")
    .select("*")
    .eq("id", signerId)
    .single();
  if (signerError || !signer) return NextResponse.json({ error: "Signing link not found." }, { status: 404 });

  if (hashSigningToken(body.token) !== signer.token_hash) {
    return NextResponse.json({ error: "Invalid signing link." }, { status: 403 });
  }
  if (signer.token_expires_at && new Date(signer.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "This signing link has expired." }, { status: 410 });
  }
  if (signer.status === "signed") return NextResponse.json({ error: "You've already signed this document." }, { status: 409 });
  if (signer.status === "declined") return NextResponse.json({ error: "You previously declined to sign this document." }, { status: 410 });

  const { data: hicRow, error: hicError } = await admin.from("hics").select("*").eq("id", signer.hic_id).single();
  if (hicError || !hicRow) return NextResponse.json({ error: "HIC not found." }, { status: 404 });
  if (hicRow.status === "voided") return NextResponse.json({ error: "This HIC has been voided." }, { status: 410 });
  if (hicRow.status === "declined") return NextResponse.json({ error: "This HIC was declined." }, { status: 410 });

  const hic = hicRow as Hic;

  // Required fields need all of this signer's required signature/
  // initials fields to actually be present on the package before
  // letting them finish — the template data already tells us whether
  // this signer even has an initials field at all.
  const { fields: requiredFields } = await resolveSignerFields(hic, signer.role as "homeowner" | "co_borrower");
  const needsInitials = requiredFields.some((f) => f.fieldType === "initials");
  if (needsInitials) {
    if (body.signatureType === "typed" && !body.initialsText?.trim()) {
      return NextResponse.json({ error: "Initials are required." }, { status: 400 });
    }
    if (body.signatureType === "drawn" && !body.initialsImageDataUrl) {
      return NextResponse.json({ error: "Initials are required." }, { status: 400 });
    }
  }

  let signatureStoragePath: string | null = null;
  let initialsStoragePath: string | null = null;
  if (body.signatureType === "drawn" && body.signatureImageDataUrl) {
    const bytes = decodeDataUrlPng(body.signatureImageDataUrl);
    if (!bytes) return NextResponse.json({ error: "Invalid signature image." }, { status: 400 });
    signatureStoragePath = `signatures/${signer.id}/signature.png`;
    await uploadHicDocument(signatureStoragePath, bytes, "image/png");
  }
  if (body.signatureType === "drawn" && body.initialsImageDataUrl) {
    const bytes = decodeDataUrlPng(body.initialsImageDataUrl);
    if (!bytes) return NextResponse.json({ error: "Invalid initials image." }, { status: 400 });
    initialsStoragePath = `signatures/${signer.id}/initials.png`;
    await uploadHicDocument(initialsStoragePath, bytes, "image/png");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("hic_signers")
    .update({
      status: "signed",
      signed_at: now,
      consent_at: now,
      signature_type: body.signatureType,
      signature_text: body.signatureType === "typed" ? body.signatureText : null,
      signature_storage_path: signatureStoragePath,
      initials_text: body.signatureType === "typed" ? body.initialsText ?? null : null,
      initials_storage_path: initialsStoragePath,
      ip_address: ip,
      user_agent: getUserAgent(request),
    })
    .eq("id", signer.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.from("hic_events").insert({
    hic_id: hic.id,
    signer_id: signer.id,
    event_type: "signed",
    metadata: { ip, user_agent: getUserAgent(request) },
  });

  const { data: allSignerRows } = await admin.from("hic_signers").select("*").eq("hic_id", hic.id);
  const allSigners = (allSignerRows ?? []) as HicSigner[];
  const allSigned = allSigners.every((s) => s.status === "signed");
  const anySigned = allSigners.some((s) => s.status === "signed");

  if (allSigned) {
    const { storagePath, sha256 } = await completeHic(hic, allSigners);
    await admin
      .from("hics")
      .update({
        status: "signed",
        completed_at: new Date().toISOString(),
        final_pdf_storage_path: storagePath,
        final_pdf_sha256: sha256,
      })
      .eq("id", hic.id);
    await admin.from("hic_events").insert({ hic_id: hic.id, event_type: "completed" });

    // Completion emails — attachment under 8MB, else a secure download
    // link, per spec. Best-effort per recipient: a failed email doesn't
    // un-complete the HIC, which is already real and fully signed.
    let downloadUrl: string;
    try {
      downloadUrl = await getHicSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days
    } catch {
      downloadUrl = "";
    }
    for (const s of allSigners) {
      await sendHicEmail({
        emailType: "signed_confirmation",
        language: hic.language,
        to: s.email,
        mergeFields: { signer_name: s.full_name, download_link: downloadUrl },
      });
    }
  } else if (anySigned && hic.status !== "partially_signed") {
    await admin.from("hics").update({ status: "partially_signed" }).eq("id", hic.id);
    // Keep the shared draft preview current even mid-signing, so anyone
    // who re-opens their link (or an admin previewing progress) sees
    // this signer's contribution already reflected.
    await generateDraftPreview(hic, allSigners);
  } else {
    await generateDraftPreview(hic, allSigners);
  }

  return NextResponse.json({ ok: true, completed: allSigned });
}
