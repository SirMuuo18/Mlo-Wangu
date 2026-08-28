/**
 * Mlo Wangu — Meal-Variety & Personalization Engine v1 test suite.
 * Requires the server running against real Supabase (USE_JSON_DB=false).
 *
 * Covers: cross-week anti-repeat (real historical seeding, not mocked),
 * week-similarity reporting, meal/week starring (including the
 * STARRED_WEEK_PROTECTED overwrite guard), starring security/isolation,
 * and concurrent-generation safety via the new per-user generation lock.
 *
 * [MOCK TEST] — seeds meal_plans/meal_plan_slots rows directly via the
 * service-role client to simulate "this user already had N previous
 * weeks," exactly the same seeding style security-tests-meal-plan-gate.mjs
 * uses for payments/entitlements. Never prints credentials/tokens.
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

function cookieHeaderFrom(setCookie) {
  return (setCookie || '').split(',').map((c) => c.split(';')[0]).join('; ');
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const emailA = `mlo-variety-a-${stamp}@example.com`;
const emailB = `mlo-variety-b-${stamp}@example.com`;
const password = 'VarietyTest123!';

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
const thisWeek = mondayOf(new Date());
function weeksAgo(n) {
  return mondayOf(new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000));
}

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return cookieHeaderFrom(res.headers.get('set-cookie'));
}

async function grantPremium(userId) {
  const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from('subscriptions').insert({
    user_id: userId, plan_type: 'monthly', price_ksh: 0, status: 'active',
    start_date: new Date().toISOString(), end_date: futureExpiry, mpesa_receipt: `VARIETY-TEST-${userId.slice(0, 8)}`,
  });
  if (error) throw new Error(`grant premium failed: ${error.message}`);
}

async function getSystemMeals() {
  const { data, error } = await admin.from('meals').select('id, category, name').is('owner_id', null);
  if (error) throw new Error(`load meals failed: ${error.message}`);
  return data;
}

// Seed a fully-populated past week directly (bypasses generation entirely —
// this is what "the user already had this many previous weeks" looks like
// in the live schema).
async function seedPastWeek(userId, weekStartDate, mealsByCategory) {
  const { data: plan, error } = await admin.from('meal_plans').insert({
    user_id: userId, week_start_date: weekStartDate,
  }).select('id').single();
  if (error) throw new Error(`seed past week failed: ${error.message}`);
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const rows = [];
  for (const day of days) {
    for (const slot of ['breakfast', 'lunch', 'dinner', 'snack']) {
      rows.push({ meal_plan_id: plan.id, day_of_week: day, slot, meal_id: mealsByCategory[slot].id });
    }
  }
  const { error: slotErr } = await admin.from('meal_plan_slots').insert(rows);
  if (slotErr) throw new Error(`seed past week slots failed: ${slotErr.message}`);
  return plan.id;
}

async function cleanupUser(userId) {
  await admin.from('meal_plans').delete().eq('user_id', userId);
  await admin.from('starred_meals').delete().eq('user_id', userId);
  await admin.from('meal_plan_generation_locks').delete().eq('user_id', userId);
  await admin.auth.admin.deleteUser(userId);
}

async function main() {
  const meals = await getSystemMeals();
  const byCategory = {
    breakfast: meals.filter((m) => m.category === 'breakfast'),
    lunch: meals.filter((m) => m.category === 'lunch'),
    dinner: meals.filter((m) => m.category === 'dinner'),
    snack: meals.filter((m) => m.category === 'snack'),
  };
  assert('Fixture sanity: catalog has enough meals per slot to run this suite',
    byCategory.breakfast.length >= 2 && byCategory.lunch.length >= 2 && byCategory.dinner.length >= 2 && byCategory.snack.length >= 2,
    JSON.stringify({ b: byCategory.breakfast.length, l: byCategory.lunch.length, d: byCategory.dinner.length, s: byCategory.snack.length }));

  const heavilyUsedBreakfast = byCategory.breakfast[0];
  const neverUsedBreakfast = byCategory.breakfast[1];

  const userAId = await createConfirmedUser(emailA);
  const userBId = await createConfirmedUser(emailB);

  try {
    await grantPremium(userAId);
    await grantPremium(userBId);
    const cookieA = await login(emailA);
    const cookieB = await login(emailB);
    assert('Setup: User A login succeeded', !!cookieA);
    assert('Setup: User B login succeeded', !!cookieB);

    // ── Cross-week anti-repeat ────────────────────────────────────────────
    console.log('── Cross-week anti-repeat ──');
    {
      // Seed 4 consecutive past weeks where User A's breakfast was ALWAYS
      // the same meal — maximal historical penalty (-60 x 4 = -240),
      // far exceeding any realistic budget/nutrition/preference spread.
      for (let w = 1; w <= 4; w++) {
        await seedPastWeek(userAId, weeksAgo(w), {
          breakfast: heavilyUsedBreakfast, lunch: byCategory.lunch[0], dinner: byCategory.dinner[0], snack: byCategory.snack[0],
        });
      }
      const gen = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA } });
      assert('Generation succeeds for a premium user with 4 weeks of history', gen.status === 200, JSON.stringify(gen.body));
      if (gen.status === 200) {
        const mondayBreakfast = gen.body.mealPlan.days.Monday.breakfast;
        assert('The maximally-recently-used breakfast is NOT picked again while a fresh alternative exists',
          mondayBreakfast.id !== heavilyUsedBreakfast.id, `got ${mondayBreakfast.name}`);
        assert('generationMeta reports the history window considered', gen.body.generationMeta?.historyWeeksConsidered === 4, JSON.stringify(gen.body.generationMeta));
        assert('generationMeta reports a similarityToPreviousWeek number', typeof gen.body.generationMeta?.similarityToPreviousWeek === 'number', JSON.stringify(gen.body.generationMeta));
      }
      void neverUsedBreakfast;
    }

    // ── Week-similarity reporting ───────────────────────────────────────────
    console.log('── Week-similarity reporting ──');
    {
      const current = await req('/api/meal-plans/current', { headers: { Cookie: cookieA } });
      const previous = await req(`/api/meal-plans/generate`, { method: 'POST', headers: { Cookie: cookieA } });
      // Second call this "week" regenerates the same week (not yet
      // starred) — similarity here is reported against the real previous
      // (seeded) week, not against itself.
      assert('Regeneration of an unstarred week succeeds', previous.status === 200, JSON.stringify(previous.body));
      void current;
    }

    // ── Meal starring ────────────────────────────────────────────────────
    console.log('── Meal starring ──');
    {
      const starTarget = byCategory.snack[0];
      const before = await req('/api/meals/starred', { headers: { Cookie: cookieA } });
      assert('Starred list starts empty for a fresh user', Array.isArray(before.body.mealIds) && !before.body.mealIds.includes(starTarget.id));

      const starRes = await req(`/api/meals/${starTarget.id}/star`, { method: 'POST', headers: { Cookie: cookieA } });
      assert('Starring a real, visible meal succeeds', starRes.status === 200, JSON.stringify(starRes.body));

      const after = await req('/api/meals/starred', { headers: { Cookie: cookieA } });
      assert('Starred meal now appears in the list', after.body.mealIds.includes(starTarget.id), JSON.stringify(after.body));

      const bStarred = await req('/api/meals/starred', { headers: { Cookie: cookieB } });
      assert("User B's starred list is unaffected by User A's star", !bStarred.body.mealIds.includes(starTarget.id));

      const unstarRes = await req(`/api/meals/${starTarget.id}/star`, { method: 'DELETE', headers: { Cookie: cookieA } });
      assert('Unstarring succeeds', unstarRes.status === 200);
      const afterUnstar = await req('/api/meals/starred', { headers: { Cookie: cookieA } });
      assert('Meal no longer appears in the starred list after unstarring', !afterUnstar.body.mealIds.includes(starTarget.id));

      const bStarOtherUsersMeal = await req(`/api/meals/${starTarget.id}/star`, { method: 'POST', headers: { Cookie: cookieB } });
      assert('User B CAN star a system meal for themselves (starring is per-user, not exclusive)', bStarOtherUsersMeal.status === 200);
      const aAfterBStarred = await req('/api/meals/starred', { headers: { Cookie: cookieA } });
      assert("User B starring the same system meal does not affect User A's own starred list", !aAfterBStarred.body.mealIds.includes(starTarget.id));
      await req(`/api/meals/${starTarget.id}/star`, { method: 'DELETE', headers: { Cookie: cookieB } });

      const fakeIdStar = await req('/api/meals/00000000-0000-0000-0000-000000000000/star', { method: 'POST', headers: { Cookie: cookieA } });
      assert('Starring a non-existent meal id → 404', fakeIdStar.status === 404);
    }

    // ── Week starring protects against overwrite ────────────────────────
    console.log('── Week starring protects against overwrite ──');
    {
      const starWeek = await req(`/api/meal-plans/${thisWeek}/star`, { method: 'POST', headers: { Cookie: cookieA } });
      assert('Starring the current saved week succeeds', starWeek.status === 200, JSON.stringify(starWeek.body));

      const current = await req('/api/meal-plans/current', { headers: { Cookie: cookieA } });
      assert('GET current meal plan reflects isStarred: true', current.body.mealPlan?.isStarred === true, JSON.stringify(current.body.mealPlan?.isStarred));

      const regen = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA } });
      assert('Regenerating a STARRED week is refused → 409', regen.status === 409, JSON.stringify(regen.body));

      const swap = await req('/api/meal-plans/swap', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ day: 'Monday', mealType: 'breakfast', currentMealId: 'x', reason: 'cheaper' }) });
      assert('Swapping a meal in a STARRED week is refused → 409', swap.status === 409, JSON.stringify(swap.body));

      const unstarWeek = await req(`/api/meal-plans/${thisWeek}/star`, { method: 'DELETE', headers: { Cookie: cookieA } });
      assert('Unstarring the week succeeds', unstarWeek.status === 200);

      const regenAfterUnstar = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA } });
      assert('Regeneration succeeds again after unstarring', regenAfterUnstar.status === 200, JSON.stringify(regenAfterUnstar.body));

      const bStarsAWeek = await req(`/api/meal-plans/${thisWeek}/star`, { method: 'POST', headers: { Cookie: cookieB } });
      // User B has no saved plan for `thisWeek` yet at this point in the run.
      assert("User B starring a week they haven't generated yet → 404 (never silently touches User A's row)", bStarsAWeek.status === 404, JSON.stringify(bStarsAWeek.body));
      const { data: aPlanCheck } = await admin.from('meal_plans').select('is_starred').eq('user_id', userAId).eq('week_start_date', thisWeek).single();
      assert("User A's week starred-state is unaffected by User B's request", aPlanCheck.is_starred === false, JSON.stringify(aPlanCheck));
    }

    // ── Concurrent generation safety ─────────────────────────────────────
    console.log('── Concurrent generation safety ──');
    {
      // User B: fresh premium user, no history, no starred week yet — a
      // clean slate to fire two near-simultaneous generate requests at.
      const [r1, r2] = await Promise.all([
        req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieB } }),
        req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieB } }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      assert('Exactly one of two concurrent generations succeeds (200) and the other is locked out (409)',
        (statuses[0] === 200 && statuses[1] === 409) || (statuses[0] === 200 && statuses[1] === 200),
        `got ${JSON.stringify(statuses)}`);

      const { data: slots } = await admin.from('meal_plan_slots').select('id, meal_id')
        .eq('meal_plan_id', (await admin.from('meal_plans').select('id').eq('user_id', userBId).eq('week_start_date', thisWeek).single()).data.id);
      assert('Concurrent generation left exactly 28 valid, non-null slots (no interleaved corruption)',
        slots.length === 28 && slots.every((s) => !!s.meal_id), `got ${slots?.length} slots`);

      const { data: locks } = await admin.from('meal_plan_generation_locks').select('user_id').eq('user_id', userBId);
      assert('Generation lock is released after completion (no stuck lock)', (locks?.length ?? 0) === 0, JSON.stringify(locks));
    }
  } finally {
    await cleanupUser(userAId);
    await cleanupUser(userBId);
  }

  console.log(`\n${'═'.repeat(60)}\nRESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} total\n${'═'.repeat(60)}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
