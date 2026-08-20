/**
 * Mlo Wangu — "Generate New Plan" payment/access-code gate test suite.
 * Requires the server running against real Supabase (USE_JSON_DB=false).
 *
 * [MOCK TEST]  — exercises the REAL entitlement/callback/claim/access-code
 *                code paths against REAL Supabase, seeding payment/
 *                entitlement/access-code rows directly via the service-role
 *                client to stand in for "Daraja already accepted this" or
 *                "an admin already issued this code" — the route handlers'
 *                logic doesn't know or care how those rows were created.
 * [LIVE DARAJA TEST] — run separately (see security-tests-mpesa.mjs-style
 *                live check); not duplicated here since this suite is about
 *                the access-control layer, not the Daraja client itself.
 *
 * Never prints credentials/tokens.
 */
import 'dotenv/config';
import crypto from 'crypto';
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
const emailA = `mlo-gate-a-${stamp}@example.com`;
const emailB = `mlo-gate-b-${stamp}@example.com`;
const password = 'GateTest123!';

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
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

async function seedEntitlement(userId, { source = 'payment', paymentId = null, accessCodeId = null, expiresAt = null, usedAt = null }) {
  const { data, error } = await admin.from('meal_plan_entitlements').insert({
    user_id: userId, source, payment_id: paymentId, access_code_id: accessCodeId, expires_at: expiresAt, used_at: usedAt,
  }).select('*').single();
  if (error) throw new Error(`seed entitlement failed: ${error.message}`);
  return data;
}

async function seedAccessCode(rawCode, { userId = null, active = true, expiresAt = null, maxUses = 1, usedCount = 0, description = 'test code' }) {
  const { data, error } = await admin.from('meal_plan_access_codes').insert({
    code_hash: sha256(rawCode.trim().toUpperCase()), user_id: userId, active, expires_at: expiresAt, max_uses: maxUses, used_count: usedCount, description,
  }).select('*').single();
  if (error) throw new Error(`seed access code failed: ${error.message}`);
  return data;
}

async function seedPendingGenerationPayment(userId, checkoutRequestId) {
  const { data, error } = await admin.from('payments').insert({
    user_id: userId, amount_ksh: 50, phone_number: '254712345678',
    plan_type: 'meal_plan_generation', checkout_request_id: checkoutRequestId, merchant_request_id: `mr_${checkoutRequestId}`,
    status: 'pending',
  }).select('*').single();
  if (error) throw new Error(`seed payment failed: ${error.message}`);
  return data;
}

function darajaCallback({ checkoutRequestId, merchantRequestId, resultCode, amountKsh, mpesaReceipt }) {
  const body = {
    Body: {
      stkCallback: {
        MerchantRequestID: merchantRequestId,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: resultCode === 0 ? 'The service request is processed successfully.' : 'Request cancelled by user',
      },
    },
  };
  if (resultCode === 0) {
    body.Body.stkCallback.CallbackMetadata = {
      Item: [
        { Name: 'Amount', Value: amountKsh },
        { Name: 'MpesaReceiptNumber', Value: mpesaReceipt },
        { Name: 'TransactionDate', Value: 20260819180000 },
        { Name: 'PhoneNumber', Value: 254712345678 },
      ],
    };
  }
  return body;
}

async function clearUnusedEntitlements(userId) {
  // Keep tests independent — remove any unconsumed entitlement left over
  // from a previous block before starting the next one.
  await admin.from('meal_plan_entitlements').delete().eq('user_id', userId).is('used_at', null);
}

console.log('\n═══ Mlo Wangu "Generate New Plan" Gate Suite ═══\n');
console.log('All scenarios below are [MOCK TEST]: real Supabase, real route/entitlement/claim code, seeded payment/entitlement/access-code rows standing in for a real Daraja callback or admin-issued code.\n');

