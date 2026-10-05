import "server-only";
import { headers } from "next/headers";

// Same resolution order as app/admin/reps/actions.ts's own getSiteUrl —
// duplicated rather than imported across unrelated action files, but
// kept identical in behavior: prefer the explicit env var (set in
// Vercel), fall back to the actual request host for local dev.
export async function getSiteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
