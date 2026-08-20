/**
 * Mlo Wangu — Live Supabase Attack Suite (Priorities 3, 4, 5, 6, 8, 11)
 * Requires the server running against a REAL Supabase project (USE_JSON_DB=false).
 * Creates its own throwaway test users via the service-role admin API, and
 * cleans them up at the end. Never prints keys/tokens.
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
  return { status: res.status, body, headers: res.headers };
}

function cookieHeaderFrom(setCookie) {
  return (setCookie || '').split(',').map((c) => c.split(';')[0]).join('; ');
}

// Calls setup-pin (falls back to unlock if a PIN already exists for this user)
// and returns the auth cookie combined with the fin_session cookie from the
// response, so subsequent financial calls in the same test are authorized.
async function withFinancialSession(authCookie, pin) {
  let res = await fetch(`${BASE}/api/financial-auth/setup-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ pin, confirmPin: pin }),
  });
  if (res.status !== 200) {
    res = await fetch(`${BASE}/api/financial-auth/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: authCookie },
      body: JSON.stringify({ pin }),
    });
  }
  const finCookie = cookieHeaderFrom(res.headers.get('set-cookie'));
  return `${authCookie}; ${finCookie}`;
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const emailA = `mlo-live-a-${stamp}@example.com`;
const emailB = `mlo-live-b-${stamp}@example.com`;
const password = 'LiveTest123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await res.json();
  return { cookie: cookieHeaderFrom(res.headers.get('set-cookie')), body, status: res.status };
}

console.log('\n═══ Mlo Wangu Live Supabase Attack Suite ═══\n');

let userAId, userBId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);

  const loginA = await login(emailA);
  const loginB = await login(emailB);
  assert('User A live login succeeds', loginA.status === 200, JSON.stringify(loginA.body));
  assert('User B live login succeeds', loginB.status === 200, JSON.stringify(loginB.body));
  const cookieA = loginA.cookie;
  const cookieB = loginB.cookie;

  // ── Attack #17/#19: malformed / garbage JWT ──────────────────────────────
  console.log('── Malformed / garbage auth ──');
  {
    const r = await req('/api/auth/me', { headers: { Cookie: 'mlo_auth_session=not.a.real.jwt' } });
    assert('Malformed JWT → 401', r.status === 401, `got ${r.status}`);
  }

  // ── requireAuth routes: no cookie → real 401 (Supabase mode has no auto-auth) ──
  console.log('── No-auth → 401 (real check, not JSON auto-auth) ──');
  {
    for (const ep of ['/api/household', '/api/meal-plans/current', '/api/notifications', '/api/admin/stats']) {
      const r = await req(ep);
      assert(`${ep} with no auth → 401`, r.status === 401, `got ${r.status}`);
    }
  }

  // ── Attack #6/#7/#8: cross-user budget / expenses / household ──────────
  console.log('── Cross-user isolation: budget, expenses, household ──');
  const finA = await withFinancialSession(cookieA, '481923');
  const finB = await withFinancialSession(cookieB, '592017');
  {
    const budgetA = await req('/api/financial/budget', { method: 'PUT', headers: { Cookie: finA }, body: JSON.stringify({ budget: { month: '2026-08', monthlyIncomeKsh: 41000, incomeType: 'monthly', categories: [{ category: 'Rent', plannedAmountKsh: 12000, color: '#111' }] } }) });
    assert('User A can write their own budget', budgetA.status === 200, JSON.stringify(budgetA.body));

    const budgetBRead = await req('/api/financial/budget', { headers: { Cookie: finB } });
    assert('User B reading their own (empty) budget never shows User A income', budgetBRead.body?.budget?.monthlyIncomeKsh !== 41000, JSON.stringify(budgetBRead.body));

    const expenseA = await req('/api/financial/expenses', { method: 'POST', headers: { Cookie: finA }, body: JSON.stringify({ amountKsh: 555, category: 'Food', description: 'A private grocery run' }) });
    assert('User A can log their own expense', expenseA.status === 200, JSON.stringify(expenseA.body));

    const expensesB = await req('/api/financial/expenses', { headers: { Cookie: finB } });
    const leaked = (expensesB.body?.expenses || []).some((e) => e.description === 'A private grocery run');
    assert('User B never sees User A expense in their own expense list', !leaked, JSON.stringify(expensesB.body));

    const householdA = await req('/api/household', { method: 'PUT', headers: { Cookie: cookieA }, body: JSON.stringify({ household: { members: [{ id: 'm1', name: 'A-Only Member', ageGroup: 'adult', preferences: [], allergies: [], dislikes: [] }] } }) });
    assert('User A can set their own household', householdA.status === 200, JSON.stringify(householdA.body));

    const householdB = await req('/api/household', { headers: { Cookie: cookieB } });
    const leakedMember = (householdB.body?.household?.members || []).some((m) => m.name === 'A-Only Member');
    assert('User B never sees User A household member', !leakedMember, JSON.stringify(householdB.body));
  }

  // ── Attack #9: cross-user shopping list (JSON-backed, real distinct auth) ──
  console.log('── Cross-user isolation: shopping list (JSON-backed) ──');
  {
    const week = new Date().toISOString().split('T')[0];
    const setA = await req('/api/shopping/current', { method: 'PUT', headers: { Cookie: cookieA }, body: JSON.stringify({ shoppingList: { id: `sl_livetest_${stamp}`, weekStartDate: week, items: [{ id: 'i1', category: 'vegetables', name: 'A-Only Item', quantity: 1, unit: 'kg', estimatedPriceKsh: 10, isPurchased: false }], updatedAt: new Date().toISOString() } }) });
    assert('User A can set their own shopping list', setA.status === 200, JSON.stringify(setA.body));

    const getB = await req('/api/shopping/current', { headers: { Cookie: cookieB } });
    const leakedItem = (getB.body?.shoppingList?.items || []).some((i) => i.name === 'A-Only Item');
    assert('User B never sees User A shopping list item (no first-record fallback leak)', !leakedItem, JSON.stringify(getB.body));
  }

  // ── Attack #10: cross-user custom meal ────────────────────────────────
  console.log('── Cross-user isolation: custom meals ──');
  {
    const createNoAuth = await req('/api/meals', { method: 'POST', body: JSON.stringify({ name: 'Should Fail No Auth', category: 'dinner' }) });
    assert('Creating a custom meal with no auth → 401', createNoAuth.status === 401, `got ${createNoAuth.status}`);

    const createA = await req('/api/meals', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ name: 'A-Only Private Meal', category: 'dinner', ownerId: userBId }) });
    assert('User A meal is owned by A even if body tries to set ownerId=B', createA.body?.meal?.ownerId === userAId, JSON.stringify(createA.body));
    const mealId = createA.body?.meal?.id;

    const listB = await req('/api/meals', { headers: { Cookie: cookieB } });
    const bCanSeeAMeal = (listB.body?.meals || []).some((m) => m.id === mealId);
    assert('User B cannot see User A private custom meal in catalog list', !bCanSeeAMeal);

    const getAsB = await req(`/api/meals/${mealId}`, { headers: { Cookie: cookieB } });
    assert('User B fetching User A private meal by id → 404', getAsB.status === 404, `got ${getAsB.status}`);

    const deleteAsB = await req(`/api/meals/${mealId}`, { method: 'DELETE', headers: { Cookie: cookieB } });
    assert('User B cannot delete User A private meal', deleteAsB.status === 404, `got ${deleteAsB.status}`);

    const getAsA = await req(`/api/meals/${mealId}`, { headers: { Cookie: cookieA } });
    assert('User A can still see their own private meal after Bs failed delete attempt', getAsA.status === 200);

    const deleteAsA = await req(`/api/meals/${mealId}`, { method: 'DELETE', headers: { Cookie: cookieA } });
    assert('User A can delete their own meal', deleteAsA.status === 200, JSON.stringify(deleteAsA.body));
  }

  // ── Attack #12: normal user vs admin route ────────────────────────────
  console.log('── Admin authorization: 401 / 403 / 200 ──');
  {
    const noAuth = await req('/api/admin/stats');
    assert('Admin route, no auth → 401', noAuth.status === 401, `got ${noAuth.status}`);

    const nonAdmin = await req('/api/admin/stats', { headers: { Cookie: cookieA } });
    assert('Admin route, authenticated non-admin → 403', nonAdmin.status === 403, `got ${nonAdmin.status}`);

    // Promote User A to admin directly via the service-role client (real DB
    // write — the running server reads this live from Supabase, no restart
    // needed, unlike the JSON file case).
    await admin.from('profiles').update({ role: 'admin' }).eq('id', userAId);
    const asAdmin = await req('/api/admin/stats', { headers: { Cookie: cookieA } });
    assert('Admin route, authenticated ADMIN → 200', asAdmin.status === 200, JSON.stringify(asAdmin.body));
    await admin.from('profiles').update({ role: 'user' }).eq('id', userAId);
  }

  // ── Attack #18: logout revocation ─────────────────────────────────────
  console.log('── Logout session revocation ──');
  {
    const loginC = await login(emailB);
    const meBefore = await req('/api/auth/me', { headers: { Cookie: loginC.cookie } });
    assert('Fresh session works before logout', meBefore.status === 200, JSON.stringify(meBefore.body));

    await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: loginC.cookie } });

    const meAfter = await req('/api/auth/me', { headers: { Cookie: loginC.cookie } });
    assert('Same (captured) access token rejected after logout — real server-side revocation, not just a cleared cookie', meAfter.status === 401, `got ${meAfter.status}`);
  }

  // ── Historical budgets (Priority 8) ───────────────────────────────────
  console.log('── Historical budget browsing + cross-user isolation ──');
  {
    const loginA2 = await login(emailA);
    const finA2 = await withFinancialSession(loginA2.cookie, '481923');
    const pastMonth = '2025-01';
    const setPast = await req('/api/financial/budget', { method: 'PUT', headers: { Cookie: finA2 }, body: JSON.stringify({ budget: { month: pastMonth, monthlyIncomeKsh: 9999, incomeType: 'monthly', categories: [] } }) });
    assert('User A can write a historical month budget', setPast.status === 200, JSON.stringify(setPast.body));

    const readPast = await req(`/api/financial/budget?month=${pastMonth}`, { headers: { Cookie: finA2 } });
    assert('User A can read that historical month back (not silently current-month-only)', readPast.body?.budget?.monthlyIncomeKsh === 9999, JSON.stringify(readPast.body));

    const loginB2 = await login(emailB);
    const finB2 = await withFinancialSession(loginB2.cookie, '592017');
    const readPastAsB = await req(`/api/financial/budget?month=${pastMonth}`, { headers: { Cookie: finB2 } });
    assert('User B requesting User A historical month never sees it', readPastAsB.body?.budget?.monthlyIncomeKsh !== 9999, JSON.stringify(readPastAsB.body));
  }

  // ── Attack #16: brute-force login (real wrong passwords, real 429) ────
  // Runs LAST: it exhausts the IP-wide login rate limiter, which would
  // otherwise starve every later legitimate login in this same test run
  // (the limiter is intentionally per-IP, not per-account).
  console.log('── Brute-force login (real credential checks) ──');
  {
    let got429 = false, lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const r = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: emailA, password: 'definitely-wrong' }) });
      lastStatus = r.status;
      if (r.status === 429) { got429 = true; break; }
    }
    assert('Real login brute force → 429 after threshold', got429, `last status: ${lastStatus}`);
  }

} finally {
  // Cleanup: delete throwaway test users (cascades to their private data via
  // ON DELETE CASCADE in the schema).
  if (userAId) await admin.auth.admin.deleteUser(userAId).catch(() => {});
  if (userBId) await admin.auth.admin.deleteUser(userBId).catch(() => {});
}

console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