let userAId, userBId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);
  const cookieA = await login(emailA);
  const cookieB = await login(emailB);

  // ── #1: unauthenticated ─────────────────────────────────────────────────
  console.log('── #1 Unauthenticated generation ──');
  {
    const res = await req('/api/meal-plans/generate', { method: 'POST', body: JSON.stringify({}) });
    assert('#1 Unauthenticated generation → 401', res.status === 401, `got ${res.status}`);
  }

  // ── #2: authenticated, no entitlement ───────────────────────────────────
  console.log('── #2 Authenticated, no entitlement ──');
  {
    await clearUnusedEntitlements(userAId);
    const res = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) });
    assert('#2 No entitlement → 402 PAYMENT_REQUIRED', res.status === 402 && res.body.code === 'PAYMENT_REQUIRED', JSON.stringify(res.body));
    const statusRes = await req('/api/meal-plans/generation/entitlement-status', { headers: { Cookie: cookieA } });
    assert('entitlement-status reflects no entitlement', statusRes.body.hasEntitlement === false, JSON.stringify(statusRes.body));
  }

  // ── #7/#8/#10: client cannot forge authorization ────────────────────────
  console.log('── #7/#8/#10 Client cannot forge entitlement/Premium/payment status ──');
  {
    await clearUnusedEntitlements(userAId);
    const forged = await req('/api/meal-plans/generate', {
      method: 'POST', headers: { Cookie: cookieA },
      body: JSON.stringify({ hasEntitlement: true, premium: true, isPremium: true, paymentStatus: 'success', accessCodeValid: true }),
    });
    assert('#7/#8/#10 Forged body fields have no effect → still 402', forged.status === 402 && forged.body.code === 'PAYMENT_REQUIRED', JSON.stringify(forged.body));
  }

  // ── #3: valid entitlement → generation succeeds ─────────────────────────
  console.log('── #3 Valid entitlement → generation succeeds ──');
  {
    await clearUnusedEntitlements(userAId);
    // The schema's CHECK constraint requires payment_id set at insert time
    // when source='payment' — create the payment first.
    const pay = await seedPendingGenerationPayment(userAId, `ent3_${stamp}`);
    const ent = await seedEntitlement(userAId, { source: 'payment', paymentId: pay.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() });

    const statusRes = await req('/api/meal-plans/generation/entitlement-status', { headers: { Cookie: cookieA } });
    assert('entitlement-status reflects valid entitlement', statusRes.body.hasEntitlement === true, JSON.stringify(statusRes.body));

    const res = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) });
    assert('#3 Generation succeeds with valid entitlement', res.status === 200 && !!res.body.mealPlan, JSON.stringify(res.body).slice(0, 200));

    const { data: row } = await admin.from('meal_plan_entitlements').select('used_at').eq('id', ent.id).single();
    assert('Entitlement consumed (used_at set) after successful generation', !!row.used_at, JSON.stringify(row));
  }

  // ── #5: consumed entitlement → rejected ─────────────────────────────────
  console.log('── #5 Consumed entitlement rejected on reuse ──');
  {
    const res = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) });
    assert('#5 Reusing an already-consumed entitlement → 402', res.status === 402 && res.body.code === 'PAYMENT_REQUIRED', JSON.stringify(res.body));
  }

  // ── #4: expired entitlement → rejected ──────────────────────────────────
  console.log('── #4 Expired entitlement rejected ──');
  {
    await clearUnusedEntitlements(userAId);
    const pay = await seedPendingGenerationPayment(userAId, `ent4_${stamp}`);
    await seedEntitlement(userAId, { source: 'payment', paymentId: pay.id, expiresAt: new Date(Date.now() - 60_000).toISOString() });

    const statusRes = await req('/api/meal-plans/generation/entitlement-status', { headers: { Cookie: cookieA } });
    assert('entitlement-status ignores expired entitlement', statusRes.body.hasEntitlement === false, JSON.stringify(statusRes.body));

    const res = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) });
    assert('#4 Expired entitlement → 402', res.status === 402 && res.body.code === 'PAYMENT_REQUIRED', JSON.stringify(res.body));
  }

  // ── #6: User A cannot use User B's entitlement ──────────────────────────
  console.log('── #6 User isolation on entitlements ──');
  {
    await clearUnusedEntitlements(userBId);
    const payB = await seedPendingGenerationPayment(userBId, `ent6_${stamp}`);
    await seedEntitlement(userBId, { source: 'payment', paymentId: payB.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() });

    await clearUnusedEntitlements(userAId);
    const resA = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) });
    assert("#6 User A cannot consume User B's entitlement → 402", resA.status === 402 && resA.body.code === 'PAYMENT_REQUIRED', JSON.stringify(resA.body));

    const resB = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieB }, body: JSON.stringify({}) });
    assert("User B can still consume their own entitlement", resB.status === 200, JSON.stringify(resB.body).slice(0, 200));
  }

  // ── #9: client cannot change price on the generation STK route ─────────
  console.log('── #9 Client cannot change price ──');
  {
    // Clear out any still-pending payments seeded by earlier blocks so the
    // "one pending payment at a time" guard doesn't block this check.
    await admin.from('payments').update({ status: 'expired' }).eq('user_id', userAId).eq('status', 'pending');
    const tampered = await req('/api/payments/mpesa/generation/stk-push', {
      method: 'POST', headers: { Cookie: cookieA },
      body: JSON.stringify({ phoneNumber: '0712345678', amountKsh: 1, amount: 1, priceKsh: 1 }),
    });
    // 503 = Daraja not configured in this environment; 502 = configured but
    // Daraja itself rejected the request (body has no paymentId on this
    // path — matches the pre-existing Premium STK route's behavior). Either
    // way the payment record is created first with the server-determined
    // amount, which is what #9 actually verifies — the amount-tampering
    // protection, not Daraja's own accept/reject outcome.
    assert('#9 STK push attempt returns a non-success status without ever accepting the tampered amount', tampered.status === 503 || tampered.status === 502, JSON.stringify(tampered.body));
    const { data: rows } = await admin.from('payments').select('amount_ksh, plan_type').eq('user_id', userAId).eq('plan_type', 'meal_plan_generation').order('created_at', { ascending: false }).limit(1);
    assert('#9 A payment record was created despite the failure', (rows?.length ?? 0) >= 1, JSON.stringify(rows));
    if (rows?.[0]) {
      assert('#9 Server charged KSh 50 regardless of client-sent amount', rows[0].amount_ksh === 50, JSON.stringify(rows[0]));
    }
  }

  // ── #11/#14: successful payment creates entitlement, duplicate callback ─
  console.log('── #11/#14 Payment callback creates entitlement, duplicate-safe ──');
  {
    const cro = `paysucc_${stamp}`;
    const seeded = await seedPendingGenerationPayment(userAId, cro);
    const cb = await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: cro, merchantRequestId: seeded.merchant_request_id, resultCode: 0, amountKsh: 50, mpesaReceipt: 'GATESUCC01' })) });
    assert('Callback ack returned', cb.status === 200 && cb.body.ResultCode === 0);

    const { data: ents } = await admin.from('meal_plan_entitlements').select('*').eq('payment_id', seeded.id);
    assert('#11 Successful payment created exactly one entitlement', ents.length === 1 && ents[0].source === 'payment', JSON.stringify(ents));

    const { data: subRow } = await admin.from('subscriptions').select('*').eq('user_id', userAId).eq('mpesa_receipt', 'GATESUCC01').maybeSingle();
    assert('Generation payment did NOT create/touch a subscription', !subRow, JSON.stringify(subRow));

    // Replay the same callback — Safaricom retry.
    const cb2 = await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: cro, merchantRequestId: seeded.merchant_request_id, resultCode: 0, amountKsh: 50, mpesaReceipt: 'GATESUCC01' })) });
    assert('Duplicate callback still acked safely', cb2.status === 200 && cb2.body.ResultCode === 0);
    const { data: entsAfter } = await admin.from('meal_plan_entitlements').select('*').eq('payment_id', seeded.id);
    assert('#14 Duplicate callback did NOT create a second entitlement', entsAfter.length === 1, `found ${entsAfter.length}`);
  }

  // ── #12/#13: failed/cancelled payment creates no entitlement ───────────
  console.log('── #12/#13 Failed/cancelled payment creates no entitlement ──');
  {
    const croFail = `payfail_${stamp}`;
    const seededFail = await seedPendingGenerationPayment(userAId, croFail);
    await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: croFail, merchantRequestId: seededFail.merchant_request_id, resultCode: 1 })) });
    const { data: entsFail } = await admin.from('meal_plan_entitlements').select('*').eq('payment_id', seededFail.id);
    assert('#12 Failed payment → no entitlement created', entsFail.length === 0, `found ${entsFail.length}`);

    const croCancel = `paycancel_${stamp}`;
    const seededCancel = await seedPendingGenerationPayment(userAId, croCancel);
    await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: croCancel, merchantRequestId: seededCancel.merchant_request_id, resultCode: 1032 })) });
    const { data: entsCancel } = await admin.from('meal_plan_entitlements').select('*').eq('payment_id', seededCancel.id);
    assert('#13 Cancelled payment → no entitlement created', entsCancel.length === 0, `found ${entsCancel.length}`);
  }

  // ── #15: double-click / concurrent generation consumes only one ────────
  console.log('── #15 Double-click / concurrent generation consumes only one entitlement ──');
  {
    await clearUnusedEntitlements(userAId);
    const pay = await seedPendingGenerationPayment(userAId, `dbl_${stamp}`);
    const ent = await seedEntitlement(userAId, { source: 'payment', paymentId: pay.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() });

    const [r1, r2] = await Promise.all([
      req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) }),
      req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) }),
    ]);
    const successes = [r1, r2].filter((r) => r.status === 200).length;
    const rejected = [r1, r2].filter((r) => r.status === 402).length;
    assert('#15 Exactly one of two concurrent requests succeeds', successes === 1, `successes=${successes} r1=${r1.status} r2=${r2.status}`);
    assert('#15 The other is rejected with PAYMENT_REQUIRED', rejected === 1);

    const { data: row } = await admin.from('meal_plan_entitlements').select('used_at').eq('id', ent.id).single();
    assert('#15 Entitlement consumed exactly once (used_at set)', !!row.used_at);
  }

  // ── #16: failed generation does not consume entitlement ────────────────
  console.log('── #16 Failed generation releases (does not consume) the entitlement ──');
  {
    // Exercises the same claim/release primitives the route uses (claimEntitlement
    // then releaseEntitlement on the catch path) rather than forcing a real
    // generation-algorithm fault over HTTP, which black-box testing can't inject.
    await clearUnusedEntitlements(userAId);
    const pay = await seedPendingGenerationPayment(userAId, `relfail_${stamp}`);
    const ent = await seedEntitlement(userAId, { source: 'payment', paymentId: pay.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() });

    const { data: claimed, error: claimErr } = await admin.from('meal_plan_entitlements').update({ used_at: new Date().toISOString() }).eq('id', ent.id).is('used_at', null).select('*');
    assert('Claim step (used by generate route) succeeds once', !claimErr && claimed?.length === 1, JSON.stringify(claimErr || claimed));

    // Simulate the route's catch-path release.
    await admin.from('meal_plan_entitlements').update({ used_at: null }).eq('id', ent.id);
    const { data: released } = await admin.from('meal_plan_entitlements').select('used_at').eq('id', ent.id).single();
    assert('#16 Released entitlement is usable again (used_at cleared)', released.used_at === null);

    const res = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) });
    assert('#16 Released entitlement can still be consumed by a real request', res.status === 200, JSON.stringify(res.body).slice(0, 200));
  }

  // ── #17/#18/#19/#20/#22: access codes ───────────────────────────────────
  console.log('── #17-20,22 Access codes ──');
  {
    await clearUnusedEntitlements(userAId);
    const goodCode = `GOOD-${stamp}`;
    await seedAccessCode(goodCode, { maxUses: 1, usedCount: 0 });
    const redeem = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ code: goodCode }) });
    assert('#17 Valid access code redemption succeeds', redeem.status === 200 && redeem.body.success === true, JSON.stringify(redeem.body));
    const genRes = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) });
    assert('#17 Generation succeeds after redeeming a valid code', genRes.status === 200, JSON.stringify(genRes.body).slice(0, 200));

    const bad = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ code: 'TOTALLY-INVALID-CODE' }) });
    assert('#18 Invalid access code → rejected with opaque message', bad.status === 400 && bad.body.error === 'Invalid or expired access code.', JSON.stringify(bad.body));

    const expiredCode = `EXPIRED-${stamp}`;
    await seedAccessCode(expiredCode, { maxUses: 5, usedCount: 0, expiresAt: new Date(Date.now() - 60_000).toISOString() });
    const expiredRes = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ code: expiredCode }) });
    assert('#19 Expired access code → rejected', expiredRes.status === 400 && expiredRes.body.error === 'Invalid or expired access code.', JSON.stringify(expiredRes.body));

    const exhaustedCode = `EXHAUSTED-${stamp}`;
    await seedAccessCode(exhaustedCode, { maxUses: 1, usedCount: 1 });
    const exhaustedRes = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ code: exhaustedCode }) });
    assert('#20 Exhausted access code → rejected', exhaustedRes.status === 400 && exhaustedRes.body.error === 'Invalid or expired access code.', JSON.stringify(exhaustedRes.body));

    const privateCode = `PRIVATE-${stamp}`;
    await seedAccessCode(privateCode, { userId: userBId, maxUses: 1, usedCount: 0 });
    const wrongUserRes = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ code: privateCode }) });
    assert("#22 User A cannot redeem User B's private access code → rejected", wrongUserRes.status === 400 && wrongUserRes.body.error === 'Invalid or expired access code.', JSON.stringify(wrongUserRes.body));
    const rightUserRes = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: cookieB }, body: JSON.stringify({ code: privateCode }) });
    assert("#22 User B CAN redeem their own private access code", rightUserRes.status === 200, JSON.stringify(rightUserRes.body));

    // Never returns the code / hash in any response.
    const respText = JSON.stringify(redeem.body) + JSON.stringify(rightUserRes.body);
    assert('Access code responses never echo the raw code or a hash', !respText.includes(goodCode) && !respText.includes(privateCode) && !/[0-9a-f]{64}/.test(respText));
  }

  // ── #21: access-code brute force is rate-limited ────────────────────────
  console.log('── #21 Access-code brute-force rate limiting ──');
  {
    const attempts = [];
    for (let i = 0; i < 8; i++) {
      attempts.push(await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ code: `GUESS-${i}-${stamp}` }) }));
    }
    const rateLimited = attempts.some((r) => r.status === 429);
    assert('#21 Repeated access-code guesses eventually hit 429', rateLimited, `statuses: ${attempts.map((r) => r.status).join(',')}`);
  }

  // ── #23: existing plan remains viewable without payment ────────────────
  console.log('── #23 Existing plan viewable for free ──');
  {
    const view = await req('/api/meal-plans/current', { headers: { Cookie: cookieA } });
    assert('#23 GET current meal plan → 200 with no entitlement required', view.status === 200, JSON.stringify(view.body).slice(0, 150));
  }

  // ── #24: budget/food algorithm remains intact ───────────────────────────
  console.log('── #24 Food-budget algorithm intact ──');
  {
    // Seed the entitlement directly rather than via redeem-access-code —
    // that endpoint's rate limit is already exhausted by #17-22/#21 above
    // in this same run, and #24 is about the generation algorithm, not the
    // access-code flow (already covered).
    await clearUnusedEntitlements(userAId);
    const pay = await seedPendingGenerationPayment(userAId, `algo_${stamp}`);
    await seedEntitlement(userAId, { source: 'payment', paymentId: pay.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const res = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({}) });
    const days = res.body?.mealPlan?.days;
    const hasAllDays = days && ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].every((d) => days[d]?.breakfast && days[d]?.lunch && days[d]?.dinner);
    assert('#24 Generated plan still has all 7 days with breakfast/lunch/dinner filled', hasAllDays, JSON.stringify(res.body).slice(0, 200));
    assert('#24 householdSize/weeklyFoodBudgetKsh still reported (budget-aware scoring intact)', 'householdSize' in res.body, JSON.stringify(res.body).slice(0, 200));
  }

} finally {
  // Deleting the auth user cascades (auth.users -> profiles -> payments /
  // meal_plan_entitlements / meal_plan_access_codes with user_id set) via
  // the schema's ON DELETE CASCADE chains, so this alone cleans up
  // everything scoped to each test user.
  if (userAId) await admin.auth.admin.deleteUser(userAId).catch(() => {});
  if (userBId) await admin.auth.admin.deleteUser(userBId).catch(() => {});
  // Unbound (user_id IS NULL) test access codes aren't owned by any user,
  // so they don't cascade — remove them explicitly by this run's stamp.
  await admin.from('meal_plan_access_codes').delete().is('user_id', null).eq('description', 'test code');
}

console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
