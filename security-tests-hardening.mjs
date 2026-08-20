/**
 * Mlo Wangu — Production Hardening Test Suite (Priorities 2, 5, 7, 9, 11 subset)
 * Runs against whichever server is currently up on :3000, in EITHER mode.
 *
 * IMPORTANT: in JSON dev mode (USE_JSON_DB=true), requireAuth intentionally
 * auto-authenticates every request as the demo user — this is a documented
 * local-dev convenience (server/auth-middleware.ts), not a vulnerability, and
 * it means "no cookie -> 401" cannot be observed for requireAuth-gated routes
 * in this mode. Those specific checks are skipped here and instead covered
 * live against real Supabase in security-tests-supabase-live.mjs, which is
 * also where real cross-user and real role-based (403->200) checks live,
 * since JSON mode only ever has one identity (the demo user) available.
 */
const BASE = 'http://localhost:3000';
let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  let body;
  try { body = await res.json(); } catch { body = {}; }
  return { status: res.status, body, headers: res.headers };
}

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ name, pass: true });
    console.log(`  ✅  ${name}`);
  } else {
    failed++;
    results.push({ name, pass: false, detail });
    console.log(`  ❌  ${name}${detail ? `\n      → ${detail}` : ''}`);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`  ⚠️  SKIP  ${name} (${reason})`);
}

async function loginCookie() {
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  const cookies = login.headers.get('set-cookie') || '';
  return cookies.split(',').map((c) => c.split(';')[0]).join('; ');
}

console.log('\n═══ Mlo Wangu Hardening Suite ═══\n');

// Detect mode: unauthenticated /api/admin/stats is 401 in Supabase mode
// (requireAuth genuinely rejects), 403 in JSON mode (auto-demo-auth, then
// requireAdmin rejects the non-admin demo user).
const modeProbe = await req('/api/admin/stats');
const isJsonMode = modeProbe.status === 403;
console.log(`Detected mode: ${isJsonMode ? 'JSON (dev)' : 'Supabase (production)'}\n`);

// ── 1. Security headers (Priority 9) ─────────────────────────────────────
console.log('── 1. Security Headers ──');
{
  const r = await req('/api/food/items');
  assert('CSP header present', r.headers.has('content-security-policy'));
  assert('X-Content-Type-Options: nosniff', r.headers.get('x-content-type-options') === 'nosniff');
  assert('Referrer-Policy present', !!r.headers.get('referrer-policy'));
  assert('X-Frame-Options / frame-ancestors set', r.headers.has('x-frame-options') || (r.headers.get('content-security-policy') || '').includes('frame-ancestors'));
  assert('X-Powered-By suppressed', !r.headers.has('x-powered-by'));
}

// ── 2. Attack #1: No authentication ──────────────────────────────────────
console.log('\n── 2. Attack: No Authentication ──');
{
  // requireFinancialSession is cookie-gated regardless of DB mode — always testable.
  const r = await req('/api/financial/budget');
  assert('/api/financial/budget with no auth → 401', r.status === 401, `got ${r.status}`);

  const rAdmin = await req('/api/admin/stats');
  if (isJsonMode) {
    assert('/api/admin/stats with no cookie → 403 (JSON auto-auth as non-admin demo user)', rAdmin.status === 403, `got ${rAdmin.status}`);
  } else {
    assert('/api/admin/stats with no auth → 401', rAdmin.status === 401, `got ${rAdmin.status}`);
    for (const ep of ['/api/household', '/api/meal-plans/current', '/api/notifications']) {
      const r2 = await req(ep);
      assert(`${ep} with no auth → 401`, r2.status === 401, `got ${r2.status}`);
    }
  }
}

// ── 3. Attack #2/#3: forged userId / x-user-id header ────────────────────
console.log('\n── 3. Attack: Forged Identity (body userId / x-user-id header) ──');
{
  const cookieHeader = await loginCookie();
  const r = await req('/api/household', { headers: { Cookie: cookieHeader, 'x-user-id': 'usr_someone_else_entirely' } });
  const ownerId = r.body?.household?.ownerId;
  assert(
    'x-user-id header is ignored — household ownerId reflects the real session, never the header',
    r.status === 200 && ownerId !== 'usr_someone_else_entirely',
    `status=${r.status} ownerId=${ownerId}`
  );
}

// ── 4. Attack #4/#5: forged financial session / forged PIN unlock ───────
console.log('\n── 4. Attack: Forged Financial Session / PIN ──');
{
  const r1 = await req('/api/financial/budget', { headers: { Cookie: 'mlo_fin_session=fin_totally_made_up_token' } });
  assert('Forged financial session token → 401/403, not 200', [401, 403].includes(r1.status), `got ${r1.status}`);

  const r2 = await req('/api/financial-auth/unlock', { method: 'POST', body: JSON.stringify({ pin: '000001' }) });
  if (isJsonMode) {
    assert('Unlock with no real cookie never returns success (JSON auto-auth still enforces PIN/lockout)', r2.status !== 200, `got ${r2.status}`);
  } else {
    assert('Unlock with no auth cookie at all → 401 (never even reaches PIN check)', r2.status === 401, `got ${r2.status}`);
  }
}

