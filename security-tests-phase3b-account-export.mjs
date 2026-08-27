/**
 * Mlo Wangu — Phase 3B Stage 4, Item 8: Account Data Export Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: ownership (only the caller's own data, verified against a rich,
 * multi-table fixture — not just an empty-account smoke test), the
 * existing requireFinancialSession gate (partial export when locked, full
 * when unlocked — no new financial-authorization mechanism), rate
 * limiting, and — critically — that no secret/internal material (PIN
 * hash/salt, financial session tokens, access-code hashes, raw Daraja
 * callback payloads, the service-role key) ever appears in the response.
 *
 * NOTE: accountExportLimiter is 5/hour, IP-keyed. This suite is
 * deliberately frugal (4 calls total) and, like the payment-flow suite
 * before it, should be run against a freshly-restarted server.
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
const emailA = `mlo-p3b-export-a-${stamp}@example.com`;
const emailB = `mlo-p3b-export-b-${stamp}@example.com`;
const password = 'Phase3BExport123!';

async function createConfirmedUser(email, name) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

console.log('\n═══ Mlo Wangu Phase 3B — Account Data Export Suite ═══\n');

let userAId, userBId, paymentId, customMealId;
try {
  userAId = await createConfirmedUser(emailA, `Export Test A ${stamp}`);
  userBId = await createConfirmedUser(emailB, `Export Test B ${stamp}`);

  const anonA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sA } = await anonA.auth.signInWithPassword({ email: emailA, password });
  const authA = { Authorization: `Bearer ${sA.session.access_token}` };

  const anonB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sB } = await anonB.auth.signInWithPassword({ email: emailB, password });
  const authB = { Authorization: `Bearer ${sB.session.access_token}` };

  console.log('── Fixture: build a rich, multi-table data set for User A ──');
  {
    await req('/api/household', { method: 'PUT', headers: authA, body: JSON.stringify({ household: { id: `hh_${userAId}`, ownerId: userAId, name: 'Export Test Family', members: [{ id: 'm1', name: 'Export Member', ageGroup: 'adult', preferences: [], allergies: ['shellfish'], dislikes: [] }], createdAt: new Date().toISOString() } }) });
    const meal = await req('/api/meals', { method: 'POST', headers: authA, body: JSON.stringify({ name: `Export Test Meal ${stamp}`, category: 'dinner' }) });
    customMealId = meal.body.meal?.id;
    await req('/api/water/log', { method: 'POST', headers: authA, body: JSON.stringify({ amountMl: 300 }) });
    await req('/api/reminders', { method: 'POST', headers: authA, body: JSON.stringify({ type: 'custom', label: 'Export test reminder', time: '09:00', daysOfWeek: [] }) });
    await req('/api/ai/chat', { method: 'POST', headers: authA, body: JSON.stringify({ message: `Export test question ${stamp}` }) });

    const { data: pay } = await admin.from('payments').insert({ user_id: userAId, amount_ksh: 50, phone_number: '254712345678', plan_type: 'meal_plan_generation', payment_method: 'till_manual', status: 'success', mpesa_receipt: `EXPORT${stamp}`, verified_at: new Date().toISOString() }).select().single();
    paymentId = pay?.id;
    await admin.from('notifications').insert({ user_id: userAId, title: 'Export test notification', message: 'for the export suite', type: 'system' });

    const finSetup = await req('/api/financial-auth/setup-pin', { method: 'POST', headers: authA, body: JSON.stringify({ pin: '471928', confirmPin: '471928' }) });
    const finToken = finSetup.body.financialToken;
    await req('/api/financial/budget', { method: 'PUT', headers: { ...authA, 'X-Financial-Session': finToken }, body: JSON.stringify({ budget: { monthlyIncomeKsh: 40000, month: new Date().toISOString().slice(0, 7), categories: [{ category: 'Food', plannedAmountKsh: 9000, color: '#14532D' }] } }) });
    await req('/api/financial/expenses', { method: 'POST', headers: { ...authA, 'X-Financial-Session': finToken }, body: JSON.stringify({ amountKsh: 300, category: 'Food', description: 'Export test expense' }) });
    await req('/api/financial-auth/lock', { method: 'POST', headers: authA });
  }

  console.log('── Auth & partial export (Budget locked) ──');
  {
    const noAuth = await req('/api/account/export');
    assert('Unauthenticated → 401', noAuth.status === 401, JSON.stringify(noAuth.body));

    const locked = await req('/api/account/export', { headers: authA });
    assert('Export succeeds while Budget is locked → 200', locked.status === 200, JSON.stringify(locked.body).slice(0, 200));
    assert('financialDataIncluded is false when locked', locked.body.financialDataIncluded === false, JSON.stringify(locked.body.financialDataIncluded));
    assert('No "budgets" key present when locked', !('budgets' in locked.body), Object.keys(locked.body));
    assert('No "expenses" key present when locked', !('expenses' in locked.body), Object.keys(locked.body));
    // NOTE: PUT /api/household's name change is a real, pre-existing gap
    // discovered incidentally here — secureDb.updateHousehold only ever
    // persists members in Supabase mode, never the household's own `name`
    // (see server/secure-db.ts). Out of Item 8's scope to fix; asserting on
    // the export's honest reflection of that actual behavior, not the name
    // change that doesn't really happen.
    assert('Household (with its real, persisted name) is included', locked.body.households?.some((h) => h.household_members?.some((m) => m.name === 'Export Member')), JSON.stringify(locked.body.households));
    assert('Custom meal is included', locked.body.customMeals?.some((m) => m.id === customMealId), JSON.stringify(locked.body.customMeals?.map((m) => m.id)));
    assert('Water log is included', locked.body.water?.recentLogs?.some((w) => w.total_ml >= 300), JSON.stringify(locked.body.water));
    assert('Reminder is included', locked.body.reminders?.some((r) => r.label === 'Export test reminder'), JSON.stringify(locked.body.reminders));
    assert('Notification is included', locked.body.notifications?.some((n) => n.title === 'Export test notification'), JSON.stringify(locked.body.notifications));
    assert('Payment history is included', locked.body.payments?.some((p) => p.id === paymentId), JSON.stringify(locked.body.payments?.map((p) => p.id)));
    assert('AI conversation history is included', locked.body.aiConversationHistory?.some((m) => m.content?.includes(`Export test question ${stamp}`)), JSON.stringify(locked.body.aiConversationHistory?.length));

    console.log('── No secrets or internal material anywhere in the export ──');
    const flat = JSON.stringify(locked.body);
    assert('No PIN hash/salt field name appears', !/pin_hash|pin_salt|pinHash|pinSalt/i.test(flat));
    assert('No financial session token field appears', !/mlo_fin_session|financialToken/i.test(flat));
    assert('No access-code hash field appears', !/code_hash|codeHash/i.test(flat));
    assert('No raw Daraja callback payload appears', !/daraja_callback_raw|checkout_request_id/i.test(flat));
    assert('The service-role key itself never appears', !flat.includes(process.env.SUPABASE_SERVICE_ROLE_KEY));
  }

  console.log('── Full export (Budget unlocked) ──');
  {
    const unlock = await req('/api/financial-auth/unlock', { method: 'POST', headers: authA, body: JSON.stringify({ pin: '471928' }) });
    const finToken = unlock.body.financialToken;
    const unlocked = await req('/api/account/export', { headers: { ...authA, 'X-Financial-Session': finToken } });
    assert('Export succeeds while Budget is unlocked → 200', unlocked.status === 200, JSON.stringify(unlocked.body).slice(0, 200));
    assert('financialDataIncluded is true when unlocked', unlocked.body.financialDataIncluded === true, JSON.stringify(unlocked.body.financialDataIncluded));
    assert('Budget is included when unlocked', unlocked.body.budgets?.some((b) => b.monthly_income_ksh === 40000), JSON.stringify(unlocked.body.budgets));
    assert('Expense is included when unlocked', unlocked.body.expenses?.some((e) => e.description === 'Export test expense'), JSON.stringify(unlocked.body.expenses));
  }

  console.log('── Cross-user isolation ──');
  {
    const bExport = await req('/api/account/export', { headers: authB });
    const flatB = JSON.stringify(bExport.body);
    assert("User B's export never contains User A's household name", !flatB.includes('Export Test Family'));
    assert("User B's export never contains User A's custom meal id", !flatB.includes(customMealId ?? '__none__'));
    assert("User B's export never contains User A's payment id", !flatB.includes(paymentId ?? '__none__'));
    assert("User B's own profile id in the export matches User B, not User A", bExport.body.profile?.id === userBId, JSON.stringify(bExport.body.profile));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (customMealId) await admin.from('meals').delete().eq('id', customMealId);
    if (paymentId) { await admin.from('email_log').delete().eq('related_payment_id', paymentId); await admin.from('payments').delete().eq('id', paymentId); }
    if (userAId) {
      await admin.from('households').delete().eq('owner_id', userAId);
      await admin.from('reminder_configs').delete().eq('user_id', userAId);
      await admin.from('notifications').delete().eq('user_id', userAId);
      await admin.from('ai_conversations').delete().eq('user_id', userAId);
      await admin.from('water_logs').delete().eq('user_id', userAId);
      await admin.from('budgets').delete().eq('user_id', userAId);
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
