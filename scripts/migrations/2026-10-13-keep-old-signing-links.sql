-- ============================================================
-- MIGRATION (2026-10-13): Resends/reminders no longer kill older links
--
-- Every manual resend and automatic reminder mints a fresh signing token
-- and used to overwrite hic_signers.token_hash, so the link in every
-- earlier email instantly answered "Invalid signing link." Customers
-- routinely tap the first email in the thread (or still have the page
-- open while the rep resends) — that's what Gema's customer hit.
--
-- Rotation now appends the outgoing hash here instead of discarding it;
-- the public signing routes accept the current hash or any of these.
-- Expiry (token_expires_at) and void/decline/signed checks still apply
-- to every link exactly as before.
-- ============================================================

alter table hic_signers
  add column if not exists previous_token_hashes text[] not null default '{}';
