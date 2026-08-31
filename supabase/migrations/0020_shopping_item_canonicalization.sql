-- Adds canonicalization metadata to shopping_list_items so duplicate items
-- (naming variants, case/whitespace differences, compound ingredients) can
-- be detected and merged server-side instead of only via exact-string match.
-- See server/shoppingCanonicalization.ts for how these columns are computed.
--
-- Additive-only: existing rows get NULL canonical_key until the next
-- generation/save cycle (or the one-time backfill script) populates them;
-- nothing here changes existing data or behavior for rows that don't have it
-- set yet.

ALTER TABLE shopping_list_items
  ADD COLUMN IF NOT EXISTS canonical_key TEXT,
  ADD COLUMN IF NOT EXISTS unit_group    TEXT,
  ADD COLUMN IF NOT EXISTS variant       TEXT,
  ADD COLUMN IF NOT EXISTS is_compound   BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_shopping_items_canonical
  ON shopping_list_items(shopping_list_id, canonical_key, unit_group);

-- Defense-in-depth: once canonical_key/unit_group are populated for a row,
-- no two rows in the same list may share the same (canonical_key, unit_group)
-- pair. Partial index so legacy NULL rows are unaffected. The application
-- layer (server/shoppingCanonicalization.ts's mergeShoppingItems) is what
-- actually performs the merge before every write — this index is a backstop
-- against a future write path that forgets to call it, not the primary
-- dedup mechanism. Scoped to shopping_list_id (itself scoped to a single
-- user via shopping_lists.user_id), never global across users.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopping_items_canonical
  ON shopping_list_items(shopping_list_id, canonical_key, unit_group)
  WHERE canonical_key IS NOT NULL;
