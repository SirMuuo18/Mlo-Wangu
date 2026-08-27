-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Access-code & Premium expiry warnings (Phase 3B, item 4)
--
-- No cron/scheduled-job infrastructure exists in this codebase (confirmed
-- again before writing this migration) — these warnings are checked lazily
-- inside GET /api/auth/me, which both web and mobile already call on
-- effectively every app open. expiry_warned_at is the deduplication marker:
-- once set, that specific credential is never warned about again, so
-- repeated /api/auth/me calls (which happen constantly) never spam.
--
-- Additive only. NULL for every existing row (nothing has been warned about
-- yet, which is correct — no warning has ever been sent before this).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE meal_plan_access_codes ADD COLUMN IF NOT EXISTS expiry_warned_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expiry_warned_at TIMESTAMPTZ;
