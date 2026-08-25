-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — store the full pasted M-Pesa confirmation SMS on Till payments
--
-- The Till submission form now accepts the customer's full M-Pesa
-- confirmation message (not just the short transaction code) — the
-- transaction code is extracted from it server-side
-- (server/mpesa.ts's extractMpesaCodeFromMessage) and still stored/used
-- exactly as before (payments.mpesa_receipt, the uniqueness guard, the
-- existing admin confirm/verify flow). This column additionally stores the
-- raw pasted text so an admin reviewing the submission has the full context
-- Safaricom sent the customer, not just the isolated code.
--
-- Additive only — no data loss, no existing column touched.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_raw_message TEXT;
