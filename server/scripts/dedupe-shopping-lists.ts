// One-time (re-runnable/idempotent) backfill: applies mergeShoppingItems to
// every existing shopping_list_items row so already-live duplicate data
// (naming variants, case differences, etc. that predate the canonicalization
// feature) gets consolidated the same way a fresh save now would.
//
// SAFE by construction: never a blind DELETE. For each list, quantities,
// checked-state (isPurchased = true if ANY duplicate was checked),
// frequency, source ('manual' wins over 'generated' on merge), and prices
// are all carried into the merged row via the exact same mergeShoppingItems
// logic every live write path uses — nothing here is bespoke to this
// script. A list whose merge produces no change is left untouched (no
// needless write). Run with --dry-run first to see the impact with zero
// writes.
//
// Usage:
//   npx tsx server/scripts/dedupe-shopping-lists.ts --dry-run
//   npx tsx server/scripts/dedupe-shopping-lists.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { mergeShoppingItems, MergeableItem } from '../shoppingCanonicalization.js';

const DRY_RUN = process.argv.includes('--dry-run');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

interface Row {
  id: string; shopping_list_id: string; name: string; category: string; quantity: number; unit: string;
  estimated_price_ksh: number; actual_price_ksh: number | null; is_purchased: boolean; sort_order: number;
  frequency: 'weekly' | 'monthly'; source: 'generated' | 'manual';
}

async function main() {
  console.log(`\n═══ Shopping list dedup backfill ${DRY_RUN ? '(DRY RUN — no writes)' : '(LIVE)'} ═══\n`);

  const { data: lists, error: listsErr } = await db.from('shopping_lists').select('id, user_id, week_start_date');
  if (listsErr) throw new Error(`Failed to load shopping_lists: ${listsErr.message}`);

  let listsChanged = 0, listsUnchanged = 0, rowsBefore = 0, rowsAfter = 0;

  for (const list of lists ?? []) {
    const { data: items, error: itemsErr } = await db
      .from('shopping_list_items').select('*').eq('shopping_list_id', list.id).order('sort_order');
    if (itemsErr) { console.error(`  ! Failed to load items for list ${list.id}: ${itemsErr.message}`); continue; }
    const rows = (items ?? []) as Row[];
    if (rows.length === 0) continue;

    const mergeable: MergeableItem[] = rows.map((r) => ({
      id: r.id, name: r.name, category: r.category, quantity: Number(r.quantity), unit: r.unit,
      estimatedPriceKsh: r.estimated_price_ksh, actualPriceKsh: r.actual_price_ksh,
      isPurchased: r.is_purchased, frequency: r.frequency, source: r.source,
    }));
    const merged = mergeShoppingItems(mergeable);

    rowsBefore += rows.length;
    rowsAfter += merged.length;

    if (merged.length === rows.length) {
      // Same row count doesn't guarantee zero change (e.g. a rename-only
      // canonicalization with no quantity merge), but a genuinely identical
      // set of (name, quantity, unit) needs no write.
      const unchanged = merged.every((m, i) => {
        const orig = rows[i];
        return orig && m.name === orig.name && m.quantity === Number(orig.quantity) && m.unit === orig.unit;
      });
      if (unchanged) { listsUnchanged++; continue; }
    }

    listsChanged++;
    console.log(`  → List ${list.id} (user ${list.user_id}, week ${list.week_start_date}): ${rows.length} rows → ${merged.length} rows`);
    if (DRY_RUN) continue;

    await db.from('shopping_list_items').delete().eq('shopping_list_id', list.id);
    if (merged.length > 0) {
      const { error: insertErr } = await db.from('shopping_list_items').insert(
        merged.map((m, i) => ({
          shopping_list_id: list.id, name: m.name, category: m.category, quantity: m.quantity, unit: m.unit,
          estimated_price_ksh: Math.round(m.estimatedPriceKsh || 0), actual_price_ksh: m.actualPriceKsh ?? null,
          is_purchased: m.isPurchased, sort_order: i, frequency: m.frequency || 'weekly', source: m.source || 'generated',
          canonical_key: m.canonicalKey ?? null, variant: m.variant ?? null, is_compound: m.isCompound ?? false,
        }))
      );
      if (insertErr) console.error(`    ! Failed to write merged items for list ${list.id}: ${insertErr.message}`);
    }
  }

  console.log(`\nLists scanned: ${(lists ?? []).length}`);
  console.log(`Lists changed: ${listsChanged}`);
  console.log(`Lists already clean: ${listsUnchanged}`);
  console.log(`Total item rows: ${rowsBefore} → ${rowsAfter} (${rowsBefore - rowsAfter} removed as duplicates)`);
  if (DRY_RUN) console.log('\nDry run — no writes were made. Re-run without --dry-run to apply.');
}

main().catch((err) => { console.error(err); process.exit(1); });
