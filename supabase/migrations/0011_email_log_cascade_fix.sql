-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — email_log.related_payment_id cascade fix
--
-- Phase 3A incidental finding, now load-bearing for Phase 3B's account-
-- deletion feature: email_log_related_payment_id_fkey (confirmed via a
-- live pg_constraint query against the actual project — not assumed from
-- schema.sql) has no ON DELETE clause at all, unlike every other
-- payment-dependent table (meal_plan_entitlements, meal_plan_access_codes
-- already cascade). Deleting a payment that ever had an access-code email
-- sent against it fails with a foreign-key violation.
--
-- Fix: ON DELETE SET NULL, matching email_log.user_id's existing behavior
-- (email_log_user_id_fkey already uses SET NULL) — an email-delivery audit
-- record should outlive the payment it referenced, not be destroyed by it
-- (CASCADE would be wrong here: it would silently erase delivery history).
--
-- Compatible with all existing data: SET NULL only ever takes effect on a
-- future payment deletion; no current row is affected. No JSON dev-mode
-- equivalent exists (email_log is Supabase-only, like payments).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE email_log DROP CONSTRAINT IF EXISTS email_log_related_payment_id_fkey;
ALTER TABLE email_log
  ADD CONSTRAINT email_log_related_payment_id_fkey
  FOREIGN KEY (related_payment_id) REFERENCES payments(id) ON DELETE SET NULL;
