-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Access codes: database-authoritative 7-day expiry
--
-- Previously expires_at was nullable with no default, so a code created
-- without an explicit expiry (e.g. a raw SQL-editor insert) would never
-- expire — contradicting the product rule that every issued access code is
-- valid for exactly 7 days from issuance. This migration makes the database
-- itself enforce that rule regardless of what any application/admin code
-- does or omits:
--
--   * New trigger (BEFORE INSERT OR UPDATE): if expires_at is left NULL, it
--     is set to created_at + 7 days. If expires_at is explicitly supplied
--     and is LATER than created_at + 7 days, it is clamped down to
--     created_at + 7 days — no row can ever end up with a longer expiry, no
--     matter what value application code (or a future admin API) tries to
--     write, and no later UPDATE can extend it either. A shorter/earlier
--     expires_at (e.g. an already-expired code seeded for a test) is left
--     untouched — the trigger only enforces a 7-day ceiling, it does not
--     force every code to live the full 7 days.
--   * Existing NULL rows are backfilled to created_at + 7 days, then the
--     column is made NOT NULL so "never expires" can no longer exist.
--
-- Redemption enforcement (server/db-supabase.ts claimAccessCodeUse) already
-- reads expires_at fresh from the row on every redemption and rejects if it
-- is in the past — that logic is unchanged; this migration guarantees the
-- value it reads can never be "no expiry" or "more than 7 days out."
-- ─────────────────────────────────────────────────────────────────────────────

-- Backfill first so the NOT NULL constraint below never fails on existing rows.
UPDATE meal_plan_access_codes
SET expires_at = created_at + INTERVAL '7 days'
WHERE expires_at IS NULL;

ALTER TABLE meal_plan_access_codes
  ALTER COLUMN expires_at SET NOT NULL;

CREATE OR REPLACE FUNCTION cap_access_code_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at > NEW.created_at + INTERVAL '7 days' THEN
    NEW.expires_at := NEW.created_at + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cap_access_code_expiry ON meal_plan_access_codes;
CREATE TRIGGER trg_cap_access_code_expiry
  BEFORE INSERT OR UPDATE ON meal_plan_access_codes
  FOR EACH ROW EXECUTE FUNCTION cap_access_code_expiry();
