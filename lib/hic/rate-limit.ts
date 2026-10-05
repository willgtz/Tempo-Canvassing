import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 20;

// The public signing routes have no auth.uid() at all (genuinely
// anonymous), so there's no RLS-scoped way to rate-limit them — this is
// a plain counter table checked via the service-role client, case 2 in
// lib/supabase/admin.ts's exception list (the same reasoning that
// justifies the admin client for the rest of these public routes).
// Generous limits (20/min) — this exists to blunt obvious brute-forcing
// of a signer's token, not to throttle a real person clicking around a
// signing page.
export async function checkSigningRateLimit(signerId: string, ipAddress: string): Promise<boolean> {
  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();

  const { data: existing } = await admin
    .from("hic_signing_rate_limits")
    .select("id, request_count, window_start")
    .eq("signer_id", signerId)
    .eq("ip_address", ipAddress)
    .gte("window_start", windowStart)
    .order("window_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) {
    await admin.from("hic_signing_rate_limits").insert({ signer_id: signerId, ip_address: ipAddress });
    return true;
  }

  if (existing.request_count >= MAX_REQUESTS_PER_WINDOW) return false;

  await admin
    .from("hic_signing_rate_limits")
    .update({ request_count: existing.request_count + 1 })
    .eq("id", existing.id);
  return true;
}
