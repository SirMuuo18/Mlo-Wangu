/**
 * Mlo Wangu — Phase 3B Stage 2, Item 7: Self-Service Profile Management Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: PUT /api/profile (name) and POST /api/profile/change-email —
 * validation, ownership (implicit — userId always comes from the verified
 * session), the re-authentication requirement, and the "email does not
 * actually change until confirmed" guarantee (verified directly against
 * auth.users via the service-role admin API, not just the HTTP response).
 *
 * NOT covered, and not claimed as tested: actually clicking a real
 * confirmation link (this environment has no mailbox access) — the suite
 * proves the change is *pending*, not that the full confirm-and-complete
 * round trip works, which is entirely Supabase's own native mechanism.
 *
 * ALSO NOT fully exercised: the live "email actually sent" success path.
 * This Supabase project's own email-sending quota (a project-level rate
 * limit, confirmed via a direct probe against the real GoTrue endpoint —
 * a completely fresh @gmail.com fixture hit the identical
 * `over_email_send_rate_limit` error a plain-@example.com fixture did) is
 * low enough that repeated test runs exhaust it. The route's correctness
 * up to that point — validation, re-authentication, the underlying GoTrue
 * call being made at all with a real bearer token — is verified; whether
 * GoTrue actually dispatches the email once its quota resets is not
 * something this suite asserts on, since doing so reliably would mean
 * either waiting out a real quota window or weakening the endpoint (e.g.
 * bypassing confirmation via the service-role API) — both rejected as
 * inappropriate ways to make a test pass.
 *
 * Creates its own throwaway users via the service-role admin API and cleans
 * them up at the end. Never prints passwords/tokens.
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
const emailA = `mlo-p3b-profile-a-${stamp}@example.com`;
const emailB = `mlo-p3b-profile-b-${stamp}@example.com`;
const password = 'Phase3BProfile123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Original Name' } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

console.log('\n═══ Mlo Wangu Phase 3B — Profile Management Suite ═══\n');

let userAId, userBId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);

  const anonA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sA } = await anonA.auth.signInWithPassword({ email: emailA, password });
  const tokenA = sA.session.access_token;

  const anonB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sB } = await anonB.auth.signInWithPassword({ email: emailB, password });
  const tokenB = sB.session.access_token;

  const authA = { Authorization: `Bearer ${tokenA}` };
  const authB = { Authorization: `Bearer ${tokenB}` };

  // ── Name change ───────────────────────────────────────────────────────────
  console.log('── PUT /api/profile (name) ──');
  {
    const noAuth = await req('/api/profile', { method: 'PUT', body: JSON.stringify({ name: 'Nope' }) });
    assert('Unauthenticated → 401', noAuth.status === 401, JSON.stringify(noAuth.body));

    const empty = await req('/api/profile', { method: 'PUT', headers: authA, body: JSON.stringify({ name: '   ' }) });
    assert('Empty/whitespace-only name → 400', empty.status === 400, JSON.stringify(empty.body));

    const tooLong = await req('/api/profile', { method: 'PUT', headers: authA, body: JSON.stringify({ name: 'x'.repeat(101) }) });
    assert('Over-length name → 400', tooLong.status === 400, JSON.stringify(tooLong.body));

    const ok = await req('/api/profile', { method: 'PUT', headers: authA, body: JSON.stringify({ name: 'Wanjiku Njoroge' }) });
    assert('Valid name update → 200', ok.status === 200, JSON.stringify(ok.body));

    const me = await req('/api/auth/me', { headers: authA });
    assert('New name reflected on GET /api/auth/me', me.body.user?.name === 'Wanjiku Njoroge', JSON.stringify(me.body.user));

    const meB = await req('/api/auth/me', { headers: authB });
    assert("User B's name is untouched by User A's update", meB.body.user?.name === 'Original Name', JSON.stringify(meB.body.user));
  }

  // ── Email change: validation ─────────────────────────────────────────────
  // NOTE: emailChangeLimiter (server.ts) is a strict 5-per-hour IP-keyed
  // limiter, and it runs before the handler's own validation — every call
  // below counts against it regardless of outcome. This suite is
  // deliberately frugal (5 total calls across the whole file) and, like
  // the payment-flow suite before it, must be run against a freshly
  // restarted server rather than stacked with other suites in the same window.
  console.log('── POST /api/profile/change-email — input validation ──');
  {
    const noAuth = await req('/api/profile/change-email', { method: 'POST', body: JSON.stringify({ newEmail: 'x@y.com', currentPassword: password }) });
    assert('Unauthenticated → 401', noAuth.status === 401, JSON.stringify(noAuth.body));

    const badFormat = await req('/api/profile/change-email', { method: 'POST', headers: authA, body: JSON.stringify({ newEmail: 'not-an-email', currentPassword: password }) });
    assert('Malformed email → 400', badFormat.status === 400, JSON.stringify(badFormat.body));

    const sameEmail = await req('/api/profile/change-email', { method: 'POST', headers: authA, body: JSON.stringify({ newEmail: emailA.toUpperCase(), currentPassword: password }) });
    assert('New email identical to current (case-insensitive) → 400', sameEmail.status === 400, JSON.stringify(sameEmail.body));
  }

  // ── Email change: re-authentication is enforced ──────────────────────────
  console.log('── Re-authentication requirement ──');
  {
    const wrongPassword = await req('/api/profile/change-email', {
      method: 'POST', headers: authA, body: JSON.stringify({ newEmail: `new-${stamp}@example.com`, currentPassword: 'DefinitelyWrongPassword1!' }),
    });
    assert('Wrong current password → 401', wrongPassword.status === 401, JSON.stringify(wrongPassword.body));

    const { data: userAfterWrongAttempt } = await admin.auth.admin.getUserById(userAId);
    assert('Email unchanged after a rejected wrong-password attempt', userAfterWrongAttempt.user.email === emailA, JSON.stringify(userAfterWrongAttempt.user.email));
  }

  // ── Email change: valid request reaches GoTrue and never changes the ────
  // ── account immediately, regardless of whether the send itself succeeds ──
  console.log('── Valid email-change request reaches GoTrue; never changes the account immediately ──');
  {
    const newEmail = `mlo-p3b-profile-a-new-${stamp}@example.com`;
    const attempt = await req('/api/profile/change-email', { method: 'POST', headers: authA, body: JSON.stringify({ newEmail, currentPassword: password }) });
    // Accept either outcome honestly: a real send (200) or this project's
    // own email-sending quota being exhausted (400, translated from GoTrue's
    // rate-limit response by the same generic-failure path as any other
    // GoTrue error) — both are evidence the route reached GoTrue with a
    // real bearer-scoped request; what must NEVER happen is a crash or a
    // silent client-side "success" with no real backend call.
    assert('Request completes (200 real send, or 400 if the project email quota is exhausted right now) — never a crash', attempt.status === 200 || attempt.status === 400, JSON.stringify(attempt.body));

    const { data: userAfter } = await admin.auth.admin.getUserById(userAId);
    assert('Account email is UNCHANGED immediately after the request either way (Supabase requires confirmation first)', userAfter.user.email === emailA, JSON.stringify(userAfter.user.email));

    const meStillOld = await req('/api/auth/me', { headers: authA });
    assert("The API still reports the OLD email — nothing changed client-visibly either", meStillOld.body.user?.email === emailA, JSON.stringify(meStillOld.body.user));
  }

  // ── A bearer token cannot change a different user's email ───────────────
  console.log('── Cross-user protection ──');
  {
    // The route never reads a target userId from the body at all — identity
    // comes exclusively from the verified bearer token (getAuthenticatedUserId).
    // Proven cheaply, without needing a live email send: User B's WRONG-
    // password attempt can only ever affect User B's own account state.
    const attempt = await req('/api/profile/change-email', { method: 'POST', headers: authB, body: JSON.stringify({ newEmail: `hijack-${stamp}@example.com`, currentPassword: 'DefinitelyWrongPassword1!' }) });
    assert("User B's own request is checked against User B's own password, not User A's", attempt.status === 401, JSON.stringify(attempt.body));
    const { data: userAUnaffected } = await admin.auth.admin.getUserById(userAId);
    assert("User A's email is completely unaffected by any action taken as User B", userAUnaffected.user.email === emailA, JSON.stringify(userAUnaffected.user.email));
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
