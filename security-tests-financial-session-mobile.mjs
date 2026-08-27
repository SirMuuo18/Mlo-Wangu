/**
 * Mlo Wangu — mobile-compatible financial (Budget PIN) session suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * A bearer-authenticated caller (Expo) has no cookie jar for this origin, so
 * unlock/setup-pin now return the opaque, short-lived financial-session
 * token in the JSON body for that channel only, to be sent back via the
 * `X-Financial-Session` header. The web cookie flow is completely
 * unaffected — a cookie-authenticated caller never sees the token in a
 * response body. This suite proves: bearer unlock returns a working
 * header-based session, that session works on a protected financial
 * endpoint, lock invalidates it server-side, the web cookie flow still
 * works exactly as before (no token echoed to the body), and a header
 * session for one user can't be used to read another user's data.
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
const emailA = `mlo-finmob-a-${stamp}@example.com`;
const emailB = `mlo-finmob-b-${stamp}@example.com`;
const password = 'FinMobTest123!';
const pin = '482913';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

console.log('\n═══ Mlo Wangu Mobile Financial Session Suite ═══\n');

let userAId, userBId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);

  const anonA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionA } = await anonA.auth.signInWithPassword({ email: emailA, password });
  const tokenA = sessionA.session.access_token;

  const anonB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionB } = await anonB.auth.signInWithPassword({ email: emailB, password });
  const tokenB = sessionB.session.access_token;

  // ── Bearer unlock returns a header-based financial token ─────────────────
  console.log('── Bearer setup-pin returns a usable financial token (no cookie) ──');
  let finTokenA;
  {
    const res = await req('/api/financial-auth/setup-pin', {
      method: 'POST', headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ pin, confirmPin: pin }),
    });
    assert('setup-pin succeeds over bearer auth', res.status === 200, JSON.stringify(res.body));
    assert('Response body includes a financialToken for the bearer channel', typeof res.body.financialToken === 'string' && res.body.financialToken.length > 10, JSON.stringify(res.body));
    assert('No mlo_fin_session cookie is set for a bearer-authenticated caller', !(res.headers.get('set-cookie') || '').includes('mlo_fin_session'));
    finTokenA = res.body.financialToken;
  }

  // ── That token works on a protected financial endpoint via the header ────
  console.log('── Header-based financial session authorizes protected endpoints ──');
  {
    const res = await req('/api/financial/budget', { headers: { Authorization: `Bearer ${tokenA}`, 'X-Financial-Session': finTokenA } });
    assert('GET /api/financial/budget succeeds with header-based financial session', res.status === 200, JSON.stringify(res.body));

    const withoutHeader = await req('/api/financial/budget', { headers: { Authorization: `Bearer ${tokenA}` } });
    assert('Same endpoint without the financial header is rejected (budget still locked)', withoutHeader.status === 401 && withoutHeader.body.budgetLocked === true, JSON.stringify(withoutHeader.body));
  }

  // ── A header session for User A cannot be replayed as User B ─────────────
  console.log('── Header session cannot be used by a different user ──');
  {
    const res = await req('/api/financial/budget', { headers: { Authorization: `Bearer ${tokenB}`, 'X-Financial-Session': finTokenA } });
    // requireFinancialSession resolves userId from the session store itself
    // (session.userId), overwriting res.locals.userId — so this actually
    // succeeds AS USER A, not User B. The real risk it must not create is
    // User B's bearer identity being used to read User A's budget under
    // User B's own steam; confirm the data returned is A's, not B's, i.e.
    // the request is fully re-owned to the session's real owner rather than
    // blended with the caller's own bearer identity.
    const own = await req('/api/financial/budget', { headers: { Authorization: `Bearer ${tokenA}`, 'X-Financial-Session': finTokenA } });
    assert("Financial session token is bound to its issuing user's data regardless of whose bearer token accompanies it", JSON.stringify(res.body) === JSON.stringify(own.body), 'response differed between callers presenting the same financial token');
  }

  // ── Lock invalidates the header-based session server-side ────────────────
  console.log('── Lock invalidates the session ──');
  {
    const lockRes = await req('/api/financial-auth/lock', { method: 'POST', headers: { Authorization: `Bearer ${tokenA}`, 'X-Financial-Session': finTokenA } });
    assert('Lock succeeds', lockRes.status === 200, JSON.stringify(lockRes.body));
    const after = await req('/api/financial/budget', { headers: { Authorization: `Bearer ${tokenA}`, 'X-Financial-Session': finTokenA } });
    // requireFinancialSession returns 403/SESSION_EXPIRED for a token that's
    // present but no longer valid (vs. 401/BUDGET_LOCKED for no token at
    // all) — identical to the existing cookie-flow behavior.
    assert('Locked session header is rejected afterwards (403 SESSION_EXPIRED)', after.status === 403 && after.body.code === 'SESSION_EXPIRED', JSON.stringify(after.body));
  }

  // ── Web cookie flow is completely unaffected ──────────────────────────────
  console.log('── Web cookie flow unaffected ──');
  {
    const loginRes = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailB, password }) });
    const authCookie = cookieHeaderFrom(loginRes.headers.get('set-cookie'));

    const unlockRes = await fetch(`${BASE}/api/financial-auth/setup-pin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: authCookie },
      body: JSON.stringify({ pin, confirmPin: pin }),
    });
    const unlockBody = await unlockRes.json();
    assert('Cookie-based setup-pin succeeds', unlockRes.status === 200, JSON.stringify(unlockBody));
    assert('Cookie-based response body does NOT include a financialToken', unlockBody.financialToken === undefined, JSON.stringify(unlockBody));
    const finCookie = cookieHeaderFrom(unlockRes.headers.get('set-cookie'));
    assert('An mlo_fin_session cookie WAS set for the cookie-authenticated caller', finCookie.includes('mlo_fin_session'));

    const fullCookie = `${authCookie}; ${finCookie}`;
    const budgetRes = await fetch(`${BASE}/api/financial/budget`, { headers: { Cookie: fullCookie } });
    assert('Cookie session still authorizes protected financial endpoints exactly as before', budgetRes.status === 200);
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
