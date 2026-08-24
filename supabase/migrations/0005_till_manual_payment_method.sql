-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — M-Pesa Till (Buy Goods) manual-entry payment method
--
-- Adds a second way to pay alongside the existing STK Push: the user pays
-- via "Lipa na M-Pesa > Buy Goods" to the business Till number using their
-- own phone, then submits the M-Pesa transaction code back into the app.
-- Unlike STK Push, this is never auto-verified against Daraja — the
-- payment is created as 'pending' and only an admin (via the existing
-- admin payment-confirm flow, already gated by requireAuth + requireAdmin)
-- can move it to 'success' and trigger entitlement/subscription creation.
-- The consumer can never mark their own payment as successful.
--
-- payment_method distinguishes the two so the admin console can show which
-- ones need manual verification. Existing rows (all STK-push) default to
-- 'stk_push'.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'stk_push'
  CHECK (payment_method IN ('stk_push', 'till_manual'));

CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);
