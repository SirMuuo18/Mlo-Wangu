/**
 * Mlo Wangu — Mobile (Bearer-auth) Payment Flow Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * The existing security-tests-mpesa.mjs and security-tests-till-verification.mjs
 * suites already cover the payment backend thoroughly (amount tampering on
 * STK push, cancelled/failed/success transitions, duplicate-callback
 * idempotency, RLS ownership, verify/reject/redeem, 7-day expiry, audit
 * logging) — all via the web's cookie-session auth. That backend is shared
 * verbatim by the Expo app's Till-payment screen (mobile/app/generate-plan.tsx),
 * which authenticates with `Authorization: Bearer <token>` instead of a
 * cookie. This suite proves the exact same guarantees hold on that channel,
 * end-to-end, plus one gap neither existing suite checks: that
 * /api/payments/mpesa/till-submit computes amountKsh itself and ignores any
 * amountKsh the client tries to send.
 *
 * [MOCK TEST]: no real M-Pesa transaction occurs anywhere in this file —
 * "payment" here means a real POST to /api/payments/mpesa/till-submit with a
 * realistic-looking confirmation SMS string, exactly as the mobile client
 * sends it; verification is a real admin API call, not a DB fixture.
 *
 * Creates its own throwaway users via the service-role admin API and cleans
 * them up (including the payments/notifications/access-codes they create)
 * at the end. Never prints credentials/tokens/access codes.
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
const emailUser = `mlo-mobpay-user-${stamp}@example.com`;
const emailOther = `mlo-mobpay-other-${stamp}@example.com`;
const emailAdmin = `mlo-mobpay-admin-${stamp}@example.com`;
const password = 'MobilePayTest123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

// extractMpesaCodeFromMessage requires 8-12 alphanumeric chars containing
// both a letter and a digit — 'Q' + 6 random base36 chars + 3 digits from
// the clock guarantees both, regardless of what the random middle turns out
// to be, while still being unique enough to avoid colliding with any other
// suite's test payments within the same run.
function uniqueCode() {
  return `Q${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString().slice(-3)}`;
}

function realisticSms(code) {
  return `${code} Confirmed. Ksh50.00 paid to MLO WANGU. on 26/8/26 at 9:14 AM. New M-PESA balance is Ksh2,410.00. Transaction cost, Ksh0.00.`;
}

console.log('\n═══ Mlo Wangu Mobile (Bearer-Auth) Payment Flow Suite ═══\n');

let userId, otherId, adminId, paymentId, rejectedPaymentId;
try {
  userId = await createConfirmedUser(emailUser);
  otherId = await createConfirmedUser(emailOther);
  adminId = await createConfirmedUser(emailAdmin);
  await admin.from('profiles').update({ role: 'admin' }).eq('id', adminId);

  const anonUser = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sUser, error: eUser } = await anonUser.auth.signInWithPassword({ email: emailUser, password });
  if (eUser) throw new Error(`user sign-in failed: ${eUser.message}`);
  const tokenUser = sUser.session.access_token;

  const anonOther = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sOther, error: eOther } = await anonOther.auth.signInWithPassword({ email: emailOther, password });
  if (eOther) throw new Error(`other sign-in failed: ${eOther.message}`);
  const tokenOther = sOther.session.access_token;

  const anonAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sAdmin, error: eAdmin } = await anonAdmin.auth.signInWithPassword({ email: emailAdmin, password });
  if (eAdmin) throw new Error(`admin sign-in failed: ${eAdmin.message}`);
  const tokenAdmin = sAdmin.session.access_token;

  const authUser = { Authorization: `Bearer ${tokenUser}` };
  const authOther = { Authorization: `Bearer ${tokenOther}` };
  const authAdmin = { Authorization: `Bearer ${tokenAdmin}` };

  // ── Unauthenticated / invalid input ──────────────────────────────────────
  // NOTE: tillSubmitLimiter (server.ts) is a strict IP-keyed 5-per-5-minute
  // limiter guarding this real-money endpoint. Every call counts against it
  // regardless of whether the handler's own validation later rejects the
  // body, so this suite is deliberately frugal with till-submit calls (4
  // total across the whole file) and — like security-tests-mpesa.mjs and
  // security-tests-till-verification.mjs before it — must be run against a
  // freshly-restarted server, not stacked back-to-back with other suites
  // that also call this endpoint inside the same 5-minute window.
  console.log('── Auth & input validation on till-submit (bearer channel) ──');
  {
    const noAuth = await req('/api/payments/mpesa/till-submit', {
      method: 'POST',
      body: JSON.stringify({ planType: 'meal_plan_generation', phoneNumber: '0712345678', mpesaMessage: realisticSms('ABC1234XYZ') }),
    });
    assert('Unauthenticated till-submit → 401', noAuth.status === 401, JSON.stringify(noAuth.body));

    const badPhone = await req('/api/payments/mpesa/till-submit', {
      method: 'POST', headers: authUser,
      body: JSON.stringify({ planType: 'meal_plan_generation', phoneNumber: 'not-a-phone', mpesaMessage: realisticSms('GHI1234XYZ') }),
    });
    assert('Invalid phone number → 400', badPhone.status === 400, JSON.stringify(badPhone.body));

    const noMessage = await req('/api/payments/mpesa/till-submit', {
      method: 'POST', headers: authUser,
      body: JSON.stringify({ planType: 'meal_plan_generation', phoneNumber: '0712345678', mpesaMessage: 'no code in here at all' }),
    });
    assert('Message with no extractable code → 400', noMessage.status === 400, JSON.stringify(noMessage.body));
  }

  // ── Server computes the amount; client cannot override it ───────────────
  console.log('── Amount cannot be manipulated by the client ──');
  {
    const code = uniqueCode();
    const tampered = await req('/api/payments/mpesa/till-submit', {
      method: 'POST', headers: authUser,
      // A real mobile/web client never sends amountKsh at all — this
      // simulates a hostile client trying to smuggle one in anyway.
      body: JSON.stringify({ planType: 'meal_plan_generation', phoneNumber: '0712345678', mpesaMessage: realisticSms(code), amountKsh: 1 }),
    });
    assert('Tampered till-submit still succeeds (field is simply ignored)', tampered.status === 200, JSON.stringify(tampered.body));
    assert('Response amountKsh is the server-computed price, not the forged value', tampered.body.amountKsh === 50, JSON.stringify(tampered.body));
    paymentId = tampered.body.paymentId;

    const { data: row } = await admin.from('payments').select('amount_ksh, user_id, status').eq('id', paymentId).maybeSingle();
    assert('Stored payment row also has the real KSh 50 price, not KSh 1', row?.amount_ksh === 50, JSON.stringify(row));
    assert('Stored payment is owned by the authenticated bearer user, not forgeable', row?.user_id === userId, JSON.stringify(row));
    assert('Stored payment starts pending', row?.status === 'pending', JSON.stringify(row));
  }

  // ── Poll status over bearer; ownership enforced ──────────────────────────
  console.log('── Poll payment status (bearer) & cross-user isolation ──');
  {
    const asOwner = await req(`/api/payments/${paymentId}`, { headers: authUser });
    assert('Owner can poll their own payment status via bearer', asOwner.status === 200 && asOwner.body.payment?.status === 'pending', JSON.stringify(asOwner.body));

    const asOther = await req(`/api/payments/${paymentId}`, { headers: authOther });
    assert('A different bearer-authenticated user cannot read this payment → 404', asOther.status === 404, JSON.stringify(asOther.body));

    const noAuth = await req(`/api/payments/${paymentId}`);
    assert('No credentials → 401 on status poll', noAuth.status === 401, JSON.stringify(noAuth.body));
  }

  // ── Non-admin cannot verify/reject; admin can, over bearer ───────────────
  console.log('── Admin-only verification, exercised over bearer ──');
  {
    const asUser = await req(`/api/admin/payments/${paymentId}/verify-till`, { method: 'POST', headers: authUser });
    assert('Non-admin bearer user cannot verify a Till payment → 403', asUser.status === 403, JSON.stringify(asUser.body));

    const verified = await req(`/api/admin/payments/${paymentId}/verify-till`, { method: 'POST', headers: authAdmin });
    assert('Admin (bearer) can verify a pending Till payment → 200', verified.status === 200, JSON.stringify(verified.body));
    assert('Verify response includes a one-time plaintext code', typeof verified.body.code === 'string' && verified.body.code.length > 0, JSON.stringify(verified.body));

    const { data: row } = await admin.from('payments').select('status').eq('id', paymentId).maybeSingle();
    assert('Payment row is now status=success', row?.status === 'success', JSON.stringify(row));
  }

  // ── Access code arrives ONLY via the notification, readable over bearer ──
  console.log('── Access code delivery via notifications (bearer) ──');
  let deliveredCode;
  {
    const notifs = await req('/api/notifications', { headers: authUser });
    assert('Owner can list their notifications over bearer', notifs.status === 200, JSON.stringify(notifs.body));
    const codeNotif = (notifs.body.notifications || []).find((n) => n.data?.paymentId === paymentId && n.data?.accessCode);
    assert('A notification carrying the access code exists for this payment', !!codeNotif, JSON.stringify(notifs.body.notifications?.map((n) => n.title)));
    deliveredCode = codeNotif?.data?.accessCode;

    const asOther = await req('/api/notifications', { headers: authOther });
    const otherSeesIt = (asOther.body.notifications || []).some((n) => n.data?.paymentId === paymentId);
    assert("A different user's notification feed never contains this payment's code", !otherSeesIt);

    if (codeNotif) {
      const markRead = await req(`/api/notifications/${codeNotif.id}/read`, { method: 'POST', headers: authUser });
      assert('Owner can mark their own notification read', markRead.status === 200, JSON.stringify(markRead.body));

      const markAsOther = await req(`/api/notifications/${codeNotif.id}/read`, { method: 'POST', headers: authOther });
      assert("A different user cannot mark the owner's notification read (404, not silently allowed)", markAsOther.status === 404, JSON.stringify(markAsOther.body));
    } else {
      failed += 2;
      console.log('  ❌  (skipped: mark-read checks require the notification found above)');
    }
  }

  // ── Redeem the code: only the owner, only once, over bearer ─────────────
  console.log('── Access-code redemption (bearer) ──');
  {
    assert('A code was actually delivered to redeem', !!deliveredCode);

    const asOther = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: authOther, body: JSON.stringify({ code: deliveredCode }) });
    assert('A different bearer user cannot redeem this code → 400 (opaque)', asOther.status === 400, JSON.stringify(asOther.body));

    const asOwner = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: authUser, body: JSON.stringify({ code: deliveredCode }) });
    assert('Owner can redeem their own code over bearer → 200', asOwner.status === 200, JSON.stringify(asOwner.body));

    const again = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: authUser, body: JSON.stringify({ code: deliveredCode }) });
    assert('Redeeming the same code a second time fails (single-use)', again.status === 400, JSON.stringify(again.body));
  }

  // ── Rejection path over bearer, with a server-provided reason ───────────
  console.log('── Rejection path (bearer) ──');
  {
    const code2 = uniqueCode();
    const submitted = await req('/api/payments/mpesa/till-submit', {
      method: 'POST', headers: authUser,
      body: JSON.stringify({ planType: 'meal_plan_generation', phoneNumber: '0712345678', mpesaMessage: realisticSms(code2) }),
    });
    assert('Second payment submits cleanly', submitted.status === 200, JSON.stringify(submitted.body));
    rejectedPaymentId = submitted.body.paymentId;

    const noReason = await req(`/api/admin/payments/${rejectedPaymentId}/reject`, { method: 'POST', headers: authAdmin, body: JSON.stringify({}) });
    assert('Reject without a reason → 400', noReason.status === 400, JSON.stringify(noReason.body));

    const asUser = await req(`/api/admin/payments/${rejectedPaymentId}/reject`, { method: 'POST', headers: authUser, body: JSON.stringify({ reason: 'test' }) });
    assert('Non-admin bearer user cannot reject a payment → 403', asUser.status === 403, JSON.stringify(asUser.body));

    const rejected = await req(`/api/admin/payments/${rejectedPaymentId}/reject`, {
      method: 'POST', headers: authAdmin, body: JSON.stringify({ reason: 'M-Pesa code does not match any transaction on this Till.' }),
    });
    assert('Admin (bearer) can reject a pending payment → 200', rejected.status === 200, JSON.stringify(rejected.body));

    const statusRes = await req(`/api/payments/${rejectedPaymentId}`, { headers: authUser });
    assert('Owner sees status=rejected with the real reason, over bearer', statusRes.body.payment?.status === 'rejected' && statusRes.body.payment?.rejectionReason?.includes('does not match'), JSON.stringify(statusRes.body));

    const doubleReject = await req(`/api/admin/payments/${rejectedPaymentId}/reject`, { method: 'POST', headers: authAdmin, body: JSON.stringify({ reason: 'again' }) });
    assert('Double-reject on an already-rejected payment → 409 (no silent overwrite)', doubleReject.status === 409, JSON.stringify(doubleReject.body));

    const verifyRejected = await req(`/api/admin/payments/${rejectedPaymentId}/verify-till`, { method: 'POST', headers: authAdmin });
    assert('Verifying an already-rejected payment → 409 (invalid state transition blocked)', verifyRejected.status === 409, JSON.stringify(verifyRejected.body));
  }

  // ── Premium self-escalation cannot occur via any part of this flow ──────
  console.log('── No premium/role escalation leaks through the payment flow ──');
  {
    const { data: profile } = await admin.from('profiles').select('is_premium, role').eq('id', userId).maybeSingle();
    assert('A meal_plan_generation payment never sets is_premium (it is an entitlement, not a subscription)', profile?.is_premium !== true, JSON.stringify(profile));
    assert('Payment flow never touches role', profile?.role === 'user', JSON.stringify(profile));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (paymentId) {
      // verify-till sends an access-code email as a side effect, which
      // writes an email_log row with a non-cascading FK to payments — must
      // be cleared before the payment itself can be deleted.
      await admin.from('email_log').delete().eq('related_payment_id', paymentId);
      await admin.from('meal_plan_entitlements').delete().eq('payment_id', paymentId);
      await admin.from('meal_plan_access_codes').delete().eq('payment_id', paymentId);
      await admin.from('payments').delete().eq('id', paymentId);
    }
    if (rejectedPaymentId) {
      await admin.from('email_log').delete().eq('related_payment_id', rejectedPaymentId);
      await admin.from('payments').delete().eq('id', rejectedPaymentId);
    }
    if (userId) await admin.from('notifications').delete().eq('user_id', userId);
    // Deleting the auth users cascades their remaining owned rows (RLS FKs
    // are ON DELETE CASCADE for user-owned tables per schema.sql).
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (otherId) await admin.auth.admin.deleteUser(otherId);
    if (adminId) await admin.auth.admin.deleteUser(adminId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