// ── 5. Malformed / expired auth (Priority 11 #17, #19) ───────────────────
console.log('\n── 5. Attack: Malformed JWT / Expired Auth ──');
{
  if (isJsonMode) {
    skip('Malformed JWT / expired auth', 'JSON mode never verifies a JWT — covered live against real Supabase');
  } else {
    const r1 = await req('/api/auth/me', { headers: { Cookie: 'mlo_auth_session=not.a.jwt' } });
    assert('Malformed JWT cookie → 401', r1.status === 401, `got ${r1.status}`);
    const r2 = await req('/api/auth/me', { headers: { Cookie: 'mlo_auth_session=' } });
    assert('Empty session cookie → 401', r2.status === 401, `got ${r2.status}`);
  }
}

// ── 6. Fake Premium / fake payment success (Priority 11 #13/#14) ─────────
console.log('\n── 6. Attack: Fake Premium / Fake Payment Success ──');
{
  const cookieHeader = await loginCookie();
  const withHeader = await req('/api/subscription/status', { headers: { Cookie: cookieHeader, 'x-premium': 'true' } });
  const withoutHeader = await req('/api/subscription/status', { headers: { Cookie: cookieHeader } });
  assert(
    'subscription/status ignores x-premium header — identical result with/without it',
    withHeader.status === 200 && withHeader.body.isPremium === withoutHeader.body.isPremium,
    `withHeader=${withHeader.body.isPremium} withoutHeader=${withoutHeader.body.isPremium}`
  );

  // The old client-driven "verify" endpoint (which just trusted whatever the
  // frontend claimed) was removed entirely when real Daraja integration
  // replaced the simulated payment system — Premium now only ever activates
  // from a real, amount-verified Safaricom callback. Full coverage of that
  // flow (amount tampering, fake/duplicate callbacks, idempotency, renewal,
  // expiry, RLS) lives in security-tests-mpesa.mjs.
  const rVerify = await req('/api/payments/mpesa/verify', { method: 'POST', headers: { Cookie: cookieHeader }, body: JSON.stringify({}) });
  assert('Old client-trusted verify endpoint no longer exists', rVerify.status === 404, `got ${rVerify.status}`);
}

// ── 7. Admin authorization (Priority 4) ───────────────────────────────────
console.log('\n── 7. Admin Authorization (403 path) ──');
{
  const cookieHeader = await loginCookie();
  const r1 = await req('/api/admin/stats', { headers: { Cookie: cookieHeader } });
  assert('Admin route, authenticated non-admin → 403', r1.status === 403, `got ${r1.status}`);
  if (isJsonMode) {
    skip('Admin route, authenticated ADMIN → 200', 'JSON mode has only one identity and no live role-promotion path (would require a server restart to see an on-disk edit) — covered live against real Supabase');
  }
}

// ── 8. Custom meal ownership boundary (Priority 5) ────────────────────────
console.log('\n── 8. Custom Meal Ownership (single-identity boundary) ──');
{
  const cookieHeader = await loginCookie();
  const create = await req('/api/meals', { method: 'POST', headers: { Cookie: cookieHeader }, body: JSON.stringify({ name: 'Hardening Test Meal', category: 'dinner' }) });
  assert('Authenticated user can create a custom meal', create.status === 201, `got ${create.status}`);
  if (create.status === 201) {
    assert('Created meal is stamped with server-derived ownerId, not client-supplied', !!create.body?.meal?.ownerId);

    const del = await req(`/api/meals/${create.body.meal.id}`, { method: 'DELETE', headers: { Cookie: cookieHeader } });
    assert('Owner can delete their own custom meal', del.status === 200, `got ${del.status}`);
  }

  const items = await req('/api/meals');
  const systemMeal = items.body.meals.find((m) => !m.ownerId);
  if (systemMeal) {
    const delSystem = await req(`/api/meals/${systemMeal.id}`, { method: 'DELETE', headers: { Cookie: cookieHeader } });
    assert('System (catalog) meal cannot be deleted via the ownership route', delSystem.status === 404, `got ${delSystem.status}`);
  }

  const createNoAuth = await req('/api/meals', { method: 'POST', body: JSON.stringify({ name: 'Should Fail', category: 'dinner' }) });
  if (isJsonMode) {
    skip('Creating a custom meal with no auth → 401', 'JSON mode auto-authenticates every request as the demo user by design');
  } else {
    assert('Creating a custom meal with no auth → 401', createNoAuth.status === 401, `got ${createNoAuth.status}`);
  }
}

// ── 9. Rate limiting (Priority 2) — run LAST, exhausts the limiter windows ─
console.log('\n── 9. Rate Limiting (exhausts limiter windows — run last) ──');
{
  if (isJsonMode) {
    skip('Login limiter returns 429 after threshold', 'JSON dev-mode login always succeeds (200) regardless of credentials, and skipSuccessfulRequests means 200s never count — the limiter is real but untestable against the dev-mode stub. Covered live against real Supabase with genuinely wrong passwords.');
  } else {
    let got429 = false;
    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const r = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nobody@example.com', password: 'wrongpassword' }) });
      lastStatus = r.status;
      if (r.status === 429) { got429 = true; break; }
    }
    assert('Login limiter returns 429 after threshold (brute-force login, attack #16)', got429, `last status seen: ${lastStatus}`);
  }

  const cookieHeader = await loginCookie();
  let got429Pin = false;
  for (let i = 0; i < 12; i++) {
    const r = await req('/api/financial-auth/unlock', { method: 'POST', headers: { Cookie: cookieHeader }, body: JSON.stringify({ pin: '000000' }) });
    if (r.status === 429) { got429Pin = true; break; }
  }
  assert('PIN unlock brute force blocked with 429 (account lockout and/or IP limiter, attack #15)', got429Pin);
}

console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped out of ${passed + failed + skipped} total`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
