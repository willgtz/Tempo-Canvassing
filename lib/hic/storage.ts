import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "hic-documents";

// This is the first private Storage bucket in the app (the only
// precedent, slideshow-media, is public) — there's no storage-level RLS
// policy for it at all, by design. Every call here goes through the
// service-role admin client, which is only safe because every caller is
// expected to have already verified (via a normal RLS-scoped query) that
// the current session owns the relevant HIC, or is admin, *before*
// reaching for this module — mirrored on the reasoning in
// lib/supabase/admin.ts's own documented exception list. Never expose
// this module's functions to a code path that hasn't already done that
// check.
export async function uploadHicDocument(
  path: string,
  bytes: Uint8Array,
  contentType = "application/pdf"
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Failed to upload ${path}: ${error.message}`);
}

export async function downloadHicDocument(path: string): Promise<Uint8Array> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Failed to download ${path}: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function getHicSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Failed to sign URL for ${path}: ${error?.message}`);
  return data.signedUrl;
}
