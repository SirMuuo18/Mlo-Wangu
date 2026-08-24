-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Admin & Customer Support Console
--
-- Adds the minimum new database surface the admin console needs, reusing
-- every existing table (profiles, payments, subscriptions,
-- meal_plan_entitlements, meal_plan_access_codes) as-is:
--
--   1. profiles.email — auth.users.email mirrored into profiles so the admin
--      user-search endpoint can filter server-side with a normal PostgREST
--      query instead of paging through the GoTrue admin API. Kept in sync by
--      trigger on both insert and email change. Client RLS is unaffected —
--      profiles_self_select/update already scope every row to its own owner,
--      so this column is exactly as private as the rest of the profile row
--      (i.e. a user can already see their own email; nothing new is exposed
--      cross-user).
--   2. support_notes — lightweight per-user support log (issue / action
--      taken / resolution), admin-authored.
--   3. admin_audit_log — append-only record of admin actions.
--
-- Both new tables follow the existing meal_plan_access_codes pattern: RLS is
-- enabled with NO client policies at all. They are only ever read or written
-- by the Express server via the service-role key, gated by requireAuth +
-- requireAdmin on every route that touches them — never directly by a user
-- or admin's own JWT.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── profiles.email ─────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND p.email IS DISTINCT FROM u.email;

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Extend the existing new-user trigger to also copy email at signup.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Keep profiles.email in sync if a user's auth email ever changes.
CREATE OR REPLACE FUNCTION sync_profile_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE profiles SET email = NEW.email, updated_at = NOW() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_profile_email();

-- ─── Support Notes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  admin_id     UUID NOT NULL REFERENCES profiles(id),
  issue        TEXT NOT NULL,
  action_taken TEXT,
  resolution   TEXT,
  resolved     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_notes_user ON support_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_support_notes_created ON support_notes(created_at DESC);

ALTER TABLE support_notes ENABLE ROW LEVEL SECURITY;
-- Intentionally NO client policies: support notes may reference account
-- issues and are only ever read/written by the server via the service-role
-- key, gated by requireAuth + requireAdmin.

-- ─── Admin Audit Log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID NOT NULL REFERENCES profiles(id),
  action          TEXT NOT NULL,
  target_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  result          TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success','failure')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
-- Intentionally NO client policies — server/service-role only. This table
-- must never accept a client-supplied admin_id/action/result: every insert
-- is written by the server itself immediately after independently verifying
-- requireAuth + requireAdmin for the action being logged, never from request
-- body fields.
