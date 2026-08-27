/**
 * Mlo Wangu — Phase 3B Stage 3, Item 3: Server-Computed Budget-Digest Push Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: the GET /api/auth/me-triggered digest — opt-in gating, dedup
 * (budget_digest_last_sent_at, 7-day window), "no budget set up yet" skip,
 * payload privacy (no KSh figures in the notification body), and that
 * having zero/an invalid registered push token never breaks the request
 * that triggers the digest (push delivery is best-effort by construction).
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
const emailA = `mlo-p3b-digest-a-${stamp}@example.com`;
const emailB = `mlo-p3b-digest-b-${stamp}@example.com`;
const emailC = `mlo-p3b-digest-c-${stamp}@example.com`; // opted-in, no budget
const password = 'Phase3BDigest123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function signIn(email) {
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data } = await anon.auth.signInWithPassword({ email, password });
  return { Authorization: `Bearer ${data.session.access_token}` };
}

async function unlockBudget(auth) {
  let res = await req('/api/financial-auth/setup-pin', { method: 'POST', headers: auth, body: JSON.stringify({ pin: '583920', confirmPin: '583920' }) });
  if (res.status !== 200 || !res.body.financialToken) {
    throw new Error(`setup-pin failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.financialToken;
}

console.log('\n═══ Mlo Wangu Phase 3B — Budget-Digest Push Suite ═══\n');

let userAId, userBId, userCId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);
  userCId = await createConfirmedUser(emailC);

  const authA = await signIn(emailA);
  const authB = await signIn(emailB);
  const authC = await signIn(emailC);

  console.log('── Setup: User A sets up a budget and opts in ──');
  {
    const finToken = await unlockBudget(authA);
    const setBudget = await req('/api/financial/budget', {
      method: 'PUT', headers: { ...authA, 'X-Financial-Session': finToken },
      body: JSON.stringify({ budget: { monthlyIncomeKsh: 50000, month: new Date().toISOString().slice(0, 7), categories: [{ category: 'Food', plannedAmountKsh: 15000, color: '#14532D' }] } }),
    });
    assert('Budget set up succeeds', setBudget.status === 200, JSON.stringify(setBudget.body));

    const optIn = await req('/api/profile', { method: 'PUT', headers: authA, body: JSON.stringify({ budgetDigestEnabled: true }) });
    assert('Opt-in via PUT /api/profile succeeds', optIn.status === 200 && optIn.body.user?.budgetDigestEnabled === true, JSON.stringify(optIn.body));
  }

  console.log('── Digest fires once, with no financial figures in the body ──');
  {
    await req('/api/auth/me', { headers: authA });
    const notif = await pollUntil(async () => {
      const { data } = await admin.from('notifications').select('id, title, message').eq('user_id', userAId).eq('type', 'budget').maybeSingle();
      return data;
    });
    assert('A budget-digest notification was created', !!notif, 'not found after polling');
    assert('The notification body contains no KSh figure', notif && !/KSh\s*[\d,]+/.test(notif.message), JSON.stringify(notif));
    assert('The notification body contains no explicit category name (e.g. "Food")', notif && !/\bFood\b/.test(notif.message), JSON.stringify(notif));

    // The notification insert and the budget_digest_last_sent_at update are
    // two sequential awaits inside the same fire-and-forget call — polling
    // above only guarantees the first has landed; give the second a moment too.
    await sleep(300);
    const { data: profileAfter } = await admin.from('profiles').select('budget_digest_last_sent_at').eq('id', userAId).maybeSingle();
    assert('budget_digest_last_sent_at was set', !!profileAfter?.budget_digest_last_sent_at, JSON.stringify(profileAfter));

    // Second call within the 7-day window must NOT create a second digest.
    await req('/api/auth/me', { headers: authA });
    await sleep(500);
    const { data: allDigests } = await admin.from('notifications').select('id').eq('user_id', userAId).eq('type', 'budget');
    assert('Exactly one digest notification exists after a second /api/auth/me call (7-day dedup)', (allDigests || []).length === 1, JSON.stringify(allDigests));
  }

  console.log('── Push delivery is best-effort — a fake/invalid token never breaks the request ──');
  {
    const registerFake = await req('/api/push/register', { method: 'POST', headers: authA, body: JSON.stringify({ token: `ExponentPushToken[fake-${stamp}]`, platform: 'ios' }) });
    assert('Registering a syntactically-valid-but-fake push token succeeds (server never validates deliverability at registration time)', registerFake.status === 200, JSON.stringify(registerFake.body));

    // Force another eligible digest window by resetting last_sent_at directly (simulates 7+ days passing).
    await admin.from('profiles').update({ budget_digest_last_sent_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() }).eq('id', userAId);
    const me = await req('/api/auth/me', { headers: authA });
    assert('GET /api/auth/me still succeeds even though the registered push token is fake and Expo will reject it', me.status === 200, JSON.stringify(me.body));
  }

  console.log('── Not opted in: no digest ──');
  {
    const finTokenB = await unlockBudget(authB);
    await req('/api/financial/budget', {
      method: 'PUT', headers: { ...authB, 'X-Financial-Session': finTokenB },
      body: JSON.stringify({ budget: { monthlyIncomeKsh: 30000, month: new Date().toISOString().slice(0, 7), categories: [{ category: 'Food', plannedAmountKsh: 10000, color: '#14532D' }] } }),
    });
    // Deliberately never opts in.
    await req('/api/auth/me', { headers: authB });
    await sleep(500);
    const { data } = await admin.from('notifications').select('id').eq('user_id', userBId).eq('type', 'budget');
    assert('User B (never opted in) receives no digest, even with a real budget set up', (data || []).length === 0, JSON.stringify(data));
  }

  console.log('── Opted in but no budget set up: no digest ──');
  {
    const optIn = await req('/api/profile', { method: 'PUT', headers: authC, body: JSON.stringify({ budgetDigestEnabled: true }) });
    assert('User C can opt in without ever having set up a budget', optIn.status === 200, JSON.stringify(optIn.body));
    await req('/api/auth/me', { headers: authC });
    await sleep(500);
    const { data } = await admin.from('notifications').select('id').eq('user_id', userCId).eq('type', 'budget');
    assert('User C (opted in, no budget) receives no digest — nothing meaningful to summarize', (data || []).length === 0, JSON.stringify(data));
  }

  console.log('── Cross-user isolation ──');
  {
    const bList = await req('/api/notifications', { headers: authB });
    const leaked = (bList.body.notifications || []).some((n) => n.type === 'budget');
    assert("User B's own notification feed never contains User A's digest", !leaked, JSON.stringify(bList.body.notifications));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (userAId) { await admin.from('notifications').delete().eq('user_id', userAId); await admin.from('push_tokens').delete().eq('user_id', userAId); await admin.auth.admin.deleteUser(userAId); }
    if (userBId) { await admin.from('notifications').delete().eq('user_id', userBId); await admin.auth.admin.deleteUser(userBId); }
    if (userCId) { await admin.from('notifications').delete().eq('user_id', userCId); await admin.auth.admin.deleteUser(userCId); }
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
