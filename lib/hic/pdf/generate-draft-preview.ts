import "server-only";
import { PDFDocument } from "pdf-lib";
import { fillHicPackage } from "./fill-hic-package";
import { uploadHicDocument, getHicSignedUrl } from "../storage";
import type { Hic, HicSigner } from "@/app/appointments/send-hic/types";

export type DraftPreview = { url: string; pageCount: number };

// Merges every applicable document in the package into one PDF, saved
// to generated/{hic_id}/draft.pdf — used both for a rep-facing preview
// (the review screen, before anyone has signed) and, once `signers` is
// passed, to re-stamp this same path after each signature, so the
// public signing page's GET route always has an up-to-date "what's been
// signed so far" view at a fixed, predictable path. Distinct from Phase
// 3's complete-hic.ts, which does a similar merge for the FINAL signed
// version and additionally appends the certificate of completion page.
export async function generateDraftPreview(hic: Hic, signers: HicSigner[] = []): Promise<DraftPreview> {
  const documents = await fillHicPackage(hic, signers);

  const merged = await PDFDocument.create();
  for (const doc of documents) {
    const src = await PDFDocument.load(doc.bytes);
    const copiedPages = await merged.copyPages(src, src.getPageIndices());
    copiedPages.forEach((p) => merged.addPage(p));
  }
  const mergedBytes = await merged.save();

  const storagePath = `generated/${hic.id}/draft.pdf`;
  await uploadHicDocument(storagePath, mergedBytes);
  const url = await getHicSignedUrl(storagePath);
  return { url, pageCount: merged.getPageCount() };
}
