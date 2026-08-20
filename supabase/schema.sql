-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — PostgreSQL Schema
-- Run against your Supabase project via the SQL editor or Supabase CLI.
-- All monetary values in integer KSh (1 KSh = smallest unit).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── User Profiles ───────────────────────────────────────────────────────────
-- Extends auth.users (managed by Supabase Auth).
-- Triggered automatically on new user signup.
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL DEFAULT '',
  role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  has_budget_pin      BOOLEAN NOT NULL DEFAULT false,
  is_premium          BOOLEAN NOT NULL DEFAULT false,
  premium_expiry      TIMESTAMPTZ,
  pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
  pin_locked_until    TIMESTAMPTZ,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Defense-in-depth: the profiles_self_update RLS policy below (USING only,
-- no WITH CHECK) lets a user UPDATE any column of their own profile row,
-- including `role`. The app itself never issues such a call — the frontend
-- never talks to Supabase directly, only through the Express server, which
-- always reads `role` via the service-role key (bypasses RLS) and never
-- writes it from client input. This trigger closes the underlying gap
-- anyway: any future direct-to-Supabase write of `role` under a normal user
-- JWT is silently reverted to the pre-update value. Only the service role
-- (server-side admin promotion) can actually change it.
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

-- ─── Budget PIN Credentials ───────────────────────────────────────────────────
-- Stored separately from profiles so pin_hash never appears in profile queries.
CREATE TABLE IF NOT EXISTS budget_pin_credentials (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id  UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Financial Sessions ───────────────────────────────────────────────────────
-- Short-lived server-side sessions created after Budget PIN verification.
-- Token is stored in HttpOnly cookie — never returned to browser in body.
CREATE TABLE IF NOT EXISTS financial_sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of the actual token
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_financial_sessions_user ON financial_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_sessions_expires ON financial_sessions(expires_at);

-- ─── Households ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS households (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'My Family',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_households_owner ON households(owner_id);

CREATE TABLE IF NOT EXISTS household_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id    UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  age_group       TEXT NOT NULL DEFAULT 'adult' CHECK (age_group IN ('adult','teen','child','infant')),
  preferences     TEXT[] NOT NULL DEFAULT '{}',
  allergies       TEXT[] NOT NULL DEFAULT '{}',
  dislikes        TEXT[] NOT NULL DEFAULT '{}',
  nutrition_goals TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_members_household ON household_members(household_id);

-- ─── Food Items (shared catalogue, admin-managed) ─────────────────────────────
CREATE TABLE IF NOT EXISTS food_items (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 TEXT NOT NULL,
  swahili_name         TEXT,
  category             TEXT NOT NULL CHECK (category IN ('carbohydrates','proteins','vegetables','fruits','dairy','spices_pantry')),
  default_unit         TEXT NOT NULL DEFAULT 'kg',
  estimated_price_ksh  INTEGER NOT NULL DEFAULT 0,  -- integer KSh
  region               TEXT,
  calories_per_unit    INTEGER,
  protein_g            NUMERIC(6,2),
  carbs_g              NUMERIC(6,2),
  fiber_g              NUMERIC(6,2),
  is_pantry_staple     BOOLEAN NOT NULL DEFAULT false,
  last_updated         DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Meals (shared catalogue + user custom meals) ─────────────────────────────
CREATE TABLE IF NOT EXISTS meals (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id             UUID REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL = system meal
  name                 TEXT NOT NULL,
  swahili_name         TEXT,
  category             TEXT NOT NULL CHECK (category IN ('breakfast','lunch','dinner','snack')),
  prep_time_minutes    INTEGER NOT NULL DEFAULT 30,
  estimated_cost_ksh   INTEGER NOT NULL DEFAULT 200,
  cost_level           TEXT NOT NULL CHECK (cost_level IN ('budget','moderate','feast')),
  description          TEXT NOT NULL DEFAULT '',
  image_url            TEXT,
  servings             INTEGER NOT NULL DEFAULT 4,
  kenyan_cooking_tips  TEXT,
  is_custom            BOOLEAN NOT NULL DEFAULT false,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  nutrition_protein    BOOLEAN NOT NULL DEFAULT false,
  nutrition_carb       BOOLEAN NOT NULL DEFAULT false,
  nutrition_veggie     BOOLEAN NOT NULL DEFAULT false,
  nutrition_fruit      BOOLEAN NOT NULL DEFAULT false,
  approx_calories      INTEGER NOT NULL DEFAULT 500,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meals_owner ON meals(owner_id);
CREATE INDEX IF NOT EXISTS idx_meals_category ON meals(category);

CREATE TABLE IF NOT EXISTS meal_ingredients (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_id           UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  food_item_id      UUID REFERENCES food_items(id),
  name              TEXT NOT NULL,
  quantity          NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit              TEXT NOT NULL DEFAULT 'portion',
  estimated_cost_ksh INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ingredients_meal ON meal_ingredients(meal_id);

CREATE TABLE IF NOT EXISTS meal_instructions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_id    UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  step       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_instructions_meal ON meal_instructions(meal_id);

-- ─── Meal Plans ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meal_plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  household_id    UUID REFERENCES households(id),
  week_start_date DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start_date)
);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user ON meal_plans(user_id);

CREATE TABLE IF NOT EXISTS meal_plan_slots (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day_of_week  TEXT NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  slot         TEXT NOT NULL CHECK (slot IN ('breakfast','lunch','dinner','snack')),
  meal_id      UUID REFERENCES meals(id)
);
CREATE INDEX IF NOT EXISTS idx_slots_plan ON meal_plan_slots(meal_plan_id);

-- ─── Shopping Lists ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopping_lists (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start_date)
);
CREATE INDEX IF NOT EXISTS idx_shopping_user ON shopping_lists(user_id);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopping_list_id   UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'vegetables',
  quantity           NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit               TEXT NOT NULL DEFAULT 'kg',
  estimated_price_ksh INTEGER NOT NULL DEFAULT 0,
  actual_price_ksh    INTEGER,
  is_purchased       BOOLEAN NOT NULL DEFAULT false,
  sort_order         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_list ON shopping_list_items(shopping_list_id);

-- ─── Water / Hydration ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS water_configs (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                      UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  daily_target_ml              INTEGER NOT NULL DEFAULT 2000,
  glass_size_ml                INTEGER NOT NULL DEFAULT 250,
  reminder_frequency_minutes   INTEGER NOT NULL DEFAULT 120,
  reminders_enabled            BOOLEAN NOT NULL DEFAULT true,
  reminder_schedule            TEXT[] NOT NULL DEFAULT '{"08:00","10:30","13:00","15:30","18:00","20:00"}'
);

CREATE TABLE IF NOT EXISTS water_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  log_date   DATE NOT NULL,
  total_ml   INTEGER NOT NULL DEFAULT 0,
  target_ml  INTEGER NOT NULL DEFAULT 2000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_water_logs_user ON water_logs(user_id);

CREATE TABLE IF NOT EXISTS water_log_entries (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  water_log_id UUID NOT NULL REFERENCES water_logs(id) ON DELETE CASCADE,
  logged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount_ml    INTEGER NOT NULL
);

-- ─── Budgets (PRIVATE — strict RLS) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month               TEXT NOT NULL,  -- 'YYYY-MM'
  monthly_income_ksh  INTEGER NOT NULL DEFAULT 0,
  income_type         TEXT NOT NULL DEFAULT 'monthly' CHECK (income_type IN ('monthly','weekly','daily')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);

CREATE TABLE IF NOT EXISTS budget_categories (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id           UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category            TEXT NOT NULL,
  planned_amount_ksh  INTEGER NOT NULL DEFAULT 0,
  color               TEXT NOT NULL DEFAULT '#6B7280',
  sort_order          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_budget_categories ON budget_categories(budget_id);

-- ─── Expenses (PRIVATE — strict RLS) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_ksh   INTEGER NOT NULL CHECK (amount_ksh > 0),
  category     TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(user_id, expense_date);

-- ─── Subscriptions & Payments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_type      TEXT NOT NULL CHECK (plan_type IN ('weekly','monthly')),
  price_ksh      INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','cancelled')),
  start_date     TIMESTAMPTZ,
  end_date       TIMESTAMPTZ,
  mpesa_receipt  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS payments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id       UUID REFERENCES subscriptions(id),
  amount_ksh            INTEGER NOT NULL,
  phone_number          TEXT NOT NULL,
  plan_type             TEXT CHECK (plan_type IN ('weekly','monthly','meal_plan_generation')),
  mpesa_receipt         TEXT,
  checkout_request_id   TEXT,
  merchant_request_id   TEXT,
  result_desc           TEXT,
  daraja_callback_raw   JSONB,  -- store raw callback for audit
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','cancelled','expired')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_checkout ON payments(checkout_request_id);
-- Idempotency: a given Daraja CheckoutRequestID can only ever back one payment row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_checkout_unique ON payments(checkout_request_id) WHERE checkout_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt ON payments(mpesa_receipt) WHERE mpesa_receipt IS NOT NULL;

-- ─── "Generate New Plan" gate: access codes & entitlements ───────────────────
-- One KSh 50 payment (plan_type='meal_plan_generation' above) or one valid
-- access code = one new weekly meal-plan generation. Separate from Premium
-- subscriptions — never touches subscriptions or profiles.is_premium.

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

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL = global
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('water','meal','budget','system','premium')),
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id);

-- ─── AI Conversations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content      TEXT NOT NULL,
  had_financial_context BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_user ON ai_conversations(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Enable on every table containing user data.
-- Public data (food_items, shared meals) has permissive read policies.
-- Private financial data requires service role or explicit auth.
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- budget_pin_credentials — never directly readable by user JWT
ALTER TABLE budget_pin_credentials ENABLE ROW LEVEL SECURITY;
-- No SELECT policy: only service role (server) can read pin hashes

-- financial_sessions — never directly readable
ALTER TABLE financial_sessions ENABLE ROW LEVEL SECURITY;
-- No SELECT policy: only service role (server) manages sessions

-- households
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "households_owner" ON households FOR ALL USING (auth.uid() = owner_id);

-- household_members
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_via_household" ON household_members FOR ALL
  USING (household_id IN (SELECT id FROM households WHERE owner_id = auth.uid()));

-- food_items — public read, admin write
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "food_items_public_read" ON food_items FOR SELECT USING (true);

-- meals — system meals are public; custom meals belong to owner
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meals_read" ON meals FOR SELECT USING (owner_id IS NULL OR owner_id = auth.uid());
CREATE POLICY "meals_write" ON meals FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "meals_update" ON meals FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "meals_delete" ON meals FOR DELETE USING (owner_id = auth.uid());

-- meal_ingredients
ALTER TABLE meal_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingredients_via_meal" ON meal_ingredients FOR ALL
  USING (meal_id IN (SELECT id FROM meals WHERE owner_id IS NULL OR owner_id = auth.uid()));

-- meal_instructions
ALTER TABLE meal_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instructions_via_meal" ON meal_instructions FOR ALL
  USING (meal_id IN (SELECT id FROM meals WHERE owner_id IS NULL OR owner_id = auth.uid()));

-- meal_plans
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_plans_owner" ON meal_plans FOR ALL USING (auth.uid() = user_id);

-- meal_plan_slots
ALTER TABLE meal_plan_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slots_via_plan" ON meal_plan_slots FOR ALL
  USING (meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid()));

-- shopping_lists
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopping_owner" ON shopping_lists FOR ALL USING (auth.uid() = user_id);

-- shopping_list_items
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_via_list" ON shopping_list_items FOR ALL
  USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid()));

