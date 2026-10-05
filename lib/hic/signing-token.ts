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
