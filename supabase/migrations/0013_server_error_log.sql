-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Server-side error log (Phase 3B, item 15)
--
-- Every error path in server.ts today is a bare console.error, invisible
-- outside a live terminal. This table gives admins visibility into a
-- deliberately small set of high-value failure points (payment callback
-- errors, admin verification failures) — NOT a blanket rewrite of every
-- console.error in the file, which bounds write volume by construction
-- rather than needing a rate limiter on the write path itself.
--
-- Sanitization is an allowlist discipline enforced in application code
-- (server/errorLog.ts): every call site builds a small, explicit
-- {message, context} object by hand — the raw Error object, req.body, and
-- req.headers are never passed in. This table must never become a place
-- where a password, token, PIN, or raw M-Pesa message ends up.
--
-- Service-role only, same lockdown pattern as email_log/admin_audit_log.
-- user_id uses ON DELETE SET NULL (matches email_log.user_id) — an error
-- record is an operational/audit artifact that should survive the user
-- account it happened to reference, not be destroyed by its deletion.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS server_error_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id  UUID NOT NULL DEFAULT gen_random_uuid(),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  route           TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('error', 'warning')),
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message         TEXT NOT NULL,
  context         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_server_error_log_occurred ON server_error_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_error_log_user ON server_error_log(user_id);

ALTER TABLE server_error_log ENABLE ROW LEVEL SECURITY;
-- Intentionally no client policies: service-role only, same as email_log.
