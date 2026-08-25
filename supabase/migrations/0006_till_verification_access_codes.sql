-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Till payment verification → access code issuance
--
-- Adds an explicit admin REJECT outcome for manually-submitted Till payments
-- (distinct from a Daraja-side 'failed'/'cancelled', which only ever apply to
-- STK push), plus who verified/rejected a payment and why. Also links a
-- Till-verified meal-plan-generation payment to the exactly-one access code
-- it produces (server/admin-db.ts's verifyTillPayment), reusing the existing
-- meal_plan_access_codes table/7-day-expiry trigger from migration 0003
-- rather than a second access-code mechanism.
--
-- All changes are additive — no column is dropped, no row is deleted, no
-- existing constraint is narrowed.
-- ─────────────────────────────────────────────────────────────────────────────

-- Widen payments.status to allow an explicit admin rejection. Verified
-- against the live project that the auto-generated constraint name for
-- schema.sql's original unnamed inline CHECK is exactly this.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending','success','failed','cancelled','expired','rejected'));

-- Who verified/rejected a manually-submitted payment, and why (rejection
-- only). NULL for STK-push payments, which are verified by the real Daraja
-- callback, not an admin.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Links a Till-verified meal-plan-generation payment to the access code it
-- produced. NULL for a manually-issued support code (admin-db.ts's existing
-- issueAccessCode) or any non-Till-verification code. The unique partial
-- index guarantees a given payment can never back more than one code, even
-- under concurrent/duplicate verification attempts.
ALTER TABLE meal_plan_access_codes ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_codes_payment_unique
  ON meal_plan_access_codes(payment_id) WHERE payment_id IS NOT NULL;

-- ─── Email delivery log ─────────────────────────────────────────────────────
-- Records every attempt to send a transactional email (currently: access-code
-- delivery/resend). Never stores the email body/code itself — recipient,
-- type, and outcome only. Service-role only, same lockdown pattern as
-- admin_audit_log/support_notes: RLS enabled, zero client policies.
CREATE TABLE IF NOT EXISTS email_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recipient           TEXT NOT NULL,
  email_type          TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('sent','failed','not_configured')),
  related_payment_id  UUID REFERENCES payments(id),
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_payment ON email_log(related_payment_id);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: only the service-role key (server) can ever
-- read or write this table, mirroring admin_audit_log/support_notes.
