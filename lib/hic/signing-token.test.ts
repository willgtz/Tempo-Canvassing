import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateSigningToken, rotatedTokenColumns, signingTokenMatches } = await import("./signing-token");

describe("signing token rotation", () => {
  it("keeps every earlier link valid after resends", () => {
    const first = generateSigningToken();
    let signer = { token_hash: first.tokenHash, previous_token_hashes: [] as string[] };

    const second = generateSigningToken();
    signer = { ...signer, ...rotatedTokenColumns(signer, second.tokenHash, "2026-10-27T00:00:00Z") };
    const third = generateSigningToken();
    signer = { ...signer, ...rotatedTokenColumns(signer, third.tokenHash, "2026-10-27T00:00:00Z") };

    expect(signingTokenMatches(first.token, signer)).toBe(true);
    expect(signingTokenMatches(second.token, signer)).toBe(true);
    expect(signingTokenMatches(third.token, signer)).toBe(true);
  });

  it("rejects a token this signer was never sent", () => {
    const sent = generateSigningToken();
    const other = generateSigningToken();
    expect(signingTokenMatches(other.token, { token_hash: sent.tokenHash, previous_token_hashes: null })).toBe(false);
  });
});
