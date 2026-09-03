import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. This is a deliberate,
// narrow exception to "RLS is the enforcement boundary" used everywhere
// else in this app (see is_admin()/visible_zipcodes() in schema.sql).
//
// Four legitimate uses:
// 1. auth.admin.* calls (creating/deleting users) — creating an
//    auth.users row has no equivalent through the normal anon/session-
//    scoped client (Supabase's regular signUp() would sign the *current
//    browser* in as the new user, not just create their account).
// 2. Genuinely unauthenticated public writes (app/api/public/*) — RLS
//    policies all key off auth.uid(), which is null with no session, so
//    the normal client can't write anything at all here, not even
//    insecurely; there's no auth.uid()-scoped equivalent to fall back to.
// 3. A single, fully server-controlled write that a real RLS policy
//    deliberately blocks even for the caller's own data — e.g.
//    appointment_assignments writes are admin-only RLS (assigning a
//    closer is meant to stay an admin action), which also blocks a rep
//    from self-assigning as opener on an appointment they just created
//    themselves through the normal client. Only reach for this when
//    every value in the write is hardcoded server-side from the current
//    session/a row just created in the same request — never client-
//    supplied — so it can't be turned into writing arbitrary rows.
// 4. A single confirmed RLS *enforcement bug*, not a by-design
//    restriction (2026-09-03): appointments_insert's own policy text is
//    `created_by = auth.uid()` — textually correct, no admin-conditional
//    logic at all — yet a non-admin's insert with created_by set to
//    their own verified uid was reliably reproduced failing with "new row
//    violates row-level security policy for table appointments" through
//    the real PostgREST path (multiple real accounts, both a disposable
//    test rep and William's own super_admin account tested side by side;
//    admin succeeds, non-admin fails, same request shape, same JWT
//    structure — decoded and compared directly). Root cause not fully
//    isolated (behavior a plain SQL boolean can't produce on its own;
//    suspected Postgres/pooler-level prepared-statement or GUC-caching
//    quirk specific to this policy, not anything in this app's code or
//    the policy definition itself). Used only for the appointments INSERT
//    itself in submitAppointment/addMyManualAppointment — every value
//    still comes from the caller's own already-verified session, same
//    "never client-supplied" rule as case 3.
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
