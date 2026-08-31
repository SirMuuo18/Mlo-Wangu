/**
 * Mlo Wangu — Shopping List Deduplication, Quantity Merging & Non-Food Items.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: name normalization/alias merging (potatoes/waru, rice variants,
 * case/whitespace), non-food items (toilet paper variants), quantity merging
 * (compatible units merge correctly; incompatible units are never falsely
 * converted), compound-ingredient non-collapse, and cross-user isolation of
 * canonicalized items.
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
const emailA = `mlo-shop-dedup-a-${stamp}@example.com`;
const emailB = `mlo-shop-dedup-b-${stamp}@example.com`;
const password = 'ShopDedupTest123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

// Cookie-jar-free auth: sign in with the anon client and pass the access
// token as a Bearer header — same pattern as security-tests-bearer-auth.mjs.
async function bearerHeaderFor(email) {
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`sign-in failed: ${signInErr.message}`);
  return { Authorization: `Bearer ${signIn.session.access_token}` };
}

async function putShoppingList(auth, items) {
  const current = await req('/api/shopping/current', { headers: auth });
  const base = current.body.shoppingList ?? {
    id: `sl_test_${stamp}`, userId: '', weekStartDate: new Date().toISOString().slice(0, 10),
    items: [], updatedAt: new Date().toISOString(),
  };
  return req('/api/shopping/current', {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ shoppingList: { ...base, items } }),
  });
}

console.log('\n═══ Mlo Wangu — Shopping List Dedup, Quantity Merge & Non-Food ═══\n');

let userAId, userBId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);
  const authA = await bearerHeaderFor(emailA);
  const authB = await bearerHeaderFor(emailB);

  console.log('── Name normalization: Irish potatoes / waru / Potatoes merge ──');
  {
    const put = await putShoppingList(authA, [
      { id: 'i1', category: 'carbohydrates', name: 'Irish potatoes', quantity: 1, unit: 'kg', estimatedPriceKsh: 100, isPurchased: false, source: 'generated' },
      { id: 'i2', category: 'carbohydrates', name: 'Irish potatoes (waru)', quantity: 1, unit: 'kg', estimatedPriceKsh: 100, isPurchased: false, source: 'generated' },
      { id: 'i3', category: 'carbohydrates', name: 'Potatoes', quantity: 500, unit: 'g', estimatedPriceKsh: 50, isPurchased: false, source: 'generated' },
    ]);
    assert('PUT succeeds', put.status === 200, JSON.stringify(put.body));
    const items = put.body.shoppingList?.items || [];
    const potatoRows = items.filter((i) => i.name.toLowerCase().includes('potato'));
    assert('Three potato-variant rows collapse into exactly one', potatoRows.length === 1, JSON.stringify(potatoRows));
    assert('Merged quantity is 2.5kg (1kg + 1kg + 500g)', potatoRows[0]?.quantity === 2.5 && potatoRows[0]?.unit === 'kg', JSON.stringify(potatoRows[0]));

    // Fries must NOT merge into plain potatoes.
    const put2 = await putShoppingList(authA, [
      ...items,
      { id: 'i4', category: 'carbohydrates', name: 'Irish potatoes (fries)', quantity: 1, unit: 'kg', estimatedPriceKsh: 200, isPurchased: false, source: 'generated' },
    ]);
    const items2 = put2.body.shoppingList?.items || [];
    const friesRow = items2.find((i) => i.name.toLowerCase().includes('fries'));
    const plainPotatoRow = items2.find((i) => i.name.toLowerCase().includes('potato') && !i.name.toLowerCase().includes('fries'));
    assert('"Irish potatoes (fries)" stays a separate row from plain potatoes', !!friesRow && !!plainPotatoRow && friesRow.id !== plainPotatoRow.id, JSON.stringify(items2.map((i) => i.name)));
  }

  console.log('── Rice variants merge, including tricky slash-notation ──');
  {
    const put = await putShoppingList(authA, [
      { id: 'r1', category: 'carbohydrates', name: 'White rice', quantity: 1, unit: 'kg', estimatedPriceKsh: 150, isPurchased: false, source: 'generated' },
      { id: 'r2', category: 'carbohydrates', name: 'Pishori rice', quantity: 1, unit: 'kg', estimatedPriceKsh: 150, isPurchased: false, source: 'generated' },
      { id: 'r3', category: 'carbohydrates', name: 'Sindano / pishori rice', quantity: 500, unit: 'g', estimatedPriceKsh: 75, isPurchased: false, source: 'generated' },
    ]);
    const items = put.body.shoppingList?.items || [];
    const riceRows = items.filter((i) => i.name.toLowerCase().includes('rice'));
    assert('Rice variants (incl. "Sindano / pishori rice") collapse into one row', riceRows.length === 1, JSON.stringify(riceRows));
    assert('Merged rice quantity is 2.5kg', riceRows[0]?.quantity === 2.5 && riceRows[0]?.unit === 'kg', JSON.stringify(riceRows[0]));
  }

  console.log('── Case & whitespace insensitivity ──');
  {
    const put = await putShoppingList(authA, [
      { id: 'c1', category: 'vegetables', name: 'Sukuma Wiki', quantity: 1, unit: 'bunch', estimatedPriceKsh: 20, isPurchased: false, source: 'generated' },
      { id: 'c2', category: 'vegetables', name: '  sukuma wiki  ', quantity: 2, unit: 'bunch', estimatedPriceKsh: 40, isPurchased: false, source: 'generated' },
      { id: 'c3', category: 'vegetables', name: 'SUKUMA WIKI', quantity: 1, unit: 'bunch', estimatedPriceKsh: 20, isPurchased: false, source: 'generated' },
    ]);
    const items = put.body.shoppingList?.items || [];
    const rows = items.filter((i) => i.name.toLowerCase().includes('sukuma'));
    assert('Case/whitespace variants of the same item collapse into one row', rows.length === 1, JSON.stringify(rows));
    assert('Merged count quantity is 4 bunches', rows[0]?.quantity === 4, JSON.stringify(rows[0]));
  }

  console.log('── Non-food items: toilet paper variants ──');
  {
    const put = await putShoppingList(authA, [
      { id: 'n1', category: 'household', name: 'Toilet paper', quantity: 1, unit: 'pieces', estimatedPriceKsh: 150, isPurchased: false, source: 'manual' },
      { id: 'n2', category: 'household', name: 'toilet  paper', quantity: 2, unit: 'pieces', estimatedPriceKsh: 300, isPurchased: false, source: 'manual' },
      { id: 'n3', category: 'household', name: 'Bathroom Tissue', quantity: 1, unit: 'pieces', estimatedPriceKsh: 150, isPurchased: false, source: 'manual' },
    ]);
    assert('PUT with non-food items succeeds (no crash on non-food category)', put.status === 200, JSON.stringify(put.body));
    const items = put.body.shoppingList?.items || [];
    const rows = items.filter((i) => i.name.toLowerCase().includes('toilet') || i.name.toLowerCase().includes('tissue'));
    assert('Toilet paper naming variants collapse into one row', rows.length === 1, JSON.stringify(rows));
    assert('Merged quantity is 4 pieces', rows[0]?.quantity === 4, JSON.stringify(rows[0]));
    assert('Non-food item keeps a non-food category (never forced into a food category)', ['household', 'cleaning', 'personal_care', 'utilities', 'other'].includes(rows[0]?.category), JSON.stringify(rows[0]));
  }

  console.log('── Quantity merging: compatible units merge, incompatible units never falsely convert ──');
  {
    const put = await putShoppingList(authA, [
      { id: 'q1', category: 'proteins', name: 'Eggs', quantity: 6, unit: 'pieces', estimatedPriceKsh: 90, isPurchased: false, source: 'generated' },
      { id: 'q2', category: 'proteins', name: 'Eggs', quantity: 1, unit: 'kg', estimatedPriceKsh: 50, isPurchased: false, source: 'manual' },
    ]);
    const items = put.body.shoppingList?.items || [];
    const eggRows = items.filter((i) => i.name.toLowerCase().includes('egg'));
    assert('Incompatible units (pieces vs kg) are kept as two separate rows, never falsely converted', eggRows.length === 2, JSON.stringify(eggRows));
    const pieceRow = eggRows.find((i) => i.unit === 'pieces');
    const kgRow = eggRows.find((i) => i.unit === 'kg');
    assert('The "pieces" row keeps its original quantity (6)', pieceRow?.quantity === 6, JSON.stringify(pieceRow));
    assert('The "kg" row keeps its original quantity (1)', kgRow?.quantity === 1, JSON.stringify(kgRow));

    const put2 = await putShoppingList(authA, [
      { id: 'q3', category: 'dairy', name: 'Milk', quantity: 500, unit: 'ml', estimatedPriceKsh: 60, isPurchased: false, source: 'generated' },
      { id: 'q4', category: 'dairy', name: 'Fresh cow milk', quantity: 1, unit: 'l', estimatedPriceKsh: 120, isPurchased: false, source: 'generated' },
    ]);
    const items2 = put2.body.shoppingList?.items || [];
    const milkRows = items2.filter((i) => i.name.toLowerCase().includes('milk'));
    assert('Compatible volume units (ml + l) merge into one row', milkRows.length === 1, JSON.stringify(milkRows));
    assert('Merged volume is 1.5l (500ml + 1l)', milkRows[0]?.quantity === 1.5 && milkRows[0]?.unit === 'l', JSON.stringify(milkRows[0]));
  }

  console.log('── Compound ingredients never blindly collapse into a single ingredient ──');
  {
    const put = await putShoppingList(authA, [
      { id: 'x1', category: 'fruits', name: 'Sweet bananas', quantity: 3, unit: 'pieces', estimatedPriceKsh: 60, isPurchased: false, source: 'generated' },
      { id: 'x2', category: 'fruits', name: 'Sweet bananas & kachumbari', quantity: 1, unit: 'pieces', estimatedPriceKsh: 40, isPurchased: false, source: 'generated' },
      { id: 'x3', category: 'dairy', name: 'Milk', quantity: 1, unit: 'l', estimatedPriceKsh: 120, isPurchased: false, source: 'generated' },
      { id: 'x4', category: 'dairy', name: 'Fresh milk & tea leaves', quantity: 1, unit: 'pieces', estimatedPriceKsh: 30, isPurchased: false, source: 'generated' },
      { id: 'x5', category: 'dairy', name: 'Tea leaves & milk', quantity: 1, unit: 'pieces', estimatedPriceKsh: 30, isPurchased: false, source: 'generated' },
    ]);
    const items = put.body.shoppingList?.items || [];
    const bananaRow = items.find((i) => i.name === 'Sweet Bananas');
    const compoundBananaRow = items.find((i) => i.name.toLowerCase().includes('kachumbari'));
    assert('"Sweet Bananas & Kachumbari" stays distinct from plain "Sweet Bananas"', !!bananaRow && !!compoundBananaRow && bananaRow.id !== compoundBananaRow.id, JSON.stringify(items.map((i) => i.name)));
    const milkRow = items.find((i) => i.name === 'Milk');
    const compoundMilkRows = items.filter((i) => i.name.toLowerCase().includes('tea leaves') && i.name.toLowerCase().includes('milk'));
    assert('"Fresh milk & tea leaves" and "Tea leaves & milk" merge with EACH OTHER (same compound)', compoundMilkRows.length === 1, JSON.stringify(compoundMilkRows));
    assert('...but stay distinct from plain "Milk"', !!milkRow && compoundMilkRows[0]?.id !== milkRow.id, JSON.stringify({ milkRow, compoundMilkRows }));
  }

  console.log('── User isolation: canonicalized items never leak across users ──');
  {
    await putShoppingList(authB, [
      { id: 'iso1', category: 'household', name: 'Toilet paper', quantity: 99, unit: 'pieces', estimatedPriceKsh: 9999, isPurchased: false, source: 'manual' },
    ]);
    const listA = await req('/api/shopping/current', { headers: authA });
    const leaked = (listA.body.shoppingList?.items || []).some((i) => i.quantity === 99 && i.estimatedPriceKsh === 9999);
    assert("User B's items never appear in User A's canonicalized list", !leaked, JSON.stringify(listA.body.shoppingList?.items));
  }

  console.log('── Duplicate-check endpoint ──');
  {
    await putShoppingList(authA, [
      { id: 'd1', category: 'carbohydrates', name: 'Rice', quantity: 2, unit: 'kg', estimatedPriceKsh: 300, isPurchased: false, source: 'generated' },
    ]);
    const check = await req(`/api/shopping/check-duplicate?name=${encodeURIComponent('Pishori Rice')}`, { headers: authA });
    assert('check-duplicate reports a duplicate for a naming variant of an existing item', check.body.duplicate === true, JSON.stringify(check.body));
    assert('check-duplicate surfaces the existing quantity/unit', check.body.existingItem?.quantity === 2 && check.body.existingItem?.unit === 'kg', JSON.stringify(check.body));
    const checkNone = await req(`/api/shopping/check-duplicate?name=${encodeURIComponent(`Zzz Brand New Item ${stamp}`)}`, { headers: authA });
    assert('check-duplicate reports false for a genuinely new item', checkNone.body.duplicate === false, JSON.stringify(checkNone.body));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  if (userAId) await admin.auth.admin.deleteUser(userAId).catch(() => {});
  if (userBId) await admin.auth.admin.deleteUser(userBId).catch(() => {});
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
