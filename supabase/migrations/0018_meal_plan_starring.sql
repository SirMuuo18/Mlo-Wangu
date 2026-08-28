-- Meal-plan and meal starring (meal-variety/personalization engine, Stage B).
-- A starred week means "I liked this plan and want to keep it" — it is
-- protected from any future history-based cleanup and is excluded from the
-- week-similarity novelty check. A starred meal gets a much smaller
-- repetition penalty in generation scoring than an ordinary historical
-- meal — starring does not mean "repeat this automatically," normal
-- generation still prefers novelty unless the user explicitly reuses a
-- favorite (e.g. via a future "cook this again" action).
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS starred_meals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  meal_id     UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, meal_id)
);
CREATE INDEX IF NOT EXISTS idx_starred_meals_user ON starred_meals(user_id);
ALTER TABLE starred_meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "starred_meals_owner" ON starred_meals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
