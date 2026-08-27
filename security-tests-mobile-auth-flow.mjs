/**
 * Mlo Wangu — Expo Phase 1 authenticated flow proof.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * This does NOT run the React Native app (no device/simulator is available
 * in this environment) — it proves the actual protocol the Expo app's
 * lib/supabase.ts + lib/api.ts + context/AuthContext.tsx implement, using
 * the same @supabase/supabase-js client and the same Bearer-token contract,
 * against the real backend and real Supabase project:
 *
 *   Expo → Supabase Auth (anon key) → access token → Express API (Bearer)
 *
 * Covers: registration → sign-in, GET /api/auth/me identity + onboarding
 * state, POST /api/onboarding/complete → the flag flips server-side,
 * sign-out actually revoking the session (not just a local no-op), a
 * garbage/invalid Bearer token being rejected, and a simulated "app
 * relaunch" (a fresh Supabase client restoring a session from just the
 * access/refresh token pair, exactly what SecureStore restoration hands to
 * supabase-js on a real device).
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
async function callApi(path, { token, ...opts } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  let body; try { body = await res.json(); } catch { body = {}; }
  return { status: res.status, body };
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const stamp = Date.now();

console.log('\n═══ Mlo Wangu — Expo Phase 1: Authenticated Flow Proof ═══\n');

let registeredUserId, registeredEmail;
try {
  // ── Registration: same Express route the Expo RegisterScreen calls ──────
  console.log('── Registration (Expo → POST /api/auth/register, no Supabase Auth call) ──');
  registeredEmail = `mlo-mobile-p1-${stamp}@example.com`;
  const password = 'MobilePhase1Test!23';
  const regRes = await callApi('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: registeredEmail, password, name: 'Mobile Phase 1 Tester' }),
  });
  assert('Registration succeeds (201)', regRes.status === 201, JSON.stringify(regRes.body));

  // ── Sign-in: EXACTLY what lib/supabase.ts + AuthContext.login() do ──────
  console.log('── Sign-in via Supabase Auth directly (anon key) — same as AuthContext.login() ──');
  const mobileClient = createClient(anonUrl, anonKey, { auth: { persistSession: false } });
  const { data: signInData, error: signInErr } = await mobileClient.auth.signInWithPassword({ email: registeredEmail, password });
  assert('supabase.auth.signInWithPassword succeeds', !signInErr && !!signInData?.session, signInErr?.message);
  const accessToken = signInData?.session?.access_token;
  const refreshToken = signInData?.session?.refresh_token;
  registeredUserId = signInData?.user?.id;
  assert('A real access token was obtained', typeof accessToken === 'string' && accessToken.length > 20);

  // ── Bearer call to the existing Express API — EXACTLY what lib/api.ts does ──
  console.log('── GET /api/auth/me over Bearer (Expo API client contract) ──');
  const meRes = await callApi('/api/auth/me', { token: accessToken });
  assert('GET /api/auth/me succeeds over Bearer', meRes.status === 200, JSON.stringify(meRes.body));
  assert('Identity matches the signed-in user (not spoofable)', meRes.body.user?.id === registeredUserId, JSON.stringify(meRes.body));
  assert('Name from registration is present', meRes.body.user?.name === 'Mobile Phase 1 Tester', JSON.stringify(meRes.body));
  assert('onboardingComplete starts false for a brand-new account', meRes.body.user?.onboardingComplete === false, JSON.stringify(meRes.body));

  // ── Onboarding: the same real endpoint the placeholder screen calls ──────
  console.log('── POST /api/onboarding/complete (Expo onboarding placeholder screen) ──');
  const onboardRes = await callApi('/api/onboarding/complete', { method: 'POST', token: accessToken, body: JSON.stringify({}) });
  assert('Onboarding completion succeeds', onboardRes.status === 200, JSON.stringify(onboardRes.body));
  const meAfterOnboard = await callApi('/api/auth/me', { token: accessToken });
  assert('onboardingComplete is now true, read fresh from the server (not a local flag)', meAfterOnboard.body.user?.onboardingComplete === true, JSON.stringify(meAfterOnboard.body));

  // ── Simulated "app relaunch": a FRESH client restores the session from
  //     just the token pair — exactly what SecureStore hands back to
  //     supabase-js on a real device at startup. ─────────────────────────
  console.log('── Simulated relaunch: fresh client + setSession() from stored tokens ──');
  const relaunchClient = createClient(anonUrl, anonKey, { auth: { persistSession: false } });
  const { data: restored, error: restoreErr } = await relaunchClient.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  assert('A fresh client can restore the session from stored tokens', !restoreErr && !!restored?.session, restoreErr?.message);
  const { data: restoredSessionCheck } = await relaunchClient.auth.getSession();
  assert('getSession() on the restored client returns a valid session (what AuthContext checks on launch)', !!restoredSessionCheck?.session?.access_token);
  const meAfterRelaunch = await callApi('/api/auth/me', { token: restoredSessionCheck.session.access_token });
  assert('Restored session still authenticates against the real API', meAfterRelaunch.status === 200 && meAfterRelaunch.body.user?.id === registeredUserId, JSON.stringify(meAfterRelaunch.body));

  // ── Invalid/garbage Bearer token ──────────────────────────────────────
  console.log('── Invalid Bearer token ──');
  const garbageRes = await callApi('/api/auth/me', { token: 'not-a-real-token' });
  assert('Garbage Bearer token → 401', garbageRes.status === 401, JSON.stringify(garbageRes.body));

  // ── No credentials at all ─────────────────────────────────────────────
  console.log('── No credentials ──');
  const noAuthRes = await callApi('/api/auth/me');
  assert('No Authorization header at all → 401', noAuthRes.status === 401, JSON.stringify(noAuthRes.body));

  // ── Logout: supabase.auth.signOut() — NOT the Express logout endpoint ───
  console.log('── Logout via supabase.auth.signOut() (mirrors AuthContext.logout()) ──');
  const { error: signOutErr } = await mobileClient.auth.signOut();
  assert('signOut() call succeeds', !signOutErr, signOutErr?.message);
  // The whole point of using signOut() instead of the Express logout route:
  // it revokes the session server-side, so the OLD access token must now be
  // rejected — not just "forgotten" client-side.
  const meAfterLogout = await callApi('/api/auth/me', { token: accessToken });
  assert('The old access token is rejected after signOut() (session actually revoked server-side, not just a local no-op)', meAfterLogout.status === 401, JSON.stringify(meAfterLogout.body));
  // And the relaunch-restored session (same underlying refresh token lineage) is dead too.
  const meRestoredAfterLogout = await callApi('/api/auth/me', { token: restoredSessionCheck.session.access_token });
  assert('The relaunch-restored token is also rejected after signOut() (same account, fully revoked)', meRestoredAfterLogout.status === 401, JSON.stringify(meRestoredAfterLogout.body));
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (registeredUserId) await admin.auth.admin.deleteUser(registeredUserId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
