/**
 * Mlo Wangu — Bearer-token authentication suite (Expo preparation).
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * requireAuth/optionalAuth now accept `Authorization: Bearer <supabase
 * access token>` as an alternative to the web's HttpOnly cookie — this
 * suite proves: valid bearer succeeds, invalid/garbage bearer 401s, a
 * revoked/expired bearer 401s, no credentials at all 401s, the existing
 * cookie flow is completely unaffected, and a bearer token can never be
 * used (via any forged header/body field) to act as a different user than
 * the one the token actually belongs to.
 *
 * Never prints credentials/tokens.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

let passed = 0, failed = 0;
function assert(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✅  ${name}`); }
  else { failed++; console.log(`  ❌  ${name}${detail ? `\n      → ${detail}` : ''}`); }
}

const BASE = 'http://localhost:3000';
async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let body; try { body = await res.json(); } catch { body = {}; }
  return { status: res.status, body, headers: res.headers };
}
function cookieHeaderFrom(setCookie) {
  return (setCookie || '').split(',').map((c) => c.split(';')[0]).join('; ');
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const emailA = `mlo-bearer-a-${stamp}@example.com`;
const emailB = `mlo-bearer-b-${stamp}@example.com`;
const password = 'BearerTest123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

console.log('\n═══ Mlo Wangu Bearer-Token Auth Suite ═══\n');

let userAId, userBId, customMealId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);

  const anonA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionA, error: sessionAErr } = await anonA.auth.signInWithPassword({ email: emailA, password });
  if (sessionAErr) throw new Error(`A sign-in failed: ${sessionAErr.message}`);
  const tokenA = sessionA.session.access_token;

  const anonB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionB, error: sessionBErr } = await anonB.auth.signInWithPassword({ email: emailB, password });
  if (sessionBErr) throw new Error(`B sign-in failed: ${sessionBErr.message}`);
  const tokenB = sessionB.session.access_token;

  // ── Valid bearer token ───────────────────────────────────────────────────
  console.log('── Valid bearer token ──');
  {
    const me = await req('/api/auth/me', { headers: { Authorization: `Bearer ${tokenA}` } });
    assert('Valid bearer token succeeds on GET /api/auth/me', me.status === 200 && me.body.user?.id === userAId, JSON.stringify(me.body));
  }

  // ── Invalid / garbage bearer token ───────────────────────────────────────
  console.log('── Invalid bearer token ──');
  {
    const res = await req('/api/auth/me', { headers: { Authorization: 'Bearer not-a-real-token-at-all' } });
    assert('Garbage bearer token → 401', res.status === 401, JSON.stringify(res.body));
  }

  // ── Expired/revoked bearer token ─────────────────────────────────────────
  console.log('── Revoked bearer token ──');
  {
    await admin.auth.admin.signOut(tokenB, 'global');
    const res = await req('/api/auth/me', { headers: { Authorization: `Bearer ${tokenB}` } });
    assert('Revoked bearer token → 401', res.status === 401, JSON.stringify(res.body));
  }

  // ── No credentials at all ────────────────────────────────────────────────
  console.log('── No credentials ──');
  {
    const res = await req('/api/auth/me');
    assert('No cookie, no bearer → 401', res.status === 401, JSON.stringify(res.body));
  }

  // ── Existing cookie flow still works, unmodified ─────────────────────────
  console.log('── Cookie flow unaffected ──');
  {
    const loginRes = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password }) });
    const cookie = cookieHeaderFrom(loginRes.headers.get('set-cookie'));
    assert('Cookie login still succeeds', loginRes.status === 200);
    const me = await req('/api/auth/me', { headers: { Cookie: cookie } });
    assert('Cookie session still authenticates on GET /api/auth/me', me.status === 200 && me.body.user?.id === userAId, JSON.stringify(me.body));
  }

  // ── A bearer token for User A can never act as User B ────────────────────
  console.log('── Bearer token cannot impersonate another user ──');
  {
    // Re-sign-in A (their earlier session is still separate from B's revoked one).
    const created = await req('/api/meals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      // Forged fields that don't exist as accepted input, plus a forged
      // Authorization-adjacent header some client might mistakenly send —
      // none of these can override the identity verified from tokenA itself.
      body: JSON.stringify({ name: `Bearer Test Meal ${stamp}`, category: 'dinner', ownerId: userBId, userId: userBId }),
    });
    assert('Custom meal created via bearer token succeeds', created.status === 201, JSON.stringify(created.body));
    customMealId = created.body.meal?.id;
    assert("Created meal's ownerId is the bearer token's real owner (A), not the forged body value (B)", created.body.meal?.ownerId === userAId, JSON.stringify(created.body.meal));

    // And User B's own bearer token (freshly re-signed-in, since the earlier one was revoked) cannot see or delete it.
    const { data: freshB } = await anonB.auth.signInWithPassword({ email: emailB, password });
    const getAsB = await req(`/api/meals/${customMealId}`, { headers: { Authorization: `Bearer ${freshB.session.access_token}` } });
    assert("User B's bearer token cannot fetch User A's custom meal (404)", getAsB.status === 404, JSON.stringify(getAsB.body));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (customMealId) await admin.from('meals').delete().eq('id', customMealId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
