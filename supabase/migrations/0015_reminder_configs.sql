-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Custom & shopping-day local reminders (Phase 3B, item 2)
--
-- Deliberately NOT a replacement for the existing water-reminder fields on
-- water_target_config (WaterTargetConfig.reminderSchedule/remindersEnabled/
-- schedule) — those keep working completely unchanged. This table only
-- covers the two new reminder types this phase adds: 'shopping_day' (tied
-- to the real weekly-shopping cadence from Phase 3A) and 'custom' (an
-- arbitrary user-defined reminder). Meal-prep and per-meal reminders are
-- explicitly NOT included — nothing in the data model marks a planned cook
-- time for any meal, so a reminder for it would be fabricated, not real.
--
-- Delivery for both types is local-only (mobile schedules an on-device
-- notification, same as water already does) — there is no server-side push
-- for these two types. Config (create/edit/delete) is shared by both web
-- and mobile; only mobile can actually fire the local notification.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reminder_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('shopping_day', 'custom')),
  label         TEXT NOT NULL,
  time          TEXT NOT NULL, -- "HH:MM", same string format water's schedule array already uses
  days_of_week  TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'mon','wed','fri'}; empty = every day
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminder_configs_user ON reminder_configs(user_id);

ALTER TABLE reminder_configs ENABLE ROW LEVEL SECURITY;
-- A real user-facing CRUD resource (like household_members/budget), not an
-- internal system table — client-readable/writable, scoped by ownership,
-- same pattern as every other per-user config table.
CREATE POLICY "reminder_configs_owner" ON reminder_configs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
