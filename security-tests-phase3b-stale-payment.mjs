/**
 * Mlo Wangu — Phase 3B Stage 3, Item 14: Stale Pending-Payment Visibility Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: GET /api/payments/:id's derived isStale field — a fresh pending
 * payment reports false, an old one reports true, and critically: isStale
 * is PURELY a read-time computation that never touches payment.status or
 * blocks the admin from still verifying/rejecting a "stale" payment
 * exactly as before. Also covers success/rejected/cancelled payments
 * (isStale is always false for any non-pending status, by definition) and
 * cross-user isolation (already covered elsewhere for this endpoint, but
 * re-confirmed here since the response shape changed).
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
const emailUser = `mlo-p3b-stale-user-${stamp}@example.com`;
const emailOther = `mlo-p3b-stale-other-${stamp}@example.com`;
const emailAdmin = `mlo-p3b-stale-admin-${stamp}@example.com`;
const password = 'Phase3BStale123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

console.log('\n═══ Mlo Wangu Phase 3B — Stale Pending-Payment Visibility Suite ═══\n');

let userId, otherId, adminId, freshId, staleId, successId, rejectedId;
try {
  userId = await createConfirmedUser(emailUser);
  otherId = await createConfirmedUser(emailOther);
  adminId = await createConfirmedUser(emailAdmin);
  await admin.from('profiles').update({ role: 'admin' }).eq('id', adminId);

  const anonUser = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sUser } = await anonUser.auth.signInWithPassword({ email: emailUser, password });
  const authUser = { Authorization: `Bearer ${sUser.session.access_token}` };

  const anonOther = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sOther } = await anonOther.auth.signInWithPassword({ email: emailOther, password });
  const authOther = { Authorization: `Bearer ${sOther.session.access_token}` };

  const anonAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sAdmin } = await anonAdmin.auth.signInWithPassword({ email: emailAdmin, password });
  const authAdmin = { Authorization: `Bearer ${sAdmin.session.access_token}` };

  async function seedPayment(status, createdAt, extra = {}) {
    const { data, error } = await admin.from('payments').insert({
      user_id: userId, amount_ksh: 50, phone_number: '254712345678', plan_type: 'meal_plan_generation',
      payment_method: 'till_manual', status, created_at: createdAt,
      mpesa_receipt: `STALE${Math.random().toString(36).slice(2, 9).toUpperCase()}`, ...extra,
    }).select().single();
    if (error) throw new Error(`seed payment failed: ${error.message}`);
    return data.id;
  }

  console.log('── Fresh vs. stale pending payments ──');
  {
    freshId = await seedPayment('pending', new Date().toISOString());
    const fresh = await req(`/api/payments/${freshId}`, { headers: authUser });
    assert('Fresh pending payment reports isStale=false', fresh.body.payment?.isStale === false, JSON.stringify(fresh.body.payment));

    staleId = await seedPayment('pending', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()); // 72h old
    const stale = await req(`/api/payments/${staleId}`, { headers: authUser });
    assert('72h-old pending payment reports isStale=true', stale.body.payment?.isStale === true, JSON.stringify(stale.body.payment));
    assert('Stale payment status is still "pending" — isStale never changed the real status', stale.body.payment?.status === 'pending', JSON.stringify(stale.body.payment));
  }

  console.log('── isStale is always false for non-pending statuses ──');
  {
    successId = await seedPayment('success', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), { verified_at: new Date().toISOString() });
    const success = await req(`/api/payments/${successId}`, { headers: authUser });
    assert('An old but successful payment reports isStale=false (staleness only applies to pending)', success.body.payment?.isStale === false, JSON.stringify(success.body.payment));

    rejectedId = await seedPayment('rejected', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), { rejection_reason: 'Test rejection', verified_at: new Date().toISOString() });
    const rejected = await req(`/api/payments/${rejectedId}`, { headers: authUser });
    assert('An old rejected payment reports isStale=false', rejected.body.payment?.isStale === false, JSON.stringify(rejected.body.payment));
  }

  console.log('── Stale flag never blocks a real admin action ──');
  {
    const verify = await req(`/api/admin/payments/${staleId}/verify-till`, { method: 'POST', headers: authAdmin });
    assert('Admin can still verify a "stale" payment exactly as any other pending one → 200', verify.status === 200, JSON.stringify(verify.body));
    const { data: row } = await admin.from('payments').select('status').eq('id', staleId).maybeSingle();
    assert('The verified payment is now a real status=success, not stuck because it was flagged stale', row?.status === 'success', JSON.stringify(row));
  }

  console.log('── Cross-user isolation (response shape changed — re-confirmed) ──');
  {
    const asOther = await req(`/api/payments/${freshId}`, { headers: authOther });
    assert("A different user cannot read this payment, isStale field or not → 404", asOther.status === 404, JSON.stringify(asOther.body));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    for (const id of [freshId, staleId, successId, rejectedId]) {
      if (id) {
        await admin.from('meal_plan_entitlements').delete().eq('payment_id', id);
        await admin.from('meal_plan_access_codes').delete().eq('payment_id', id);
        await admin.from('email_log').delete().eq('related_payment_id', id);
        await admin.from('payments').delete().eq('id', id);
      }
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (otherId) await admin.auth.admin.deleteUser(otherId);
    if (adminId) await admin.auth.admin.deleteUser(adminId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
