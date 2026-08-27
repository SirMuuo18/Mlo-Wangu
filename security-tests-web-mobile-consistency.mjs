/**
 * Mlo Wangu — Web/Mobile shared-backend consistency suite (item 13).
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * The point of this whole pre-Expo effort: web and a future Expo client
 * must read/write the exact same persistent source of truth. This suite
 * drives one full user journey through the real HTTP API as User A —
 * salary/budget category, expense, household, water, meal-plan generation,
 * shopping-list edit, a notification, and onboarding completion — checks
 * User B cannot see any of it, then re-fetches every piece of it through a
 * FRESH login (a new cookie jar, simulating "another device") to prove it
 * all actually persisted server-side rather than living in request-scoped
 * or in-process state.
 *
 * Note: there is no profile-name-edit endpoint in the app today (name is
 * set once at signup) — that dimension is checked as "persists correctly
 * per-user across a fresh session," not as an edit, since fabricating an
 * edit flow that doesn't exist would test something the app doesn't have.
 *
 * Extended for Phase 3B item 11: the shopping-list section now asserts the
 * `frequency` VALUE itself ('weekly' vs 'monthly') round-trips bit-for-bit
 * through the same save → fresh-session-read cycle already proven for
 * every other field here — closing the exact gap the Phase 3A report
 * named (frequency's presence was compile-time proven; its value was not).
 *
 * [MOCK TEST] — seeds a meal-plan-generation entitlement directly via the
 * service-role client, same as security-tests-meal-plan-gate.mjs.
 * Never prints credentials/tokens.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

let passed = 0, failed = 0;
function assert(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✅  ${name}`); }
  else { failed++; console.log(`  ❌  ${name}${detail ? `\n      → ${detail}` : ''}`); }
}

const BASE = 'http://localhost:3000';
async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let body; try { body = await res.json(); } catch { body = {}; }
  return { status: res.status, body, headers: res.headers };
}
function cookieHeaderFrom(setCookie) {
  return (setCookie || '').split(',').map((c) => c.split(';')[0]).join('; ');
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const nameA = `Consistency Test User A ${stamp}`;
const emailA = `mlo-consist-a-${stamp}@example.com`;
const emailB = `mlo-consist-b-${stamp}@example.com`;
const password = 'ConsistTest123!';
const pin = '739284';

async function createConfirmedUser(email, name) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return cookieHeaderFrom(res.headers.get('set-cookie'));
}

async function unlockBudget(cookie) {
  let res = await fetch(`${BASE}/api/financial-auth/setup-pin`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ pin, confirmPin: pin }) });
  if (res.status !== 200) res = await fetch(`${BASE}/api/financial-auth/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ pin }) });
  const finCookie = cookieHeaderFrom(res.headers.get('set-cookie'));
  return `${cookie}; ${finCookie}`;
}

console.log('\n═══ Mlo Wangu Web/Mobile Consistency Suite ═══\n');

let userAId, userBId;
try {
  userAId = await createConfirmedUser(emailA, nameA);
  userBId = await createConfirmedUser(emailB, `Consistency Test User B ${stamp}`);

  const cookieA1 = await login(emailA); // "device 1" session for A
  const cookieB = await login(emailB);
  const fullCookieA1 = await unlockBudget(cookieA1);

  // ══ User A's full journey ═══════════════════════════════════════════════
  console.log('── User A: full journey ──');

  const salary = 85000;
  const budgetRes = await req('/api/financial/budget', {
    method: 'PUT', headers: { Cookie: fullCookieA1 },
    body: JSON.stringify({ budget: { monthlyIncomeKsh: salary, incomeType: 'monthly', month: new Date().toISOString().slice(0, 7), categories: [{ category: 'Food', plannedAmountKsh: 12000, color: '#14532D' }] } }),
  });
  assert('Salary + budget category saved', budgetRes.status === 200, JSON.stringify(budgetRes.body).slice(0, 200));

  const expenseRes = await req('/api/financial/expenses', {
    method: 'POST', headers: { Cookie: fullCookieA1 },
    body: JSON.stringify({ amountKsh: 450, category: 'Food', description: `Consistency test expense ${stamp}` }),
  });
  assert('Expense logged', expenseRes.status === 200 && !!expenseRes.body.expense?.id, JSON.stringify(expenseRes.body));

  const householdRes = await req('/api/household', {
    method: 'PUT', headers: { Cookie: cookieA1 },
    body: JSON.stringify({ household: { id: `hh_${userAId}`, ownerId: userAId, name: 'Consistency Test Family', members: [{ id: 'm1', name: 'Test Member', ageGroup: 'adult', preferences: [], allergies: ['peanuts'], dislikes: [] }], createdAt: new Date().toISOString() } }),
  });
  assert('Household updated', householdRes.status === 200, JSON.stringify(householdRes.body).slice(0, 200));

  const waterRes = await req('/api/water/log', { method: 'POST', headers: { Cookie: cookieA1 }, body: JSON.stringify({ amountMl: 500 }) });
  assert('Water logged', waterRes.status === 200 && waterRes.body.waterLog?.totalMl >= 500, JSON.stringify(waterRes.body));

  const { data: pay } = await admin.from('payments').insert({ user_id: userAId, amount_ksh: 50, phone_number: '254712345678', plan_type: 'meal_plan_generation', checkout_request_id: `consist_${stamp}`, status: 'pending' }).select('*').single();
  await admin.from('meal_plan_entitlements').insert({ user_id: userAId, source: 'payment', payment_id: pay.id, expires_at: new Date(Date.now() + 3600_000).toISOString() });
  const genRes = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA1 }, body: JSON.stringify({}) });
  assert('Meal plan generated', genRes.status === 200 && !!genRes.body.mealPlan, JSON.stringify(genRes.body).slice(0, 200));

  const shoppingBefore = await req('/api/shopping/current', { headers: { Cookie: cookieA1 } });
  const items = shoppingBefore.body.shoppingList?.items ?? [];
  if (items[0]) items[0].isPurchased = true;
  // Item 11 — shopping-frequency cross-client round-trip: the Phase 3A
  // report named this exact gap explicitly (frequency's presence was
  // compile-time proven, but no test asserted the VALUE itself survives a
  // real save → read cycle). Two items with different, explicitly-set
  // frequency values, appended to the same whole-list PUT this section
  // already exercises — not a new save path, not a new test file.
  const weeklyMarkerItem = { id: `freq_weekly_${stamp}`, category: 'other', name: 'Frequency Test — Weekly', quantity: 1, unit: 'pc', estimatedPriceKsh: 10, isPurchased: false, frequency: 'weekly', source: 'manual' };
  const monthlyMarkerItem = { id: `freq_monthly_${stamp}`, category: 'other', name: 'Frequency Test — Monthly', quantity: 1, unit: 'pc', estimatedPriceKsh: 20, isPurchased: false, frequency: 'monthly', source: 'manual' };
  const shoppingRes = await req('/api/shopping/current', {
    method: 'PUT', headers: { Cookie: cookieA1 },
    body: JSON.stringify({ shoppingList: { ...shoppingBefore.body.shoppingList, items: [...items, weeklyMarkerItem, monthlyMarkerItem] } }),
  });
  assert('Shopping list modified', shoppingRes.status === 200, JSON.stringify(shoppingRes.body).slice(0, 200));
  const savedWeekly = shoppingRes.body.shoppingList?.items?.find((i) => i.name === 'Frequency Test — Weekly');
  const savedMonthly = shoppingRes.body.shoppingList?.items?.find((i) => i.name === 'Frequency Test — Monthly');
  assert("Item 11: 'weekly' frequency value is exactly what was sent, in the same PUT response", savedWeekly?.frequency === 'weekly', JSON.stringify(savedWeekly));
  assert("Item 11: 'monthly' frequency value is exactly what was sent, in the same PUT response", savedMonthly?.frequency === 'monthly', JSON.stringify(savedMonthly));

  const { data: notif } = await admin.from('notifications').insert({ user_id: userAId, title: 'Consistency test notification', message: 'created for the web/mobile consistency suite', type: 'system' }).select('*').single();
  assert('Notification created for User A', !!notif?.id);

  const onboardRes = await req('/api/onboarding/complete', { method: 'POST', headers: { Cookie: cookieA1 }, body: JSON.stringify({}) });
  assert('Onboarding completed', onboardRes.status === 200, JSON.stringify(onboardRes.body));

  // ══ User B cannot see any of User A's private data ═══════════════════════
  console.log('── User B: isolation ──');
  const bNotifs = await req('/api/notifications', { headers: { Cookie: cookieB } });
  assert("User B's notifications do not include A's", !bNotifs.body.notifications?.some((n) => n.id === notif.id), JSON.stringify(bNotifs.body).slice(0, 200));

  const bMealPlan = await req('/api/meal-plans/current', { headers: { Cookie: cookieB } });
  assert("User B has no meal plan of their own (A's is not visible to them)", bMealPlan.status === 200 && !bMealPlan.body.mealPlan);

  const bMe = await req('/api/auth/me', { headers: { Cookie: cookieB } });
  assert("User B's own onboarding state is independently false (not affected by A's completion)", bMe.body.user?.onboardingComplete === false, JSON.stringify(bMe.body));

  // ══ Fresh session for User A ("another device") sees everything ═════════
  console.log('── User A: fresh session (\"another device\") sees everything ──');
  const cookieA2 = await login(emailA);
  const fullCookieA2 = await unlockBudget(cookieA2);

  const meA2 = await req('/api/auth/me', { headers: { Cookie: cookieA2 } });
  assert("Fresh session: name persisted correctly", meA2.body.user?.name === nameA, JSON.stringify(meA2.body));
  assert('Fresh session: onboardingComplete is true', meA2.body.user?.onboardingComplete === true, JSON.stringify(meA2.body));

  const budgetA2 = await req('/api/financial/budget', { headers: { Cookie: fullCookieA2 } });
  assert('Fresh session: salary persisted', budgetA2.body.budget?.monthlyIncomeKsh === salary, JSON.stringify(budgetA2.body));
  assert('Fresh session: budget category persisted', budgetA2.body.budget?.categories?.some((c) => c.category === 'Food' && c.plannedAmountKsh === 12000), JSON.stringify(budgetA2.body));

  const expensesA2 = await req('/api/financial/expenses', { headers: { Cookie: fullCookieA2 } });
  assert('Fresh session: expense persisted', expensesA2.body.expenses?.some((e) => e.id === expenseRes.body.expense.id), JSON.stringify(expensesA2.body).slice(0, 200));

  const householdA2 = await req('/api/household', { headers: { Cookie: cookieA2 } });
  assert('Fresh session: household persisted', householdA2.body.household?.members?.some((m) => m.name === 'Test Member' && m.allergies.includes('peanuts')), JSON.stringify(householdA2.body).slice(0, 200));

  const waterA2 = await req('/api/water/today', { headers: { Cookie: cookieA2 } });
  assert('Fresh session: water log persisted', (waterA2.body.waterLog?.totalMl ?? 0) >= 500, JSON.stringify(waterA2.body).slice(0, 200));

  const mealPlanA2 = await req('/api/meal-plans/current', { headers: { Cookie: cookieA2 } });
  assert('Fresh session: meal plan persisted with real ownership', mealPlanA2.body.mealPlan?.userId === userAId, JSON.stringify(mealPlanA2.body).slice(0, 200));

  const shoppingA2 = await req('/api/shopping/current', { headers: { Cookie: cookieA2 } });
  assert('Fresh session: shopping list edit persisted', shoppingA2.body.shoppingList?.items?.some((i) => i.isPurchased === true), JSON.stringify(shoppingA2.body).slice(0, 200));
  // Item 11 — this is the real round-trip proof: a completely fresh
  // session (new cookie jar, exactly what a second device / the mobile
  // client would be) reading back from the database, not the same
  // in-memory response the PUT above already returned.
  const freshWeekly = shoppingA2.body.shoppingList?.items?.find((i) => i.name === 'Frequency Test — Weekly');
  const freshMonthly = shoppingA2.body.shoppingList?.items?.find((i) => i.name === 'Frequency Test — Monthly');
  assert("Item 11: fresh session — 'weekly' value round-trips bit-for-bit through a real save → read cycle", freshWeekly?.frequency === 'weekly', JSON.stringify(freshWeekly));
  assert("Item 11: fresh session — 'monthly' value round-trips bit-for-bit through a real save → read cycle", freshMonthly?.frequency === 'monthly', JSON.stringify(freshMonthly));
  assert('Item 11: the two frequency values are genuinely distinct, not both defaulting to the same fallback', freshWeekly?.frequency !== freshMonthly?.frequency, JSON.stringify({ freshWeekly, freshMonthly }));

  const notifsA2 = await req('/api/notifications', { headers: { Cookie: cookieA2 } });
  assert('Fresh session: notification persisted and owned by A', notifsA2.body.notifications?.some((n) => n.id === notif.id), JSON.stringify(notifsA2.body).slice(0, 200));
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (userAId) {
      await admin.from('meal_plan_entitlements').delete().eq('user_id', userAId);
      await admin.from('payments').delete().eq('user_id', userAId);
      await admin.from('meal_plans').delete().eq('user_id', userAId);
      await admin.from('shopping_lists').delete().eq('user_id', userAId);
      await admin.from('notifications').delete().eq('user_id', userAId);
      await admin.from('expenses').delete().eq('user_id', userAId);
      await admin.auth.admin.deleteUser(userAId);
    }
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
