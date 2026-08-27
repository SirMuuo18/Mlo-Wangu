/**
 * Mlo Wangu — Phase 3B Stage 3, Item 4: Expiry Warnings Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: the GET /api/auth/me-triggered expiry check for access codes and
 * subscriptions — server-authoritative windowing (24h), deduplication
 * (expiry_warned_at), ownership, and that a far-future expiry never warns.
 *
 * The check runs fire-and-forget (never awaited before /api/auth/me
 * responds, so it can never add latency to that hot-path endpoint) — this
 * suite polls briefly rather than asserting synchronously on the very next
 * line, exactly like a real client would if it cared (it doesn't have to;
 * the notification just needs to exist by the time the bell is checked).
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

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function pollUntil(fn, { attempts = 10, delayMs = 300 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const result = await fn();
    if (result) return result;
    await sleep(delayMs);
  }
  return null;
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const emailA = `mlo-p3b-expiry-a-${stamp}@example.com`;
const emailB = `mlo-p3b-expiry-b-${stamp}@example.com`;
const password = 'Phase3BExpiry123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

console.log('\n═══ Mlo Wangu Phase 3B — Access-Code & Premium Expiry Warnings Suite ═══\n');

let userAId, userBId, soonCodeId, farCodeId, soonSubId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);

  const anonA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sA } = await anonA.auth.signInWithPassword({ email: emailA, password });
  const authA = { Authorization: `Bearer ${sA.session.access_token}` };

  const anonB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sB } = await anonB.auth.signInWithPassword({ email: emailB, password });
  const authB = { Authorization: `Bearer ${sB.session.access_token}` };

  console.log('── Access code expiring within 24h triggers exactly one warning ──');
  {
    const soonExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    const { data: code, error } = await admin.from('meal_plan_access_codes').insert({
      code_hash: `hash_soon_${stamp}`, user_id: userAId, active: true, expires_at: soonExpiry,
    }).select().single();
    assert('Setup: seeded a soon-expiring access code', !error && !!code, error?.message);
    soonCodeId = code?.id;

    const me = await req('/api/auth/me', { headers: authA });
    assert('GET /api/auth/me succeeds', me.status === 200, JSON.stringify(me.body));

    const notif = await pollUntil(async () => {
      const { data } = await admin.from('notifications').select('id, title, message').eq('user_id', userAId).ilike('title', '%access code expires soon%').maybeSingle();
      return data;
    });
    assert('A warning notification was created for the soon-expiring code', !!notif, 'not found after polling');

    const { data: markedCode } = await admin.from('meal_plan_access_codes').select('expiry_warned_at').eq('id', soonCodeId).maybeSingle();
    assert('expiry_warned_at was set on the code row', !!markedCode?.expiry_warned_at, JSON.stringify(markedCode));

    // Second call must NOT create a second notification.
    await req('/api/auth/me', { headers: authA });
    await sleep(500);
    const { data: allNotifs } = await admin.from('notifications').select('id').eq('user_id', userAId).ilike('title', '%access code expires soon%');
    assert('Exactly one warning notification exists even after a second /api/auth/me call (deduplicated)', (allNotifs || []).length === 1, JSON.stringify(allNotifs));
  }

  console.log('── Access code far from expiry never warns ──');
  {
    const farExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const { data: code } = await admin.from('meal_plan_access_codes').insert({
      code_hash: `hash_far_${stamp}`, user_id: userAId, active: true, expires_at: farExpiry,
    }).select().single();
    farCodeId = code?.id;

    await req('/api/auth/me', { headers: authA });
    await sleep(500);
    const { data: farCodeAfter } = await admin.from('meal_plan_access_codes').select('expiry_warned_at').eq('id', farCodeId).maybeSingle();
    assert('A code 5 days from expiry is never warned about', !farCodeAfter?.expiry_warned_at, JSON.stringify(farCodeAfter));
  }

  console.log('── Subscription expiring within 24h triggers a warning ──');
  {
    const soonEnd = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
    const { data: sub, error } = await admin.from('subscriptions').insert({
      user_id: userAId, plan_type: 'monthly', price_ksh: 200, status: 'active',
      start_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), end_date: soonEnd,
    }).select().single();
    assert('Setup: seeded a soon-expiring subscription', !error && !!sub, error?.message);
    soonSubId = sub?.id;

    await req('/api/auth/me', { headers: authA });
    const notif = await pollUntil(async () => {
      const { data } = await admin.from('notifications').select('id').eq('user_id', userAId).ilike('title', '%Premium subscription expires soon%').maybeSingle();
      return data;
    });
    assert('A warning notification was created for the soon-expiring subscription', !!notif, 'not found after polling');

    const { data: markedSub } = await admin.from('subscriptions').select('expiry_warned_at').eq('id', soonSubId).maybeSingle();
    assert('expiry_warned_at was set on the subscription row', !!markedSub?.expiry_warned_at, JSON.stringify(markedSub));
  }

  console.log('── Ownership: User B never gets warned about, or sees, User A\'s expiry ──');
  {
    await req('/api/auth/me', { headers: authB });
    await sleep(500);
    const { data: bNotifs } = await admin.from('notifications').select('id').eq('user_id', userBId);
    const leaked = (bNotifs || []).length > 0;
    assert("User B's /api/auth/me call creates no notifications referencing User A's credentials", !leaked, JSON.stringify(bNotifs));

    const bList = await req('/api/notifications', { headers: authB });
    assert("User B's own notification feed contains none of User A's expiry warnings", (bList.body.notifications || []).length === 0, JSON.stringify(bList.body.notifications));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (soonCodeId) await admin.from('meal_plan_access_codes').delete().eq('id', soonCodeId);
    if (farCodeId) await admin.from('meal_plan_access_codes').delete().eq('id', farCodeId);
    if (soonSubId) await admin.from('subscriptions').delete().eq('id', soonSubId);
    if (userAId) await admin.from('notifications').delete().eq('user_id', userAId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
