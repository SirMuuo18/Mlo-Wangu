-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Shopping list manual items (Phase 3B, item 10)
--
-- Distinguishes items the meal-plan generator produced from items a user
-- added by hand. Additive only: existing rows default to 'generated' (their
-- actual, correct provenance — every row that exists today came from
-- generation, since there was no other way to create one before this).
--
-- This is what makes "manual items survive the next meal-plan regeneration"
-- possible: server/secure-db.ts's saveMealPlan now preserves any
-- source='manual' rows from the previous list instead of the previous
-- full delete-and-replace wiping them out too.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE shopping_list_items
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'generated'
  CHECK (source IN ('generated', 'manual'));
