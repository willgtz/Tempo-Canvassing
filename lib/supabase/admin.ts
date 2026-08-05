import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. This is a deliberate,
// narrow exception to "RLS is the enforcement boundary" used everywhere
// else in this app (see is_admin()/visible_zipcodes() in schema.sql).
//
// It exists only because creating an auth.users row has no equivalent
// through the normal anon/session-scoped client: Supabase's regular
// signUp() would sign the *current browser* in as the new user, not just
// create their account. Use this ONLY for auth.admin.* calls (creating or
// deleting users). Every other read/write — including the matching
// `profiles` row — must go through lib/supabase/server.ts so RLS actually
// applies.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
