-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — "Generate New Plan" payment/access-code gate
-- One KSh 50 payment or one valid access code = one new weekly meal-plan
-- generation. Separate from Premium subscriptions — does not touch
-- subscriptions or profiles.is_premium.
-- ─────────────────────────────────────────────────────────────────────────────

-- payments.plan_type currently only allows 'weekly'/'monthly' (subscription
-- plans). Widen it to also allow the meal-plan-generation purchase, which is
-- a payment row like any other but is never linked to a subscription.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_plan_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_plan_type_check
  CHECK (plan_type IN ('weekly','monthly','meal_plan_generation'));

-- ─── Access Codes ───────────────────────────────────────────────────────────
-- Alternative to paying KSh 50. Never store the plaintext code — only a
-- SHA-256 hash. user_id NULL = usable by any authenticated user (up to
-- max_uses); non-NULL = bound to one specific user.
CREATE TABLE IF NOT EXISTS meal_plan_access_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash    TEXT NOT NULL UNIQUE,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  active       BOOLEAN NOT NULL DEFAULT true,
  expires_at   TIMESTAMPTZ,
  max_uses     INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count   INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_codes_hash ON meal_plan_access_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_access_codes_user ON meal_plan_access_codes(user_id);

-- ─── Entitlements ───────────────────────────────────────────────────────────
-- One row = one unconsumed right to generate one new weekly meal plan.
-- Created only by the server: after a verified successful Daraja callback
-- (source='payment') or a verified access-code redemption (source='access_code').
-- used_at is set atomically by the generate endpoint's claim step — the
-- concurrency/idempotency guard against double-consumption.
CREATE TABLE IF NOT EXISTS meal_plan_entitlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN ('payment','access_code')),
  payment_id      UUID REFERENCES payments(id),
  access_code_id  UUID REFERENCES meal_plan_access_codes(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  used_at         TIMESTAMPTZ,
  CHECK (
    (source = 'payment' AND payment_id IS NOT NULL AND access_code_id IS NULL) OR
    (source = 'access_code' AND access_code_id IS NOT NULL AND payment_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON meal_plan_entitlements(user_id);
-- Fast lookup for "does this user have an unconsumed, unexpired entitlement".
CREATE INDEX IF NOT EXISTS idx_entitlements_unused ON meal_plan_entitlements(user_id) WHERE used_at IS NULL;
-- A given payment/access-code redemption backs at most one entitlement.
CREATE UNIQUE INDEX IF NOT EXISTS idx_entitlements_payment_unique ON meal_plan_entitlements(payment_id) WHERE payment_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE meal_plan_access_codes ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies at all: only the service-role key (server) can
-- ever read or write this table, even for a user's own code_hash. Access
-- codes are verified server-side only and never exposed to client JWTs.

ALTER TABLE meal_plan_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entitlements_owner_read" ON meal_plan_entitlements FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policy: entitlements are only ever written by the
-- server (service role) after a verified payment callback or a verified
-- access-code redemption — never directly by a user's own JWT.
