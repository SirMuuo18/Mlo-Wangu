-- Per-user meal-plan generation lock (meal-variety/personalization engine,
-- Stage B). Premium users' generation path has no CAS guard (only the
-- pay-per-generation entitlement-claim path does — see claimEntitlement in
-- server/db-supabase.ts), so two near-simultaneous generate requests for a
-- premium user could interleave meal_plan_slots writes for the same week.
-- Simple claim-a-row mutex: the route INSERTs this row before generating
-- (a unique-violation means another request already holds it) and DELETEs
-- it when done. Service-role only — never queried from any client route,
-- so no client-facing RLS policy is defined (same pattern as
-- server_error_log/admin_audit_log).
CREATE TABLE IF NOT EXISTS meal_plan_generation_locks (
  user_id     UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE meal_plan_generation_locks ENABLE ROW LEVEL SECURITY;
-- meal_plan_generation_locks — service-role only, no client policies.