-- water_configs
ALTER TABLE water_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "water_config_owner" ON water_configs FOR ALL USING (auth.uid() = user_id);

-- water_logs
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "water_logs_owner" ON water_logs FOR ALL USING (auth.uid() = user_id);

-- water_log_entries
ALTER TABLE water_log_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entries_via_log" ON water_log_entries FOR ALL
  USING (water_log_id IN (SELECT id FROM water_logs WHERE user_id = auth.uid()));

-- budgets — PRIVATE
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budgets_owner" ON budgets FOR ALL USING (auth.uid() = user_id);

-- budget_categories — PRIVATE
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_categories_via_budget" ON budget_categories FOR ALL
  USING (budget_id IN (SELECT id FROM budgets WHERE user_id = auth.uid()));

-- expenses — PRIVATE
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_owner" ON expenses FOR ALL USING (auth.uid() = user_id);

-- subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subs_owner" ON subscriptions FOR ALL USING (auth.uid() = user_id);

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_owner" ON payments FOR ALL USING (auth.uid() = user_id);

-- meal_plan_access_codes — Intentionally NO policies at all: only the
-- service-role key (server) can ever read or write this table, even for a
-- user's own code_hash. Codes are verified server-side only, never exposed
-- to client JWTs.
ALTER TABLE meal_plan_access_codes ENABLE ROW LEVEL SECURITY;

-- meal_plan_entitlements — readable by owner; writes are server-only (no
-- INSERT/UPDATE/DELETE policy — entitlements are only ever created after a
-- verified payment callback or access-code redemption, never by a user JWT).
ALTER TABLE meal_plan_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entitlements_owner_read" ON meal_plan_entitlements FOR SELECT USING (auth.uid() = user_id);

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifs_read" ON notifications FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());

-- ai_conversations — PRIVATE
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_owner" ON ai_conversations FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: clean up expired financial sessions (call via pg_cron or on-demand)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION purge_expired_financial_sessions()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM financial_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
