-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Shopping list item cadence (weekly vs monthly)
--
-- First real step toward the broader household-shopping vision (Expo Phase
-- 3A, item 8): distinguishing perishables/weekly-consumption items (fresh
-- vegetables, fruit, dairy) from pantry staples typically bought monthly
-- (cooking oil, sugar, salt, spices). The value is assigned server-side
-- (server/db.ts's generateShoppingItemsFromMealPlan, by food category) —
-- never inferred or hard-coded on the client, per the explicit requirement
-- that the server/data model remains the source of truth.
--
-- Additive only: existing rows default to 'weekly' (their previous,
-- implicit behavior — the whole list was always shown as one undifferentiated
-- set), no existing column touched, no data loss.
--
-- Deliberately NOT included here (see the Phase 3A report for the full
-- reasoning): a manual "add arbitrary item" endpoint/UI, and the much larger
-- household-goods catalog (soap, detergent, toiletries, etc.) — the list is
-- still 100% generated from the current meal plan's ingredients, which are
-- food only. Adding non-food manual items is a separate, bigger feature.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE shopping_list_items
  ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'weekly'
  CHECK (frequency IN ('weekly', 'monthly'));
