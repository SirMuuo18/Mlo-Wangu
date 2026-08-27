-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Server-computed budget-digest push (Phase 3B, item 3)
--
-- Same "no cron" constraint as item 4: budget_digest_last_sent_at is the
-- dedup marker checked/updated inside GET /api/auth/me (the same existing,
-- already-authenticated trigger point item 4 uses) — a user who never opens
-- the app never gets a digest, which is the same limitation every other
-- server-triggered-on-request feature in this codebase already has, not a
-- new one. budget_digest_enabled defaults false (opt-in, never on by default).
--
-- Additive only. Not protected by the premium-self-escalation trigger
-- (migration 0009) because that trigger only guards is_premium/
-- premium_expiry — a user opting themselves into/out of their own digest
-- preference is not a privilege escalation of any kind, and this column is
-- only ever written by server.ts via the service-role key anyway (the
-- client never has a direct write path to profiles at all).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS budget_digest_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS budget_digest_last_sent_at TIMESTAMPTZ;
