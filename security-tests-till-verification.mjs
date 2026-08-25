/**
 * Mlo Wangu — Till Payment Verification → Access Code Suite
 * Requires the server running against a REAL Supabase project (USE_JSON_DB=false).
 *
 * Covers the new admin Till-verification flow (verify-till / reject /
 * resend-code-email — server.ts, adminDb.verifyTillPayment/rejectTillPayment/
 * resendAccessCodeEmail in server/admin-db.ts, migration
 * 0006_till_verification_access_codes.sql) and the two budget-calculator
 * bugs fixed alongside it (LogExpenseModal category casing; category
 * planned-amount creation via PUT /api/financial/budget; the new
 * all-category `warnings` array on /api/financial/overspending-analysis).
 *
 * [MOCK TEST] labels every scenario that seeds a `payments` row directly via
 * the service-role client to stand in for "a user actually submitted a Till
 * payment" — matching the convention in security-tests-mpesa.mjs and
 * security-tests-meal-plan-gate.mjs. No real M-Pesa transaction is involved
 * anywhere in this file.
 *
 * NOT covered here, and not claimed as tested:
 *   - A real Resend email send. RESEND_API_KEY is configured in this
 *     environment but EMAIL_FROM_ADDRESS is intentionally left empty (no
 *     verified sending domain yet) — every email_log row this file produces
 *     is expected to show status='not_configured', which is the correct,
 *     honest behavior to assert, not a live send.
 *   - resend-code-email's 'reissued_new' fallback path (only reachable when
 *     the original JSON-store notification is missing — not deterministically
 *     forceable in an automated run against a warm server). Only the
 *     'resent_existing' path (the common case) is asserted below.
 *
 * Creates its own throwaway users via the service-role admin API and cleans
 * them up at the end. Never prints keys/tokens/passwords/access codes.
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

async function withFinancialSession(authCookie, pin) {
  let res = await fetch(`${BASE}/api/financial-auth/setup-pin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ pin, confirmPin: pin }),
  });
  if (res.status !== 200) {
    res = await fetch(`${BASE}/api/financial-auth/unlock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: authCookie },
      body: JSON.stringify({ pin }),
    });
  }
  const finCookie = cookieHeaderFrom(res.headers.get('set-cookie'));
  return `${authCookie}; ${finCookie}`;
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const adminEmail = `mlo-till-admin-${stamp}@example.com`;
const userEmail = `mlo-till-user-${stamp}@example.com`;
const otherEmail = `mlo-till-other-${stamp}@example.com`;
const password = 'TillVerifyTest123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return cookieHeaderFrom(res.headers.get('set-cookie'));
}

async function seedTillPayment(userId, { planType = 'meal_plan_generation', amountKsh = 50, code } = {}) {
  const mpesaCode = code || `TIL${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const { data, error } = await admin.from('payments').insert({
    user_id: userId, amount_ksh: amountKsh, phone_number: '254712345678',
    plan_type: planType, payment_method: 'till_manual', mpesa_receipt: mpesaCode, status: 'pending',
  }).select('*').single();
  if (error) throw new Error(`seed till payment failed: ${error.message}`);
  return data;
}

async function seedStkPayment(userId, { planType = 'meal_plan_generation', amountKsh = 50 } = {}) {
  const checkoutId = `stk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await admin.from('payments').insert({
    user_id: userId, amount_ksh: amountKsh, phone_number: '254712345678',
    plan_type: planType, payment_method: 'stk_push', checkout_request_id: checkoutId,
    merchant_request_id: `mr_${checkoutId}`, status: 'pending',
  }).select('*').single();
  if (error) throw new Error(`seed stk payment failed: ${error.message}`);
  return data;
}

console.log('\n═══ Mlo Wangu Till Payment Verification → Access Code Suite ═══\n');

let adminId, userId, otherId;
try {
  adminId = await createConfirmedUser(adminEmail);
  userId = await createConfirmedUser(userEmail);
  otherId = await createConfirmedUser(otherEmail);
  const adminCookie = await login(adminEmail);
  const userCookie = await login(userEmail);
  const otherCookie = await login(otherEmail);
  await admin.from('profiles').update({ role: 'admin' }).eq('id', adminId);

  // ── AUTH / AUTHZ ON THE THREE NEW ROUTES ────────────────────────────────
  console.log('── Auth: unauthenticated / normal user on verify-till, reject, resend-code-email ──');
  {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const routes = [
      { method: 'POST', path: `/api/admin/payments/${fakeId}/verify-till` },
      { method: 'POST', path: `/api/admin/payments/${fakeId}/reject`, body: { reason: 'x' } },
      { method: 'POST', path: `/api/admin/payments/${fakeId}/resend-code-email` },
    ];
    for (const r of routes) {
      const unauth = await req(r.path, { method: r.method, body: r.body ? JSON.stringify(r.body) : undefined });
      assert(`${r.path} unauthenticated → 401`, unauth.status === 401, `got ${unauth.status}`);
      const asUser = await req(r.path, { method: r.method, headers: { Cookie: userCookie }, body: r.body ? JSON.stringify(r.body) : undefined });
      assert(`${r.path} normal user → 403`, asUser.status === 403, `got ${asUser.status}`);
    }
  }

  // ── TILL-SUBMIT: full pasted M-Pesa SMS, not just the short code ────────
  // Placed before any other payment is seeded for `userId` — the route
  // enforces "one pending payment at a time" per user, and later sections
  // deliberately leave one payment (tillPremium) permanently 'pending', which
  // would otherwise collide with a real route-level submission here.
  console.log('── Till-submit: paste the FULL M-Pesa confirmation SMS, code extracted server-side ──');
  {
    // Unique per run — mpesa_receipt has a real DB-level uniqueness
    // constraint, so a fixed code here would collide with itself on repeat
    // runs against the same live database. 'Q' + digits guarantees the
    // extractor's shape requirement (mixed letter+digit, 8-12 chars).
    const realisticCode = `Q${String(Date.now()).slice(-9)}`;
    const fullMessage = `${realisticCode} Confirmed. Ksh50.00 paid to MLO WANGU. on 25/8/26 at 10:30 AM. New M-PESA balance is Ksh1,234.00. Transaction cost, Ksh0.00.Amount you can transact within the day is 499,000.00. Pay Bill and Buy Goods transactions are free for amounts less than Ksh100.`;

    const noMessage = await req('/api/payments/mpesa/till-submit', {
      method: 'POST', headers: { Cookie: userCookie },
      body: JSON.stringify({ planType: 'meal_plan_generation', phoneNumber: '0712345678', mpesaMessage: 'not a real confirmation message at all' }),
    });
    assert('A message with no code-shaped token → 400', noMessage.status === 400, `got ${noMessage.status} ${JSON.stringify(noMessage.body)}`);

    const submitted = await req('/api/payments/mpesa/till-submit', {
      method: 'POST', headers: { Cookie: userCookie },
      body: JSON.stringify({ planType: 'meal_plan_generation', phoneNumber: '0712345678', mpesaMessage: fullMessage }),
    });
    assert('Full pasted confirmation SMS is accepted → 200', submitted.status === 200, `got ${submitted.status} ${JSON.stringify(submitted.body)}`);

    if (submitted.status === 200) {
      const { data: row } = await admin.from('payments').select('mpesa_receipt, mpesa_raw_message').eq('id', submitted.body.paymentId).single();
      assert('The correct transaction code was extracted from the pasted message', row?.mpesa_receipt === realisticCode, JSON.stringify(row));
      assert('The full raw message was stored for admin review', row?.mpesa_raw_message === fullMessage, `stored length=${row?.mpesa_raw_message?.length}, expected length=${fullMessage.length}`);

      // Admin sees the raw message via the user-detail endpoint.
      const detail = await req(`/api/admin/users/${userId}`, { headers: { Cookie: adminCookie } });
      const seen = (detail.body.payments || []).find((p) => p.id === submitted.body.paymentId);
      assert('Admin user-detail view includes the full raw message for this payment', seen?.mpesaRawMessage === fullMessage, JSON.stringify(seen));

      // Reject it so it doesn't linger as 'pending' and collide with later sections.
      await req(`/api/admin/payments/${submitted.body.paymentId}/reject`, { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ reason: 'test cleanup' }) });
    }
  }

  // ── VERIFY: HAPPY PATH ───────────────────────────────────────────────────
  console.log('── [MOCK TEST] Verify a pending Till/meal_plan_generation payment ──');
  let verifiedPayment, verifiedCode, verifiedAccessCodeId, verifiedExpiresAt;
  {
    const payment = await seedTillPayment(userId);
    verifiedPayment = payment;

    const asUser = await req(`/api/admin/payments/${payment.id}/verify-till`, { method: 'POST', headers: { Cookie: userCookie } });
    assert('Normal user cannot verify a Till payment → 403', asUser.status === 403, `got ${asUser.status}`);

    const res = await req(`/api/admin/payments/${payment.id}/verify-till`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('Admin can verify a pending Till/meal_plan_generation payment → 200', res.status === 200, `got ${res.status} ${JSON.stringify(res.body)}`);
    assert('Response returns the plaintext code exactly once', typeof res.body.code === 'string' && res.body.code.length > 0, JSON.stringify(res.body));
    assert('Response is not flagged as alreadyVerified on first success', res.body.alreadyVerified === false, JSON.stringify(res.body));
    verifiedCode = res.body.code;
    verifiedAccessCodeId = res.body.accessCodeId;
    verifiedExpiresAt = res.body.expiresAt;

    const { data: row } = await admin.from('payments').select('status, verified_by, verified_at').eq('id', payment.id).single();
    assert('Payment row is now status=success with verified_by set', row?.status === 'success' && row?.verified_by === adminId, JSON.stringify(row));

    const { data: codeRows } = await admin.from('meal_plan_access_codes').select('id, code_hash, payment_id, user_id, max_uses').eq('payment_id', payment.id);
    assert('Exactly one access code row is linked to this payment', (codeRows || []).length === 1, JSON.stringify(codeRows));
    const codeRow = (codeRows || [])[0];
    assert('Access code is scoped to the correct user', codeRow?.user_id === userId, JSON.stringify(codeRow));
    assert('Access code allows exactly one use', codeRow?.max_uses === 1, JSON.stringify(codeRow));
    assert('Only a SHA-256 hash is stored — never the plaintext code', codeRow && codeRow.code_hash.length === 64 && codeRow.code_hash !== verifiedCode, JSON.stringify(codeRow));
  }

  // ── VERIFY: IDEMPOTENCY (double-click) ──────────────────────────────────
  console.log('── Double-click verify issues only ONE code ──');
  {
    const res2 = await req(`/api/admin/payments/${verifiedPayment.id}/verify-till`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('Second verify call → 200, reports alreadyVerified', res2.status === 200 && res2.body.alreadyVerified === true, JSON.stringify(res2.body));
    assert('Second verify call never returns a plaintext code', res2.body.code === null, JSON.stringify(res2.body));
    assert('Second verify call reports the SAME accessCodeId as the first', res2.body.accessCodeId === verifiedAccessCodeId, JSON.stringify(res2.body));

    const { data: codeRows } = await admin.from('meal_plan_access_codes').select('id').eq('payment_id', verifiedPayment.id);
    assert('Still exactly one access code row for this payment after the double-click', (codeRows || []).length === 1, JSON.stringify(codeRows));
  }

  // ── VERIFY: WRONG SHAPE ──────────────────────────────────────────────────
  console.log('── verify-till rejects the wrong payment shape; /confirm still works elsewhere ──');
  {
    const stkPayment = await seedStkPayment(userId);
    const wrongShape = await req(`/api/admin/payments/${stkPayment.id}/verify-till`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('verify-till on an STK-push payment → 400 (wrong_method_or_plan)', wrongShape.status === 400, `got ${wrongShape.status}`);

    const stillConfirms = await req(`/api/admin/payments/${stkPayment.id}/confirm`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('The existing /confirm route is unaffected — still confirms an STK-stuck-pending payment', stillConfirms.status === 200, `got ${stillConfirms.status} ${JSON.stringify(stillConfirms.body)}`);

    const tillPremium = await seedTillPayment(userId, { planType: 'weekly' });
    const wrongShape2 = await req(`/api/admin/payments/${tillPremium.id}/verify-till`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('verify-till on a Till/Premium (non-generation) payment → 400 (wrong_method_or_plan)', wrongShape2.status === 400, `got ${wrongShape2.status}`);
  }

  // ── REJECT: HAPPY PATH + CAS IN BOTH DIRECTIONS ─────────────────────────
  console.log('── [MOCK TEST] Reject flow, and CAS guard in both directions ──');
  {
    const payment = await seedTillPayment(userId);

    const noReason = await req(`/api/admin/payments/${payment.id}/reject`, { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({}) });
    assert('Reject without a reason → 400', noReason.status === 400, `got ${noReason.status}`);

    const asUser = await req(`/api/admin/payments/${payment.id}/reject`, { method: 'POST', headers: { Cookie: userCookie }, body: JSON.stringify({ reason: 'not a real transaction' }) });
    assert('Normal user cannot reject a Till payment → 403', asUser.status === 403, `got ${asUser.status}`);

    const rejected = await req(`/api/admin/payments/${payment.id}/reject`, { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ reason: 'Code does not match any real M-Pesa transaction.' }) });
    assert('Admin can reject a pending Till payment → 200', rejected.status === 200, `got ${rejected.status} ${JSON.stringify(rejected.body)}`);

    const { data: row } = await admin.from('payments').select('status, rejection_reason, verified_by').eq('id', payment.id).single();
    assert('Payment row is now status=rejected with the reason stored', row?.status === 'rejected' && row?.rejection_reason?.includes('does not match') && row?.verified_by === adminId, JSON.stringify(row));

    const { data: codeRows } = await admin.from('meal_plan_access_codes').select('id').eq('payment_id', payment.id);
    assert('No access code was created for a rejected payment', (codeRows || []).length === 0, JSON.stringify(codeRows));

    const doubleReject = await req(`/api/admin/payments/${payment.id}/reject`, { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ reason: 'again' }) });
    assert('Double-reject on an already-rejected payment → 409', doubleReject.status === 409, `got ${doubleReject.status}`);

    const rejectThenVerify = await req(`/api/admin/payments/${payment.id}/verify-till`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('Verifying an already-rejected payment → 409 (not silently overwritten)', rejectThenVerify.status === 409, `got ${rejectThenVerify.status}`);

    // And the reverse order: verify first, then attempt reject.
    const payment2 = await seedTillPayment(userId);
    const verify2 = await req(`/api/admin/payments/${payment2.id}/verify-till`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('Setup: second payment verifies cleanly', verify2.status === 200, JSON.stringify(verify2.body));
    const verifyThenReject = await req(`/api/admin/payments/${payment2.id}/reject`, { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ reason: 'too late' }) });
    assert('Rejecting an already-verified payment → 409 (not silently overwritten)', verifyThenReject.status === 409, `got ${verifyThenReject.status}`);
  }

  // ── GET /api/payments/:id — ownership + rejectionReason ─────────────────
  console.log('── Payment status endpoint: ownership + rejectionReason ──');
  {
    const rejectedPayment = await seedTillPayment(userId);
    await req(`/api/admin/payments/${rejectedPayment.id}/reject`, { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ reason: 'Test rejection reason.' }) });

    const asOwner = await req(`/api/payments/${rejectedPayment.id}`, { headers: { Cookie: userCookie } });
    assert('Owner can read their own rejected payment, with the reason', asOwner.status === 200 && asOwner.body.payment?.rejectionReason === 'Test rejection reason.', JSON.stringify(asOwner.body));
    assert('Payment status response never includes the access code itself', !JSON.stringify(asOwner.body).includes(verifiedCode), 'response leaked the access code');

    const asOther = await req(`/api/payments/${rejectedPayment.id}`, { headers: { Cookie: otherCookie } });
    assert('A different user cannot read this payment → 404', asOther.status === 404, `got ${asOther.status}`);
  }

  // ── ACCESS CODE OWNERSHIP ────────────────────────────────────────────────
  console.log('── Access code belongs to the correct user, never transferable ──');
  {
    const redeemAsOther = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: otherCookie }, body: JSON.stringify({ code: verifiedCode }) });
    assert('A different authenticated user cannot redeem this Till-issued code', redeemAsOther.status === 400, `got ${redeemAsOther.status}`);

    const redeemAsOwner = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: userCookie }, body: JSON.stringify({ code: verifiedCode }) });
    assert('The owning user CAN redeem their own Till-issued code', redeemAsOwner.status === 200, `got ${redeemAsOwner.status} ${JSON.stringify(redeemAsOwner.body)}`);

    const { data: usedRow } = await admin.from('meal_plan_access_codes').select('used_count').eq('id', verifiedAccessCodeId).single();
    assert('Code is now consumed (used_count=1)', usedRow?.used_count === 1, JSON.stringify(usedRow));
  }

  // ── 7-DAY EXPIRY ──────────────────────────────────────────────────────────
  console.log('── Till-issued codes still get exactly the 7-day expiry (unchanged DB trigger) ──');
  {
    const { data: row } = await admin.from('meal_plan_access_codes').select('created_at, expires_at').eq('id', verifiedAccessCodeId).single();
    assert('Till-issued code has a bounded expires_at', !!row?.expires_at, JSON.stringify(row));
    if (row?.expires_at) {
      const delta = new Date(row.expires_at).getTime() - new Date(row.created_at).getTime();
      assert('Expiry is exactly 7 days from issuance (migration 0003 trigger, unmodified)', Math.abs(delta - 7 * 24 * 60 * 60 * 1000) < 5000, `delta=${delta}ms`);
    }
    assert('Response-reported expiresAt matches the DB row', verifiedExpiresAt === row?.expires_at, `${verifiedExpiresAt} vs ${row?.expires_at}`);
  }

  // ── RESEND CODE EMAIL ─────────────────────────────────────────────────────
  console.log('── Resend code email: recovers the original code from the notification store ──');
  {
    const payment3 = await seedTillPayment(userId);
    const v3 = await req(`/api/admin/payments/${payment3.id}/verify-till`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('Setup: third payment verifies cleanly', v3.status === 200, JSON.stringify(v3.body));

    const asUser = await req(`/api/admin/payments/${payment3.id}/resend-code-email`, { method: 'POST', headers: { Cookie: userCookie } });
    assert('Normal user cannot trigger a code-email resend → 403', asUser.status === 403, `got ${asUser.status}`);

    const resent = await req(`/api/admin/payments/${payment3.id}/resend-code-email`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('Admin can resend the code email → 200', resent.status === 200, `got ${resent.status} ${JSON.stringify(resent.body)}`);
    assert('Resend recovers the ORIGINAL code (resent_existing), since the notification is still fresh', resent.body.mode === 'resent_existing', JSON.stringify(resent.body));

    const { data: emailRows } = await admin.from('email_log').select('status, email_type, recipient').eq('related_payment_id', payment3.id).order('created_at', { ascending: false });
    assert('email_log recorded a delivery attempt for this payment', (emailRows || []).length >= 1, JSON.stringify(emailRows));
    // RESEND_API_KEY is set in this environment but EMAIL_FROM_ADDRESS is
    // intentionally empty (no verified sender domain yet) — honestly expect
    // 'not_configured', not a live send.
    assert("email_log honestly reports 'not_configured' (no verified sender configured) — never fabricated as 'sent'", (emailRows || []).every((r) => r.status === 'not_configured'), JSON.stringify(emailRows));
  }

  // ── AUDIT LOG ─────────────────────────────────────────────────────────────
  console.log('── Audit log records the new actions ──');
  {
    const log = await req('/api/admin/audit-log', { headers: { Cookie: adminCookie } });
    if (log.status === 200) {
      const actions = (log.body.entries || []).map((e) => e.action);
      assert('TILL_PAYMENT_VERIFIED was recorded', actions.includes('TILL_PAYMENT_VERIFIED'), JSON.stringify(actions).slice(0, 200));
      assert('TILL_PAYMENT_REJECTED was recorded', actions.includes('TILL_PAYMENT_REJECTED'), JSON.stringify(actions).slice(0, 200));
      assert('ACCESS_CODE_EMAIL_RESENT was recorded', actions.includes('ACCESS_CODE_EMAIL_RESENT'), JSON.stringify(actions).slice(0, 200));
    }
  }

  // ── BUDGET: category casing regression + category creation ─────────────
  console.log('── [MOCK TEST] Budget: category casing bug fix + category creation ──');
  {
    const finCookie = await withFinancialSession(userCookie, '482913');
    const month = new Date().toISOString().slice(0, 7);

    // Category creation: real users start with categories: [] — the new
    // editor path is PUT /api/financial/budget with an appended category.
    const setBudget = await req('/api/financial/budget', {
      method: 'PUT', headers: { Cookie: finCookie },
      body: JSON.stringify({ budget: { month, monthlyIncomeKsh: 40000, incomeType: 'monthly', categories: [{ category: 'Food', plannedAmountKsh: 8000, color: '#14532D' }] } }),
    });
    assert('Category can be created via PUT /api/financial/budget', setBudget.status === 200, `got ${setBudget.status} ${JSON.stringify(setBudget.body)}`);

    // Regression for the casing bug: log an expense with the corrected
    // capitalized category and confirm it reduces THIS SAME category, not a
    // phantom lowercase one.
    const expense = await req('/api/financial/expenses', {
      method: 'POST', headers: { Cookie: finCookie },
      body: JSON.stringify({ amountKsh: 1600, category: 'Food', description: 'Milk, vegetables, oil, bread' }),
    });
    assert('Expense logged with the canonical capitalized category', expense.status === 200, `got ${expense.status} ${JSON.stringify(expense.body)}`);

    const summary = await req('/api/financial/summary', { headers: { Cookie: finCookie } });
    const foodBreakdown = summary.body?.categoryBreakdown?.Food;
    assert('Summary has exactly one "Food" category (no phantom "food" lowercase entry)', !!foodBreakdown && !summary.body?.categoryBreakdown?.food, JSON.stringify(summary.body?.categoryBreakdown));
    assert('The KSh 1,600 expense reduced the Food category\'s spent total', foodBreakdown?.spent === 1600, JSON.stringify(foodBreakdown));
    assert('Food category still shows its KSh 8,000 planned amount', foodBreakdown?.planned === 8000, JSON.stringify(foodBreakdown));
  }

  // ── BUDGET: general warnings array ──────────────────────────────────────
  console.log('── [MOCK TEST] Overspending analysis: all-category warnings ──');
  {
    const finCookie = await withFinancialSession(userCookie, '482913'); // PIN already set above
    const month = new Date().toISOString().slice(0, 7);

    await req('/api/financial/budget', {
      method: 'PUT', headers: { Cookie: finCookie },
      body: JSON.stringify({
        budget: {
          month, monthlyIncomeKsh: 40000, incomeType: 'monthly',
          categories: [
            { category: 'Food', plannedAmountKsh: 8000, color: '#14532D' },
            { category: 'Transport', plannedAmountKsh: 4000, color: '#F59E0B' },
          ],
        },
      }),
    });
    // Transport: 3600/4000 = 90% used (triggers the ≥80% warning).
    await req('/api/financial/expenses', { method: 'POST', headers: { Cookie: finCookie }, body: JSON.stringify({ amountKsh: 3600, category: 'Transport', description: 'Matatu fares' }) });

    const analysis = await req('/api/financial/overspending-analysis', { headers: { Cookie: finCookie } });
    assert('overspending-analysis → 200', analysis.status === 200, `got ${analysis.status}`);
    const warnings = analysis.body?.analysis?.warnings || [];
    assert('warnings array includes a Transport warning at ~90% used', warnings.some((w) => /Transport/i.test(w) && /%/.test(w)), JSON.stringify(warnings));
    assert('Existing Food-specific fields are still present and unchanged in shape', typeof analysis.body?.analysis?.alertMessage === 'string' && typeof analysis.body?.analysis?.alertType === 'string', JSON.stringify(analysis.body?.analysis));
  }

  // ── PREMIUM: weekly-plan generation is included, no separate gate ───────
  console.log('── [MOCK TEST] Active Premium bypasses the meal-plan-generation entitlement gate ──');
  {
    // Before any subscription exists: otherId still needs to pay, same as everyone else.
    const before = await req('/api/meal-plans/generation/entitlement-status', { headers: { Cookie: otherCookie } });
    assert('Non-premium user: entitlement-status is false before any subscription', before.body?.hasEntitlement === false, JSON.stringify(before.body));

    const genBefore = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: otherCookie } });
    assert('Non-premium user: generate still requires payment → 402', genBefore.status === 402 && genBefore.body?.code === 'PAYMENT_REQUIRED', `got ${genBefore.status} ${JSON.stringify(genBefore.body)}`);

    // Seed an active subscription directly (stands in for a real admin-confirmed STK/Till payment).
    const { error: subErr } = await admin.from('subscriptions').insert({
      user_id: otherId, plan_type: 'monthly', price_ksh: 150, status: 'active',
      start_date: new Date().toISOString(), end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      mpesa_receipt: `PREM${Date.now()}`,
    });
    if (subErr) throw new Error(`seed subscription failed: ${subErr.message}`);

    const after = await req('/api/meal-plans/generation/entitlement-status', { headers: { Cookie: otherCookie } });
    assert('Active Premium: entitlement-status reports hasEntitlement=true with no purchase', after.body?.hasEntitlement === true, JSON.stringify(after.body));

    const genAfter = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: otherCookie } });
    assert('Active Premium: generate succeeds directly, no entitlement/access-code needed → 200', genAfter.status === 200, `got ${genAfter.status} ${JSON.stringify(genAfter.body)}`);

    // Confirm no entitlement row was consumed/created by this — Premium
    // bypasses the entitlement mechanism entirely, it doesn't quietly use one.
    const { data: ents } = await admin.from('meal_plan_entitlements').select('id').eq('user_id', otherId);
    assert('Premium generation did not create or consume any meal_plan_entitlements row', (ents || []).length === 0, JSON.stringify(ents));

    // Can generate again immediately — Premium is an ongoing benefit, not a one-shot.
    const genAgain = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: otherCookie } });
    assert('Active Premium: can generate a second time immediately, still no gate', genAgain.status === 200, `got ${genAgain.status}`);

    // Expired subscription must NOT bypass the gate.
    await admin.from('subscriptions').update({ end_date: new Date(Date.now() - 1000).toISOString() }).eq('user_id', otherId);
    const genExpired = await req('/api/meal-plans/generate', { method: 'POST', headers: { Cookie: otherCookie } });
    assert('Expired subscription: gate re-applies, generate requires payment again → 402', genExpired.status === 402, `got ${genExpired.status}`);
  }

} finally {
  if (adminId) await admin.auth.admin.deleteUser(adminId).catch(() => {});
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  if (otherId) await admin.auth.admin.deleteUser(otherId).catch(() => {});
}

console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
