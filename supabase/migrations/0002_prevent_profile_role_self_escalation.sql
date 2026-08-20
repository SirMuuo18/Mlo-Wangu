-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Close the profiles.role self-escalation gap
-- The profiles_self_update RLS policy (USING only, no WITH CHECK) technically
-- allows a normal authenticated user to UPDATE any column on their own
-- profiles row, including `role`, if they ever call Supabase directly with
-- their own JWT. The app never does this today (all admin-role reads/writes
-- go through the Express server using the service-role key), but this closes
-- the gap at the database layer too, independent of the application code.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_profile_role_self_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.role() <> 'service_role' THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_self_escalation ON profiles;
CREATE TRIGGER trg_prevent_profile_role_self_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_profile_role_self_escalation();
