/**
 * Mlo Wangu — Phase 3B Stage 1 Foundation Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers the three Stage 1 items: push-token infrastructure (item 1),
 * the email_log cascade fix (item 13), and the server error log (item 15).
 *
 * NOT covered, and not claimed as tested:
 *   - Actual push delivery to a real device (no device/emulator available —
 *     same disclosed limitation as every prior phase's local-reminder work).
 *   - A live server_error_log write triggered by a genuinely thrown server
 *     exception — forcing one deterministically over HTTP isn't attempted
 *     here. The write path itself is exercised directly (matching this
 *     codebase's existing "[MOCK TEST]" convention for hard-to-trigger
 *     scenarios); what's actually asserted is the read-side authorization
 *     (admin-only, 401/403 boundaries) and that a manually-inserted row
 *     round-trips through the admin endpoint correctly.
 *
 * Creates its own throwaway users via the service-role admin API and cleans
 * them up (including push_tokens/server_error_log/payments/email_log rows
 * it creates) at the end. Never prints tokens/secrets.
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
const emailUser = `mlo-p3b-user-${stamp}@example.com`;
const emailOther = `mlo-p3b-other-${stamp}@example.com`;
const emailAdmin = `mlo-p3b-admin-${stamp}@example.com`;
const password = 'Phase3BFoundation123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

console.log('\n═══ Mlo Wangu Phase 3B Stage 1 Foundation Suite ═══\n');

let userId, otherId, adminId, seededPaymentId, seededErrorLogId;
try {
  userId = await createConfirmedUser(emailUser);
  otherId = await createConfirmedUser(emailOther);
  adminId = await createConfirmedUser(emailAdmin);
  await admin.from('profiles').update({ role: 'admin' }).eq('id', adminId);

  const anonUser = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sUser } = await anonUser.auth.signInWithPassword({ email: emailUser, password });
  const tokenUser = sUser.session.access_token;

  const anonOther = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sOther } = await anonOther.auth.signInWithPassword({ email: emailOther, password });
  const tokenOther = sOther.session.access_token;

  const anonAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sAdmin } = await anonAdmin.auth.signInWithPassword({ email: emailAdmin, password });
  const tokenAdmin = sAdmin.session.access_token;

  const authUser = { Authorization: `Bearer ${tokenUser}` };
  const authOther = { Authorization: `Bearer ${tokenOther}` };
  const authAdmin = { Authorization: `Bearer ${tokenAdmin}` };

  const fakeToken1 = `ExponentPushToken[p3b-test-${stamp}-a]`;
  const fakeToken2 = `ExponentPushToken[p3b-test-${stamp}-b]`;

  // ── Push token registration: auth, validation, ownership ────────────────
  console.log('── Push token registration ──');
  {
    const noAuth = await req('/api/push/register', { method: 'POST', body: JSON.stringify({ token: fakeToken1, platform: 'ios' }) });
    assert('Unauthenticated register → 401', noAuth.status === 401, JSON.stringify(noAuth.body));

    const badPlatform = await req('/api/push/register', { method: 'POST', headers: authUser, body: JSON.stringify({ token: fakeToken1, platform: 'windows' }) });
    assert('Invalid platform → 400', badPlatform.status === 400, JSON.stringify(badPlatform.body));

    const badToken = await req('/api/push/register', { method: 'POST', headers: authUser, body: JSON.stringify({ token: 'x', platform: 'ios' }) });
    assert('Too-short token → 400', badToken.status === 400, JSON.stringify(badToken.body));

    const ok = await req('/api/push/register', { method: 'POST', headers: authUser, body: JSON.stringify({ token: fakeToken1, platform: 'ios' }) });
    assert('Valid registration → 200', ok.status === 200, JSON.stringify(ok.body));

    const { data: row } = await admin.from('push_tokens').select('user_id, platform').eq('token', fakeToken1).maybeSingle();
    assert('Token row is scoped to the registering user', row?.user_id === userId, JSON.stringify(row));
    assert('Platform stored correctly', row?.platform === 'ios', JSON.stringify(row));
  }

  // ── Multiple devices per user ─────────────────────────────────────────────
  console.log('── Multiple devices per user ──');
  {
    const second = await req('/api/push/register', { method: 'POST', headers: authUser, body: JSON.stringify({ token: fakeToken2, platform: 'android' }) });
    assert('Second device registers → 200', second.status === 200, JSON.stringify(second.body));

    const { data: rows } = await admin.from('push_tokens').select('token').eq('user_id', userId);
    assert('User now has exactly 2 registered devices', (rows || []).length === 2, JSON.stringify(rows));
  }

  // ── Re-registering the same token under a different account reassigns it ─
  console.log('── Token re-registration reassigns ownership (upsert-by-token) ──');
  {
    const reassign = await req('/api/push/register', { method: 'POST', headers: authOther, body: JSON.stringify({ token: fakeToken1, platform: 'ios' }) });
    assert('User B can register the same physical token → 200', reassign.status === 200, JSON.stringify(reassign.body));

    const { data: row } = await admin.from('push_tokens').select('user_id').eq('token', fakeToken1).maybeSingle();
    assert('Token now belongs to User B, not User A (no stale cross-user row)', row?.user_id === otherId, JSON.stringify(row));

    const { data: allWithToken } = await admin.from('push_tokens').select('id').eq('token', fakeToken1);
    assert('Exactly one row exists for this token (no duplicate)', (allWithToken || []).length === 1, JSON.stringify(allWithToken));
  }

  // ── Unregister requires ownership ────────────────────────────────────────
  console.log('── Unregister ownership ──');
  {
    // fakeToken1 now belongs to otherId — userId attempting to unregister it must not delete it.
    const wrongOwner = await req('/api/push/unregister', { method: 'POST', headers: authUser, body: JSON.stringify({ token: fakeToken1 }) });
    assert('Unregister call from the non-owner still returns 200 (no info leak)', wrongOwner.status === 200, JSON.stringify(wrongOwner.body));
    const { data: stillThere } = await admin.from('push_tokens').select('id').eq('token', fakeToken1).maybeSingle();
    assert("Non-owner's unregister call did NOT delete User B's token", !!stillThere, JSON.stringify(stillThere));

    const rightOwner = await req('/api/push/unregister', { method: 'POST', headers: authOther, body: JSON.stringify({ token: fakeToken1 }) });
    assert('Owner can unregister their own token → 200', rightOwner.status === 200, JSON.stringify(rightOwner.body));
    const { data: gone } = await admin.from('push_tokens').select('id').eq('token', fakeToken1).maybeSingle();
    assert('Token is actually deleted after the real owner unregisters it', !gone, JSON.stringify(gone));
  }

  // ── email_log cascade fix (item 13) ──────────────────────────────────────
  console.log('── email_log ON DELETE SET NULL (item 13) ──');
  {
    const { data: payment, error: payErr } = await admin.from('payments').insert({
      user_id: userId, amount_ksh: 50, phone_number: '254712345678',
      plan_type: 'meal_plan_generation', payment_method: 'till_manual', status: 'success',
      mpesa_receipt: `P3BFIX${stamp}`,
    }).select().single();
    assert('Setup: seeded a payment row', !payErr && !!payment, payErr?.message);
    seededPaymentId = payment?.id;

    const { data: logRow, error: logErr } = await admin.from('email_log').insert({
      user_id: userId, recipient: emailUser, email_type: 'access_code',
      status: 'not_configured', related_payment_id: seededPaymentId,
    }).select().single();
    assert('Setup: seeded an email_log row referencing that payment', !logErr && !!logRow, logErr?.message);

    const { error: delErr } = await admin.from('payments').delete().eq('id', seededPaymentId);
    assert('Deleting the payment no longer errors (FK violation is fixed)', !delErr, delErr?.message);
    seededPaymentId = null; // already deleted — don't try again in cleanup

    const { data: survived } = await admin.from('email_log').select('id, related_payment_id').eq('id', logRow.id).maybeSingle();
    assert('The email_log row survives the payment deletion', !!survived, JSON.stringify(survived));
    assert('related_payment_id is now NULL, not dangling', survived?.related_payment_id === null, JSON.stringify(survived));
  }

  // ── Server error log (item 15): read-side authorization ──────────────────
  console.log('── Server error log — admin-only read access ──');
  {
    const { data: errRow, error: seedErr } = await admin.from('server_error_log').insert({
      route: '/api/test/seeded', severity: 'error', user_id: userId,
      message: 'Seeded test error row', context: { note: 'phase3b-foundation-suite' },
    }).select().single();
    assert('Setup: seeded a server_error_log row directly', !seedErr && !!errRow, seedErr?.message);
    seededErrorLogId = errRow?.id;

    const noAuth = await req('/api/admin/error-log');
    assert('Unauthenticated → 401', noAuth.status === 401, JSON.stringify(noAuth.body));

    const nonAdmin = await req('/api/admin/error-log', { headers: authUser });
    assert('Non-admin bearer user → 403', nonAdmin.status === 403, JSON.stringify(nonAdmin.body));

    const asAdmin = await req('/api/admin/error-log', { headers: authAdmin });
    assert('Admin can read the error log → 200', asAdmin.status === 200, JSON.stringify(asAdmin.body));
    const found = (asAdmin.body.rows || []).some((r) => r.id === seededErrorLogId);
    assert('The seeded row appears in the admin listing', found, JSON.stringify(asAdmin.body.rows?.slice(0, 3)));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (seededErrorLogId) await admin.from('server_error_log').delete().eq('id', seededErrorLogId);
    if (seededPaymentId) await admin.from('payments').delete().eq('id', seededPaymentId);
    if (userId) await admin.from('push_tokens').delete().eq('user_id', userId);
    if (otherId) await admin.from('push_tokens').delete().eq('user_id', otherId);
    if (userId) await admin.from('email_log').delete().eq('user_id', userId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (otherId) await admin.auth.admin.deleteUser(otherId);
    if (adminId) await admin.auth.admin.deleteUser(adminId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
