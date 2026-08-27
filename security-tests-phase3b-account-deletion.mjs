/**
 * Mlo Wangu — Phase 3B Stage 4, Item 9: Self-Service Account Deletion Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: password re-verification, explicit typed confirmation, the
 * non-admin restriction (approved Stage 4 product decision — admin
 * self-deletion is rejected cleanly, nothing partially removed, no DB/FK
 * detail exposed), successful deletion with real data cascading away,
 * old credentials/session stop working afterward, cross-user protection
 * (no request field can name a different account), no partial deletion on
 * a rejected attempt, repeated-deletion behavior, and generic error text
 * throughout (no account-enumeration or implementation-detail leakage).
 *
 * NOTE: accountDeleteLimiter (server.ts) is a strict 5-per-hour IP-keyed
 * limiter, and — since it's mounted after requireAuth in the route's
 * middleware chain — only counts requests that pass authentication. This
 * suite is deliberately frugal (5 authenticated calls to the endpoint
 * total; the final "repeated deletion" check is free, since by then the
 * token is invalid and 401s at requireAuth before ever reaching the
 * limiter) and, like the payment-flow suite before it, must be run
 * against a freshly-restarted server.
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
const emailA = `mlo-p3b-del-a-${stamp}@example.com`;
const emailB = `mlo-p3b-del-b-${stamp}@example.com`;
const emailAdmin = `mlo-p3b-del-admin-${stamp}@example.com`;
const password = 'Phase3BDelete123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function signIn(email) {
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) return null;
  return { token: data.session.access_token, auth: { Authorization: `Bearer ${data.session.access_token}` } };
}

console.log('\n═══ Mlo Wangu Phase 3B — Account Deletion Suite ═══\n');

let userAId, userBId, adminId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);
  adminId = await createConfirmedUser(emailAdmin);
  await admin.from('profiles').update({ role: 'admin' }).eq('id', adminId);

  const sessA = await signIn(emailA);
  const sessB = await signIn(emailB);
  const sessAdmin = await signIn(emailAdmin);

  console.log('── Validation & auth ──');
  {
    const noAuth = await req('/api/account/delete', { method: 'POST', body: JSON.stringify({ currentPassword: password, confirmation: 'DELETE' }) });
    assert('Unauthenticated → 401', noAuth.status === 401, JSON.stringify(noAuth.body));

    const noConfirmation = await req('/api/account/delete', { method: 'POST', headers: sessA.auth, body: JSON.stringify({ currentPassword: password }) });
    assert('Missing/wrong confirmation string → 400 (nothing deleted)', noConfirmation.status === 400, JSON.stringify(noConfirmation.body));

    const { data: stillThereAfterBadAttempts } = await admin.auth.admin.getUserById(userAId);
    assert('Account is completely untouched after the rejected attempts above', !!stillThereAfterBadAttempts?.user, JSON.stringify(stillThereAfterBadAttempts?.user?.id));
  }

  console.log('── Password re-verification ──');
  {
    const wrongPassword = await req('/api/account/delete', { method: 'POST', headers: sessA.auth, body: JSON.stringify({ currentPassword: 'DefinitelyWrongPassword1!', confirmation: 'DELETE' }) });
    assert('Wrong current password → 401 (nothing deleted)', wrongPassword.status === 401, JSON.stringify(wrongPassword.body));
    const { data: stillThere } = await admin.auth.admin.getUserById(userAId);
    assert('Account survives a wrong-password deletion attempt', !!stillThere?.user, JSON.stringify(stillThere?.user?.id));
    assert('Error message is generic — no account-enumeration or implementation detail', wrongPassword.body.error === 'Current password is incorrect.', JSON.stringify(wrongPassword.body));
  }

  console.log('── Admin self-deletion is rejected cleanly, no partial action ──');
  {
    const adminAttempt = await req('/api/account/delete', { method: 'POST', headers: sessAdmin.auth, body: JSON.stringify({ currentPassword: password, confirmation: 'DELETE' }) });
    assert('Admin account deletion attempt → 403', adminAttempt.status === 403, JSON.stringify(adminAttempt.body));
    assert('Rejection message never mentions FKs, constraints, or SQL', !/foreign key|constraint|sql|admin_audit_log|verified_by/i.test(adminAttempt.body.error || ''), JSON.stringify(adminAttempt.body));
    const { data: adminStillThere } = await admin.auth.admin.getUserById(adminId);
    assert('Admin account remains completely intact', !!adminStillThere?.user, JSON.stringify(adminStillThere?.user?.id));
    const { data: adminProfile } = await admin.from('profiles').select('role').eq('id', adminId).maybeSingle();
    assert('Admin role is unchanged', adminProfile?.role === 'admin', JSON.stringify(adminProfile));
  }

  console.log('── Cross-user protection: no field can name a different account ──');
  {
    // The route reads no target-user field from the body at all — proven
    // by confirming User B's own token can only ever act on User B.
    const bAttemptWrongPassword = await req('/api/account/delete', { method: 'POST', headers: sessB.auth, body: JSON.stringify({ currentPassword: 'wrong', confirmation: 'DELETE', userId: userAId, targetUserId: userAId }) });
    assert("A forged userId/targetUserId in the body has no effect — User B's own token still only checks User B's own password", bAttemptWrongPassword.status === 401, JSON.stringify(bAttemptWrongPassword.body));
    const { data: aUntouched } = await admin.auth.admin.getUserById(userAId);
    assert("User A is completely unaffected by User B's attempt, forged fields or not", !!aUntouched?.user, JSON.stringify(aUntouched?.user?.id));
  }

  console.log('── Successful deletion (User A, real data cascades away) ──');
  let deletedNotificationId;
  {
    const { data: notif } = await admin.from('notifications').insert({ user_id: userAId, title: 'Deletion test notification', message: 'will cascade away', type: 'system' }).select().single();
    deletedNotificationId = notif?.id;
    await admin.from('reminder_configs').insert({ user_id: userAId, type: 'custom', label: 'Deletion test reminder', time: '08:00', days_of_week: [] });

    const del = await req('/api/account/delete', { method: 'POST', headers: sessA.auth, body: JSON.stringify({ currentPassword: password, confirmation: 'DELETE' }) });
    assert('Owner can delete their own account with correct password + confirmation → 200', del.status === 200, JSON.stringify(del.body));

    const { data: gone } = await admin.auth.admin.getUserById(userAId).catch(() => ({ data: null }));
    assert('The auth.users row is actually gone', !gone?.user, JSON.stringify(gone?.user?.id));

    const { data: profileGone } = await admin.from('profiles').select('id').eq('id', userAId).maybeSingle();
    assert('The profiles row cascaded away', !profileGone, JSON.stringify(profileGone));

    const { data: notifGone } = await admin.from('notifications').select('id').eq('id', deletedNotificationId).maybeSingle();
    assert('Notifications cascaded away', !notifGone, JSON.stringify(notifGone));

    const { data: remindersGone } = await admin.from('reminder_configs').select('id').eq('user_id', userAId);
    assert('Reminders cascaded away', (remindersGone || []).length === 0, JSON.stringify(remindersGone));
  }

  console.log('── Old credentials/session stop working ──');
  {
    const oldTokenStillUsed = await req('/api/auth/me', { headers: sessA.auth });
    assert('The pre-deletion Bearer token is now rejected → 401', oldTokenStillUsed.status === 401, JSON.stringify(oldTokenStillUsed.body));

    const reLogin = await signIn(emailA);
    assert('Logging in again with the old email/password fails entirely (account is gone)', reLogin === null);
  }

  console.log('── Repeated-deletion behavior ──');
  {
    const secondAttempt = await req('/api/account/delete', { method: 'POST', headers: sessA.auth, body: JSON.stringify({ currentPassword: password, confirmation: 'DELETE' }) });
    assert('A second deletion attempt with the now-invalid token is rejected (401), not a crash or a false success', secondAttempt.status === 401, JSON.stringify(secondAttempt.body));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (userBId) await admin.auth.admin.deleteUser(userBId);
    if (adminId) await admin.auth.admin.deleteUser(adminId);
    // userAId is expected to already be gone by this point — no cleanup needed.
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
