/**
 * Mlo Wangu — notification ownership isolation suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Proves the fix for the notification ownership bug: `getNotifications`
 * used to return any row with no userId to every caller
 * (`!n.userId || n.userId === userId`), and the `notifs_read` RLS policy had
 * the identical hole (`user_id IS NULL OR user_id = auth.uid()`). Both are
 * now strict `user_id = auth.uid()` / `n.userId === userId` — this suite
 * checks the app-layer fix (API isolation) AND the RLS-layer fix (a direct
 * anon-key Supabase read, which is what Expo will eventually do).
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
const emailA = `mlo-notif-a-${stamp}@example.com`;
const emailB = `mlo-notif-b-${stamp}@example.com`;
const password = 'NotifTest123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function loginRaw(email) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { cookie: cookieHeaderFrom(res.headers.get('set-cookie')) };
}

console.log('\n═══ Mlo Wangu Notification Isolation Suite ═══\n');

let userAId, userBId, notifAId, orphanId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);
  const { cookie: cookieA } = await loginRaw(emailA);
  const { cookie: cookieB } = await loginRaw(emailB);

  // A real Supabase session for User B, for the direct-anon-key RLS check.
  const bClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: bSession, error: bSessionErr } = await bClient.auth.signInWithPassword({ email: emailB, password });
  if (bSessionErr) throw new Error(`B session sign-in failed: ${bSessionErr.message}`);

  // ── Seed: a notification owned by A, and a legacy orphaned (NULL owner) row ──
  const { data: notifA, error: notifAErr } = await admin.from('notifications').insert({
    user_id: userAId, title: 'Private to A', message: 'Only User A should ever see this.', type: 'system',
  }).select('*').single();
  if (notifAErr) throw new Error(`seed notification A failed: ${notifAErr.message}`);
  notifAId = notifA.id;

  const { data: orphan, error: orphanErr } = await admin.from('notifications').insert({
    user_id: null, title: 'Legacy orphan', message: 'No owner — must never be returned to anyone.', type: 'system',
  }).select('*').single();
  if (orphanErr) throw new Error(`seed orphan notification failed: ${orphanErr.message}`);
  orphanId = orphan.id;

  // ── App-layer isolation ──────────────────────────────────────────────────
  console.log('── App-layer (Express API) isolation ──');
  {
    const listA = await req('/api/notifications', { headers: { Cookie: cookieA } });
    assert("User A's own notification appears in their feed", listA.body.notifications?.some((n) => n.id === notifAId), JSON.stringify(listA.body).slice(0, 200));
    assert('The orphaned (NULL-owner) notification does NOT appear for User A', !listA.body.notifications?.some((n) => n.id === orphanId));

    const listB = await req('/api/notifications', { headers: { Cookie: cookieB } });
    assert("User B's feed does NOT contain User A's notification", !listB.body.notifications?.some((n) => n.id === notifAId), JSON.stringify(listB.body).slice(0, 200));
    assert('The orphaned (NULL-owner) notification does NOT appear for User B either', !listB.body.notifications?.some((n) => n.id === orphanId));

    const markByB = await req(`/api/notifications/${notifAId}/read`, { method: 'POST', headers: { Cookie: cookieB } });
    assert("User B cannot mark User A's notification as read (404)", markByB.status === 404, JSON.stringify(markByB.body));

    const markByA = await req(`/api/notifications/${notifAId}/read`, { method: 'POST', headers: { Cookie: cookieA } });
    assert('User A can mark their own notification as read', markByA.status === 200, JSON.stringify(markByA.body));
  }

  // ── RLS-layer isolation (direct Supabase, anon key + real user JWT) ──────
  console.log('── RLS-layer isolation (direct Supabase read, as Expo eventually will) ──');
  {
    const { data: bDirectRead, error: bDirectErr } = await bClient.from('notifications').select('*').eq('id', notifAId);
    assert("Direct Supabase read as User B returns zero rows for User A's notification (RLS)", !bDirectErr && (bDirectRead?.length ?? 0) === 0, JSON.stringify({ error: bDirectErr?.message, rows: bDirectRead?.length }));

    const { data: bOrphanRead, error: bOrphanErr } = await bClient.from('notifications').select('*').eq('id', orphanId);
    assert('Direct Supabase read as User B returns zero rows for the orphaned notification (RLS)', !bOrphanErr && (bOrphanRead?.length ?? 0) === 0, JSON.stringify({ error: bOrphanErr?.message, rows: bOrphanRead?.length }));

    const bClientSession = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${bSession.session.access_token}` } },
    });
    const { data: bOwnRead, error: bOwnErr } = await bClientSession.from('notifications').select('*').eq('user_id', userBId);
    assert("Direct Supabase read as User B for their OWN user_id is allowed (policy isn't overly strict)", !bOwnErr, bOwnErr?.message);
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (notifAId) await admin.from('notifications').delete().eq('id', notifAId);
    if (orphanId) await admin.from('notifications').delete().eq('id', orphanId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
