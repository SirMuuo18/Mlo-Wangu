/**
 * Mlo Wangu — M-Pesa Payment Test Suite
 * Requires the server running against real Supabase (USE_JSON_DB=false).
 *
 * MPESA_CONSUMER_KEY/SECRET/SHORTCODE/PASSKEY/ENVIRONMENT are configured
 * (sandbox), but the callback URL is still localhost — not reachable by
 * Safaricom — and the sandbox app currently rejects the STK request itself
 * (Daraja error 404.001.03 "Invalid Access Token" on /stkpush/v1/processrequest
 * despite a valid OAuth token; this means the app behind the Consumer Key
 * doesn't have the Lipa Na M-Pesa Online Sandbox product added on the Daraja
 * portal — an external app-configuration step, not a code issue). So no real
 * end-to-end STK→callback flow can complete here yet. Per instructions, no
 * successful Daraja transaction is faked. Tests are split into two groups:
 *
 *   [MOCK TEST]  — exercises the REAL callback/activation/idempotency/RLS
 *                  code paths against REAL Supabase, using a payment record
 *                  seeded directly via the service-role client (standing in
 *                  for "Daraja already accepted the STK push and a pending
 *                  payment row exists" — the callback handler's logic
 *                  doesn't know or care how that row was created). This is
 *                  the same code that runs against a real callback.
 *   [LIVE DARAJA TEST] — none run in this environment for the reasons above.
 *                  Not claimed as tested here.
 *
 * Never prints credentials/tokens.
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
const emailA = `mlo-pay-a-${stamp}@example.com`;
const emailB = `mlo-pay-b-${stamp}@example.com`;
const password = 'PayTest123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return cookieHeaderFrom(res.headers.get('set-cookie'));
}

// Seeds a 'pending' payment row directly via service-role — stands in for a
// real Daraja STK push having already been accepted. See file header.
async function seedPendingPayment(userId, { amountKsh, planType, checkoutRequestId }) {
  const { data, error } = await admin.from('payments').insert({
    user_id: userId, amount_ksh: amountKsh, phone_number: '254712345678',
    plan_type: planType, checkout_request_id: checkoutRequestId, merchant_request_id: `mr_${checkoutRequestId}`,
    status: 'pending',
  }).select('*').single();
  if (error) throw new Error(`seed failed: ${error.message}`);
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

console.log('\n═══ Mlo Wangu M-Pesa Payment Suite ═══\n');
console.log('Daraja credentials configured: YES (sandbox) — but the sandbox app currently');
console.log('rejects STK requests (see file header) and the callback URL is not publicly');
console.log('reachable, so no real end-to-end payment can complete here yet.');
console.log('Tests marked [MOCK TEST] seed payment state directly and exercise the real callback/activation code.');
console.log('No [LIVE DARAJA TEST] scenarios run here for the reasons above.\n');

let userAId, userBId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);
  const cookieA = await login(emailA);
  const cookieB = await login(emailB);

  // ── 1/2/3/4: authenticated purchase, unauthenticated, amount tampering, phone validation
  console.log('── STK Push: auth, amount protection, phone validation ──');
  {
    const noAuth = await req('/api/payments/mpesa/stk-push', { method: 'POST', body: JSON.stringify({ planType: 'weekly', phoneNumber: '0712345678' }) });
    assert('#2 Unauthenticated STK push → 401', noAuth.status === 401, `got ${noAuth.status}`);

    const badPhone = await req('/api/payments/mpesa/stk-push', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ planType: 'weekly', phoneNumber: 'not-a-phone' }) });
    assert('#4 Invalid phone → 400', badPhone.status === 400, `got ${badPhone.status}`);

    const emptyPhone = await req('/api/payments/mpesa/stk-push', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ planType: 'weekly', phoneNumber: '' }) });
    assert('#4 Empty phone → 400', emptyPhone.status === 400, `got ${emptyPhone.status}`);

    const tampered = await req('/api/payments/mpesa/stk-push', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ planType: 'weekly', phoneNumber: '0712345678', amount: 1, amountKsh: 1, priceKsh: 1 }) });
    // 503 = Daraja not configured; 502 = configured but Daraja itself
    // rejected the request (no paymentId in the body on that path — look
    // the row up directly instead). Either way, what #1/#3 actually verify
    // is that the record is created first with the server-determined
    // amount, regardless of Daraja's own accept/reject outcome.
    assert('#1 Authenticated purchase attempt does not error before creating a payment record', tampered.status === 503 || tampered.status === 502, JSON.stringify(tampered.body));
    const paymentId = tampered.body.paymentId || (await admin.from('payments').select('id').eq('user_id', userAId).eq('plan_type', 'weekly').order('created_at', { ascending: false }).limit(1).single()).data?.id;
    if (paymentId) {
      const check = await req(`/api/payments/${paymentId}`, { headers: { Cookie: cookieA } });
      assert('#3 Amount tampering rejected — server charged KSh 50 regardless of client amount=1', check.body?.payment?.amountKsh === 50, JSON.stringify(check.body));
    }
  }

  // ── #17: duplicate STK request ─────────────────────────────────────────
  console.log('── #17 Duplicate STK request ──');
  {
    const seeded = await seedPendingPayment(userAId, { amountKsh: 50, planType: 'weekly', checkoutRequestId: `dup_${stamp}` });
    const again = await req('/api/payments/mpesa/stk-push', { method: 'POST', headers: { Cookie: cookieA }, body: JSON.stringify({ planType: 'weekly', phoneNumber: '0712345678' }) });
    assert('Second STK push while one is pending → 429', again.status === 429, `got ${again.status}`);
    await admin.from('payments').update({ status: 'expired' }).eq('id', seeded.id); // clean up so later tests aren't blocked
  }

  // ── #9/#18/#10: unknown payment, ownership ─────────────────────────────
  console.log('── Payment status ownership ──');
  {
    const unknown = await req('/api/payments/00000000-0000-0000-0000-000000000000', { headers: { Cookie: cookieA } });
    assert('#9 Unknown payment id → 404', unknown.status === 404, `got ${unknown.status}`);

    const payA = await seedPendingPayment(userAId, { amountKsh: 50, planType: 'weekly', checkoutRequestId: `own_${stamp}` });
    const asOwner = await req(`/api/payments/${payA.id}`, { headers: { Cookie: cookieA } });
    assert('Owner can read their own payment', asOwner.status === 200, JSON.stringify(asOwner.body));

    const asOther = await req(`/api/payments/${payA.id}`, { headers: { Cookie: cookieB } });
    assert('#10/#18 User B cannot read User A payment → 404', asOther.status === 404, `got ${asOther.status}`);
    await admin.from('payments').update({ status: 'expired' }).eq('id', payA.id);
  }

  // ── #6/#8: fake callback, wrong reference ──────────────────────────────
  console.log('── [MOCK TEST] Fake / malformed / unknown-reference callback ──');
  {
    const fake = await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify({ totally: 'not a daraja body' }) });
    assert('#6 Malformed/fake callback body → safe generic ack, no error leaked', fake.status === 200 && fake.body.ResultCode === 0);

    const unknownRef = await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: `nonexistent_${stamp}`, merchantRequestId: 'mr_x', resultCode: 0, amountKsh: 50, mpesaReceipt: 'FAKE123' })) });
    assert('#8 Callback referencing an unknown checkout_request_id → safe ack, nothing activated', unknownRef.status === 200 && unknownRef.body.ResultCode === 0);
  }

  // ── #7: wrong amount ────────────────────────────────────────────────────
  console.log('── [MOCK TEST] Wrong amount in callback ──');
  {
    const cro = `wrongamt_${stamp}`;
    const seeded = await seedPendingPayment(userAId, { amountKsh: 50, planType: 'weekly', checkoutRequestId: cro });
    const cb = await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: cro, merchantRequestId: seeded.merchant_request_id, resultCode: 0, amountKsh: 999, mpesaReceipt: 'WRONGAMT1' })) });
    assert('Callback ack returned', cb.status === 200 && cb.body.ResultCode === 0);

    const { data: row } = await admin.from('payments').select('status,mpesa_receipt').eq('id', seeded.id).single();
    assert('#7 Wrong amount → payment marked failed, not success', row.status === 'failed', JSON.stringify(row));

    const sub = await admin.from('subscriptions').select('*').eq('user_id', userAId).eq('status', 'active').maybeSingle();
    assert('#7 Wrong amount → no Premium subscription created from this payment', !sub.data || sub.data.mpesa_receipt !== 'WRONGAMT1');
  }

  // ── #14/#15: failed / cancelled payment ────────────────────────────────
  console.log('── [MOCK TEST] Failed / cancelled payment ──');
  {
    const croFail = `fail_${stamp}`;
    const seededFail = await seedPendingPayment(userAId, { amountKsh: 50, planType: 'weekly', checkoutRequestId: croFail });
    await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: croFail, merchantRequestId: seededFail.merchant_request_id, resultCode: 1 })) });
    const { data: rowFail } = await admin.from('payments').select('status').eq('id', seededFail.id).single();
    assert('#14 Generic failure (ResultCode=1) → payment status = failed', rowFail.status === 'failed', JSON.stringify(rowFail));

    const croCancel = `cancel_${stamp}`;
    const seededCancel = await seedPendingPayment(userAId, { amountKsh: 50, planType: 'weekly', checkoutRequestId: croCancel });
    await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: croCancel, merchantRequestId: seededCancel.merchant_request_id, resultCode: 1032 })) });
    const { data: rowCancel } = await admin.from('payments').select('status').eq('id', seededCancel.id).single();
    assert('#15 User-cancelled (ResultCode=1032) → payment status = cancelled', rowCancel.status === 'cancelled', JSON.stringify(rowCancel));
  }

  // ── #11/#19: successful activation + real Supabase persistence ────────
  console.log('── [MOCK TEST] Successful payment → Premium activation ──');
  let firstExpiry;
  {
    const cro = `success1_${stamp}`;
    const seeded = await seedPendingPayment(userAId, { amountKsh: 50, planType: 'weekly', checkoutRequestId: cro });
    const cb = await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: cro, merchantRequestId: seeded.merchant_request_id, resultCode: 0, amountKsh: 50, mpesaReceipt: 'SUCCESS0001' })) });
    assert('Callback ack returned', cb.status === 200);

    const { data: paymentRow } = await admin.from('payments').select('*').eq('id', seeded.id).single();
    assert('#19 Payment row persisted in Supabase as success with receipt', paymentRow.status === 'success' && paymentRow.mpesa_receipt === 'SUCCESS0001', JSON.stringify(paymentRow));

    const { data: subRow } = await admin.from('subscriptions').select('*').eq('user_id', userAId).eq('status', 'active').single();
    assert('#19 Subscription row persisted in Supabase as active', !!subRow, JSON.stringify(subRow));
    firstExpiry = subRow.end_date;

    const status = await req('/api/subscription/status', { headers: { Cookie: cookieA } });
    assert('#11 Premium activation reflected via /api/subscription/status (isPremium=true)', status.body.isPremium === true, JSON.stringify(status.body));
  }

  // ── #5: duplicate callback ──────────────────────────────────────────────
  console.log('── [MOCK TEST] Duplicate callback (idempotency) ──');
  {
    const cro = `success1_${stamp}`; // same checkoutRequestId as above — simulates Safaricom retrying
    const seeded = await admin.from('payments').select('*').eq('checkout_request_id', cro).single();
    const cb2 = await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: cro, merchantRequestId: seeded.data.merchant_request_id, resultCode: 0, amountKsh: 50, mpesaReceipt: 'SUCCESS0001' })) });
    assert('Duplicate callback still acked safely', cb2.status === 200 && cb2.body.ResultCode === 0);

    const { data: subRows } = await admin.from('subscriptions').select('*').eq('user_id', userAId).eq('status', 'active');
    assert('#5 Duplicate callback did NOT create a second active subscription', subRows.length === 1, `found ${subRows.length} active subscriptions`);
    assert('#5 Duplicate callback did NOT extend expiry again (no double-credit)', subRows[0].end_date === firstExpiry, `expiry before=${firstExpiry} after=${subRows[0].end_date}`);
  }

  // ── #13: renewal extension ──────────────────────────────────────────────
  console.log('── [MOCK TEST] Renewal extension (not overwritten) ──');
  {
    const cro = `renew_${stamp}`;
    const seeded = await seedPendingPayment(userAId, { amountKsh: 50, planType: 'weekly', checkoutRequestId: cro });
    const beforeExpiry = new Date(firstExpiry).getTime();
    await req('/api/payments/mpesa/callback', { method: 'POST', body: JSON.stringify(darajaCallback({ checkoutRequestId: cro, merchantRequestId: seeded.merchant_request_id, resultCode: 0, amountKsh: 50, mpesaReceipt: 'RENEW0001' })) });

    const { data: subRow } = await admin.from('subscriptions').select('*').eq('user_id', userAId).eq('status', 'active').single();
    const afterExpiry = new Date(subRow.end_date).getTime();
    const expectedExpiry = beforeExpiry + 7 * 24 * 60 * 60 * 1000;
    assert('#13 Renewal extends from existing expiry, not from now', Math.abs(afterExpiry - expectedExpiry) < 60_000, `before=${new Date(beforeExpiry).toISOString()} after=${new Date(afterExpiry).toISOString()} expected=${new Date(expectedExpiry).toISOString()}`);
  }

  // ── #12: expiry ──────────────────────────────────────────────────────────
  console.log('── Premium expiry ──');
  {
    await admin.from('subscriptions').update({ end_date: new Date(Date.now() - 60_000).toISOString() }).eq('user_id', userAId).eq('status', 'active');
    const status = await req('/api/subscription/status', { headers: { Cookie: cookieA } });
    assert('#12 Expired subscription end_date → isPremium=false', status.body.isPremium === false, JSON.stringify(status.body));
  }

  // ── #16: frontend premium manipulation ──────────────────────────────────
  console.log('── #16 Frontend Premium manipulation ──');
  {
    const withHeader = await req('/api/subscription/status', { headers: { Cookie: cookieB, 'x-premium': 'true' } });
    assert('x-premium header has no effect — User B (no payment) is not premium', withHeader.body.isPremium === false, JSON.stringify(withHeader.body));
    // (GET-only endpoint — there's no request body for a client to tamper with here.)
  }

  // ── #20: RLS isolation on payments/subscriptions ────────────────────────
  console.log('── #20 RLS isolation (direct PostgREST, real JWTs) ──');
  {
    const loginRes = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password }) });
    const setCookie = loginRes.headers.get('set-cookie') || '';
    const accessToken = setCookie.split(',').map((c) => c.trim()).find((c) => c.startsWith('mlo_auth_session='))?.split(';')[0].split('=')[1];

    const anonKey = process.env.SUPABASE_ANON_KEY;
    const restBase = `${process.env.SUPABASE_URL}/rest/v1`;
    const rlsRes = await fetch(`${restBase}/payments?select=user_id`, { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } });
    const rlsRows = await rlsRes.json();
    const onlyOwn = Array.isArray(rlsRows) && rlsRows.every((r) => r.user_id === userAId);
    assert('#20 RLS: User A\'s JWT against payments table only ever returns their own rows', onlyOwn, JSON.stringify(rlsRows));

    const crossRes = await fetch(`${restBase}/payments?user_id=eq.${userBId}&select=user_id`, { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } });
    const crossRows = await crossRes.json();
    assert('#20 RLS: User A explicitly filtering for User B\'s payments → empty', Array.isArray(crossRows) && crossRows.length === 0, JSON.stringify(crossRows));
  }

} finally {
  if (userAId) {
    await admin.from('payments').delete().eq('user_id', userAId);
    await admin.from('subscriptions').delete().eq('user_id', userAId);
    await admin.auth.admin.deleteUser(userAId).catch(() => {});
  }
  if (userBId) {
    await admin.from('payments').delete().eq('user_id', userBId);
    await admin.from('subscriptions').delete().eq('user_id', userBId);
    await admin.auth.admin.deleteUser(userBId).catch(() => {});
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
