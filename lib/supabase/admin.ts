import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. This is a deliberate,
// narrow exception to "RLS is the enforcement boundary" used everywhere
// else in this app (see is_admin()/visible_zipcodes() in schema.sql).
//
// Two legitimate uses:
// 1. auth.admin.* calls (creating/deleting users) — creating an
//    auth.users row has no equivalent through the normal anon/session-
//    scoped client (Supabase's regular signUp() would sign the *current
//    browser* in as the new user, not just create their account).
// 2. Genuinely unauthenticated public writes (app/api/public/*) — RLS
//    policies all key off auth.uid(), which is null with no session, so
//    the normal client can't write anything at all here, not even
//    insecurely; there's no auth.uid()-scoped equivalent to fall back to.
// Every other read/write — including from an authenticated session, even
// an admin one — must go through lib/supabase/server.ts so RLS actually
// applies. Don't reach for this just because a normal RLS-scoped query
// would be more code to write.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
