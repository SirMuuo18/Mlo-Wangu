-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Close the profiles.is_premium / premium_expiry self-escalation gap
--
-- Same underlying hole as migration 0002 (profiles_self_update is USING-only,
-- no WITH CHECK, no column restriction), but for the two fields that actually
-- grant paid access: a normal authenticated user calling Supabase directly
-- with their own JWT and the anon key (exactly what Expo will start doing)
-- could UPDATE their own is_premium/premium_expiry, bypassing payment
-- entirely. Verified live against the project in .env before this migration
-- was written (server/scripts/check-premium-self-escalation.mjs) — the
-- direct update succeeded prior to this fix.
--
-- Legitimate grants are unaffected: createOrExtendSubscription in
-- server/db-supabase.ts writes these columns using the service-role key,
-- which this trigger always allows through (auth.role() = 'service_role').
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_premium_self_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.is_premium IS DISTINCT FROM OLD.is_premium THEN
      NEW.is_premium := OLD.is_premium;
    END IF;
    IF NEW.premium_expiry IS DISTINCT FROM OLD.premium_expiry THEN
      NEW.premium_expiry := OLD.premium_expiry;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_premium_self_escalation ON profiles;
CREATE TRIGGER trg_prevent_premium_self_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_premium_self_escalation();
