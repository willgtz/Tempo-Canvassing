import "server-only";
import { randomBytes, createHash } from "crypto";

// Long random token in the signing URL itself (/sign/{signerId}?t={token})
// — only its SHA-256 hash is ever stored, per spec ("stored HASHED, no
// customer data in URL"). The URL carries no name/email/anything else,
// just an opaque signerId + token pair.
export function generateSigningToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSigningToken(token);
  return { token, tokenHash };
}

export function hashSigningToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type SignerTokenHashes = { token_hash: string; previous_token_hashes?: string[] | null };

// Resends and reminders mint a new token but keep the old hashes, so a
// link from ANY email this signer received keeps working (customers tap
// the first email in the thread, or still have the page open when the
// rep resends). Expiry and void/signed checks are the routes' job.
export function signingTokenMatches(token: string, signer: SignerTokenHashes): boolean {
  const hash = hashSigningToken(token);
  return hash === signer.token_hash || (signer.previous_token_hashes ?? []).includes(hash);
}

// The update payload for giving a signer a new token without
// invalidating the links already sent to them.
export function rotatedTokenColumns(signer: SignerTokenHashes, newTokenHash: string, tokenExpiresAt: string) {
  return {
    token_hash: newTokenHash,
    previous_token_hashes: [...(signer.previous_token_hashes ?? []), signer.token_hash],
    token_expires_at: tokenExpiresAt,
  };
}
