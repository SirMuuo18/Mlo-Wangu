-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Push-notification token registry (Phase 3B, item 1 foundation)
--
-- Stores one row per registered Expo push token. Unique on `token` alone
-- (not `user_id, token`) — a physical device's push token is stable per app
-- installation regardless of which account is signed in, so re-registering
-- the same token under a different user must replace the old owner's row,
-- never leave two rows pointing at the same device. This is a deliberate
-- security decision: it guarantees a push can never be misdirected to a
-- device now used by a different account after a logout/account switch.
--
-- Service-role only, same lockdown pattern as email_log/admin_audit_log —
-- no client-readable policy. All access goes through server.ts's
-- requireAuth-gated /api/push/* routes, which scope every read/write to the
-- caller's own verified userId.
--
-- No JSON dev-mode equivalent (Supabase-only, like payments/email_log) —
-- push delivery has no meaning in local JSON-store dev mode.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally no client policies: service-role only, same as email_log.
