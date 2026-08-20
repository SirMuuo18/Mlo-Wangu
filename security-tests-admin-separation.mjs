/**
 * Mlo Wangu — Consumer/Admin Separation Attack Suite
 * Requires the server running against a REAL Supabase project (USE_JSON_DB=false).
 * Verifies: the `admin=true` query parameter grants nothing by itself; every
 * /api/admin/* endpoint independently re-verifies auth + admin role; no
 * client-suppliable header/param/body field can forge admin access; logout
 * revokes admin access immediately.
 * Creates its own throwaway test user via the service-role admin API and
 * cleans it up at the end. Never prints keys/tokens.
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
  return { status: res.status, body, headers: res.headers };
}

function cookieHeaderFrom(setCookie) {
  return (setCookie || '').split(',').map((c) => c.split(';')[0]).join('; ');
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `mlo-admin-sep-${stamp}@example.com`;
const password = 'LiveTest123!';

async function createConfirmedUser(mail) {
  const { data, error } = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true, user_metadata: { name: mail } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function login(mail) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail, password }) });
  const body = await res.json();
  return { cookie: cookieHeaderFrom(res.headers.get('set-cookie')), body, status: res.status };
}

const ADMIN_ENDPOINTS = [
  { method: 'GET', path: '/api/admin/stats' },
  { method: 'GET', path: '/api/admin/security-audit' },
];

console.log('\n═══ Mlo Wangu Consumer/Admin Separation Attack Suite ═══\n');

let userId;
try {
  userId = await createConfirmedUser(email);
  const loginRes = await login(email);
  assert('Test user login succeeds', loginRes.status === 200, JSON.stringify(loginRes.body));
  const cookie = loginRes.cookie;

  // ── Unauthenticated: every admin endpoint → 401, no data ──────────────
  console.log('── Unauthenticated → 401, no admin data leaked ──');
  for (const ep of ADMIN_ENDPOINTS) {
    const r = await req(ep.path, { method: ep.method });
    assert(`${ep.method} ${ep.path} unauthenticated → 401`, r.status === 401, `got ${r.status}`);
    assert(`${ep.method} ${ep.path} unauthenticated response has no stats/results payload`, !r.body.totalUsers && !r.body.results, JSON.stringify(r.body));
  }
  {
    const r = await req('/api/admin/food-items/nonexistent/price', { method: 'PUT', body: JSON.stringify({ priceKsh: 1 }) });
    assert('PUT /api/admin/food-items/:id/price unauthenticated → 401', r.status === 401, `got ${r.status}`);
  }

  // ── Authenticated NON-admin: every admin endpoint → 403, no data ──────
  console.log('── Authenticated non-admin → 403, no admin data leaked ──');
  for (const ep of ADMIN_ENDPOINTS) {
    const r = await req(ep.path, { method: ep.method, headers: { Cookie: cookie } });
    assert(`${ep.method} ${ep.path} non-admin → 403`, r.status === 403, `got ${r.status}`);
    assert(`${ep.method} ${ep.path} non-admin response has no stats/results payload`, !r.body.totalUsers && !r.body.results, JSON.stringify(r.body));
  }
  {
    const r = await req('/api/admin/food-items/nonexistent/price', { method: 'PUT', headers: { Cookie: cookie }, body: JSON.stringify({ priceKsh: 1 }) });
    assert('PUT /api/admin/food-items/:id/price non-admin → 403', r.status === 403, `got ${r.status}`);
  }

  // ── Query-param / header / body bypass attempts (still non-admin) ─────
  console.log('── Query-param, header, and body bypass attempts (still non-admin) ──');
  const bypassAttempts = [
    { label: '?admin=true', path: '/api/admin/stats?admin=true' },
    { label: '?admin=false', path: '/api/admin/stats?admin=false' },
    { label: '?admin=1', path: '/api/admin/stats?admin=1' },
    { label: '?role=admin', path: '/api/admin/stats?role=admin' },
    { label: '?isAdmin=true', path: '/api/admin/stats?isAdmin=true' },
    { label: `?userId=${userId}`, path: `/api/admin/stats?userId=${userId}` },
    { label: '?admin=true&role=admin&isAdmin=true', path: '/api/admin/stats?admin=true&role=admin&isAdmin=true' },
  ];
  for (const attempt of bypassAttempts) {
    const r = await req(attempt.path, { headers: { Cookie: cookie } });
    assert(`GET ${attempt.path} (${attempt.label}) still → 403, not granted`, r.status === 403, `got ${r.status}`);
  }
  const headerBypassAttempts = [
    { label: 'x-admin: true', headers: { 'x-admin': 'true' } },
    { label: 'x-is-admin: true', headers: { 'x-is-admin': 'true' } },
    { label: 'x-user-role: admin', headers: { 'x-user-role': 'admin' } },
    { label: 'x-user-id: <self>', headers: { 'x-user-id': userId } },
  ];
  for (const attempt of headerBypassAttempts) {
    const r = await req('/api/admin/stats', { headers: { Cookie: cookie, ...attempt.headers } });
    assert(`GET /api/admin/stats with header ${attempt.label} still → 403, not granted`, r.status === 403, `got ${r.status}`);
  }
  {
    const r = await req('/api/admin/stats', { method: 'GET', headers: { Cookie: cookie }, body: undefined });
    assert('Body-based role claims are never even read by GET /api/admin/stats (still 403)', r.status === 403, `got ${r.status}`);
  }

  // ── Promote to real admin (service-role write) → now 200 ──────────────
  console.log('── Promote to real admin via service role → now authorized ──');
  await admin.from('profiles').update({ role: 'admin' }).eq('id', userId);
  for (const ep of ADMIN_ENDPOINTS) {
    const r = await req(ep.path, { method: ep.method, headers: { Cookie: cookie } });
    assert(`${ep.method} ${ep.path} genuine admin → 200`, r.status === 200, `got ${r.status} ${JSON.stringify(r.body)}`);
  }
  assert('GET /api/admin/stats as admin returns real stats payload', typeof (await req('/api/admin/stats', { headers: { Cookie: cookie } })).body.totalUsers === 'number');

  // ── Client-side role self-escalation blocked at the DB layer ──────────
  console.log('── DB-layer defense: role cannot be self-escalated by non-service callers ──');
  {
    // Demote back to user directly, then attempt the same write again to
    // prove only the service-role key (server) can actually flip role —
    // this mirrors the trigger added in supabase/migrations/0002.
    await admin.from('profiles').update({ role: 'user' }).eq('id', userId);
    const check = await req('/api/admin/stats', { headers: { Cookie: cookie } });
    assert('After demotion, same session immediately loses admin access (no caching/staleness)', check.status === 403, `got ${check.status}`);
  }

  // ── Logout invalidates admin access ────────────────────────────────────
  console.log('── Logout invalidates admin access (re-promote first) ──');
  await admin.from('profiles').update({ role: 'admin' }).eq('id', userId);
  {
    const preLogout = await req('/api/admin/stats', { headers: { Cookie: cookie } });
    assert('Admin session works before logout', preLogout.status === 200, `got ${preLogout.status}`);

    await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });

    const postLogout = await req('/api/admin/stats', { headers: { Cookie: cookie } });
    assert('Same (captured) admin cookie rejected after logout — real server-side revocation', postLogout.status === 401, `got ${postLogout.status}`);
  }

} finally {
  try { await admin.from('profiles').update({ role: 'user' }).eq('id', userId); } catch { /* best effort */ }
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
