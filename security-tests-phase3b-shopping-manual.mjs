/**
 * Mlo Wangu — Phase 3B Stage 2, Item 10: Manual Shopping Items Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: adding a manual item via the existing whole-list PUT, ownership
 * (unaffected by this change — same contract as Phase 2/3A), and the one
 * genuinely new behavior: a manual item survives a meal-plan regeneration
 * that replaces every generated item.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;
function assert(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✅  ${name}`); }
  else { failed++; console.log(`  ❌  ${name}${detail ? `\n      → ${detail}` : ''}`); }
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let body; try { body = await res.json(); } catch { body = {}; }
  return { status: res.status, body };
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const emailA = `mlo-p3b-shop-a-${stamp}@example.com`;
const emailB = `mlo-p3b-shop-b-${stamp}@example.com`;
const password = 'Phase3BShopManual123!';
// Deliberately NOT a recognized alias (server/shoppingCanonicalization.ts) so
// this test's exact-name assertions hold — "Dish Soap" itself would
// correctly canonicalize to "Dishwashing Liquid", which is intentional dedup
// behavior covered separately in security-tests-shopping-dedup.mjs.
const manualItemName = `Zzz Novelty Cleaning Item ${stamp}`;

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

// [MOCK TEST] — same seeding pattern as security-tests-supabase-migration.mjs:
// grants a real entitlement directly so a real POST /api/meal-plans/generate
// call can be made, producing a real generated plan + shopping list to test
// the regeneration-merge behavior against.
async function seedGenerationEntitlement(userId) {
  const { data: pay, error: payErr } = await admin.from('payments').insert({
    user_id: userId, amount_ksh: 50, phone_number: '254712345678',
    plan_type: 'meal_plan_generation', checkout_request_id: `p3bshop_${stamp}`, status: 'pending',
  }).select('*').single();
  if (payErr) throw new Error(`seed payment failed: ${payErr.message}`);
  const { error: entErr } = await admin.from('meal_plan_entitlements').insert({
    user_id: userId, source: 'payment', payment_id: pay.id, expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  if (entErr) throw new Error(`seed entitlement failed: ${entErr.message}`);
}

console.log('\n═══ Mlo Wangu Phase 3B — Manual Shopping Items Suite ═══\n');

let userAId, userBId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);

  const anonA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sA } = await anonA.auth.signInWithPassword({ email: emailA, password });
  const tokenA = sA.session.access_token;
  const authA = { Authorization: `Bearer ${tokenA}` };

  const anonB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sB } = await anonB.auth.signInWithPassword({ email: emailB, password });
  const authB = { Authorization: `Bearer ${sB.session.access_token}` };

  console.log('── Setup: generate a real meal plan (so there is something to regenerate later) ──');
  {
    await seedGenerationEntitlement(userAId);
    const gen = await req('/api/meal-plans/generate', { method: 'POST', headers: authA, body: JSON.stringify({}) });
    assert('Meal plan generation succeeds', gen.status === 200, JSON.stringify(gen.body));
  }

  console.log('── Add a manual item ──');
  {
    const current = await req('/api/shopping/current', { headers: authA });
    const list = current.body.shoppingList ?? { id: `sl_test_${stamp}`, userId: userAId, weekStartDate: new Date().toISOString().slice(0, 10), items: [], updatedAt: new Date().toISOString() };
    const manualItem = { id: `manual_${stamp}`, category: 'other', name: manualItemName, quantity: 1, unit: 'bottle', estimatedPriceKsh: 150, isPurchased: false, frequency: 'monthly', source: 'manual' };
    const put = await req('/api/shopping/current', { method: 'PUT', headers: authA, body: JSON.stringify({ shoppingList: { ...list, items: [...list.items, manualItem] } }) });
    assert('Whole-list PUT with a manual item succeeds → 200', put.status === 200, JSON.stringify(put.body));

    const { data: row } = await admin.from('shopping_list_items').select('source, name').eq('name', manualItemName).eq('shopping_list_id', put.body.shoppingList.id).maybeSingle();
    assert("Item is stored with source='manual'", row?.source === 'manual', JSON.stringify(row));

    const reread = await req('/api/shopping/current', { headers: authA });
    const found = reread.body.shoppingList?.items?.find((i) => i.name === manualItemName);
    assert('Manual item round-trips with source=manual on read', found?.source === 'manual', JSON.stringify(found));
  }

  console.log('── Ownership unaffected ──');
  {
    const listB = await req('/api/shopping/current', { headers: authB });
    const hasA = (listB.body.shoppingList?.items || []).some((i) => i.name === manualItemName);
    assert("User B's shopping list never contains User A's manual item", !hasA, JSON.stringify(listB.body.shoppingList));
  }

  console.log('── Manual item survives meal-plan regeneration ──');
  {
    // Re-saving the plan via PUT /api/meal-plans/current calls exactly the
    // same contentDb.saveMealPlan function generation does — it recomputes
    // and replaces every source='generated' shopping item. This is the
    // real mechanism under test, not a simulation of it.
    const currentPlan = await req('/api/meal-plans/current', { headers: authA });
    assert('Setup: a meal plan exists to resave', !!currentPlan.body.mealPlan, JSON.stringify(currentPlan.body));

    const beforeList = await req('/api/shopping/current', { headers: authA });
    const generatedCountBefore = (beforeList.body.shoppingList?.items || []).filter((i) => i.source === 'generated').length;
    assert('Setup: the generated list has at least one real generated item', generatedCountBefore > 0, JSON.stringify(beforeList.body.shoppingList?.items?.length));

    const resave = await req('/api/meal-plans/current', { method: 'PUT', headers: authA, body: JSON.stringify({ mealPlan: currentPlan.body.mealPlan }) });
    assert('Re-saving the meal plan succeeds', resave.status === 200, JSON.stringify(resave.body));

    const afterList = await req('/api/shopping/current', { headers: authA });
    const afterItems = afterList.body.shoppingList?.items || [];
    const stillThere = afterItems.some((i) => i.name === manualItemName && i.source === 'manual');
    assert('The manual item survives the regeneration that replaced the generated items', stillThere, JSON.stringify(afterItems.map((i) => i.name)));
    assert('Generated items are still present too (the merge is additive, not a wipe of everything else)', afterItems.some((i) => i.source === 'generated'), JSON.stringify(afterItems.map((i) => i.source)));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (userAId) await admin.from('meal_plan_entitlements').delete().eq('user_id', userAId);
    if (userAId) await admin.from('payments').delete().eq('user_id', userAId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
