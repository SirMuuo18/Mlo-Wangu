/**
 * Mlo Wangu — Admin & Customer Support Console Attack + Functionality Suite
 * Requires the server running against a REAL Supabase project (USE_JSON_DB=false).
 *
 * Covers section 18 of the admin-console spec: admin access bypass attempts
 * on every new route, user search/pagination isolation, password-reset
 * support (never sees/stores the password), payment support (server stays
 * authoritative), access-code support (7-day expiry still enforced, no
 * bypass), and audit logging (real, server-only, no secrets).
 *
 * NOTE: several assertions below depend on migrations 0003
 * (cap_access_code_expiry) and 0004 (profiles.email, support_notes,
 * admin_audit_log) already being applied to the target Supabase project.
 * If they are not applied yet, the affected assertions will fail with a
 * 503/"column does not exist" style error — that is an accurate signal the
 * migration is outstanding, not a code defect. See the final report for
 * which specific assertions that applies to.
 *
 * Creates its own throwaway users via the service-role admin API and cleans
 * them up at the end. Never prints keys/tokens/passwords/access codes.
 */
import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

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
const adminEmail = `mlo-console-admin-${stamp}@example.com`;
const normalEmail = `mlo-console-user-${stamp}@example.com`;
const targetEmail = `mlo-console-target-${stamp}@example.com`;
const password = 'ConsoleTest123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return cookieHeaderFrom(res.headers.get('set-cookie'));
}

const ADMIN_ROUTES = [
  { method: 'GET', path: '/api/admin/dashboard' },
  { method: 'GET', path: '/api/admin/users?query=test' },
  { method: 'GET', path: '/api/admin/payments' },
  { method: 'GET', path: '/api/admin/access-codes' },
  { method: 'GET', path: '/api/admin/audit-log' },
  { method: 'GET', path: '/api/admin/support-notes' },
];

console.log('\n═══ Mlo Wangu Admin & Customer Support Console Suite ═══\n');

let adminId, normalId, targetId;
try {
  adminId = await createConfirmedUser(adminEmail);
  normalId = await createConfirmedUser(normalEmail);
  targetId = await createConfirmedUser(targetEmail);
  const adminCookie = await login(adminEmail);
  const normalCookie = await login(normalEmail);
  await admin.from('profiles').update({ role: 'admin' }).eq('id', adminId);

  // ── ADMIN ACCESS ─────────────────────────────────────────────────────────
  console.log('── Admin access: unauthenticated / normal user / admin, on every new route ──');
  for (const r of ADMIN_ROUTES) {
    const unauth = await req(r.path, { method: r.method });
    assert(`${r.method} ${r.path} unauthenticated → 401`, unauth.status === 401, `got ${unauth.status}`);

    const asUser = await req(r.path, { method: r.method, headers: { Cookie: normalCookie } });
    assert(`${r.method} ${r.path} normal user → 403`, asUser.status === 403, `got ${asUser.status}`);

    const asAdmin = await req(r.path, { method: r.method, headers: { Cookie: adminCookie } });
    assert(`${r.method} ${r.path} admin → 200`, asAdmin.status === 200, `got ${asAdmin.status} ${JSON.stringify(asAdmin.body).slice(0, 150)}`);
  }

  console.log('── Bypass attempts on a representative new route ──');
  {
    const bypasses = [
      { label: '?admin=true', path: '/api/admin/dashboard?admin=true' },
      { label: '?role=admin', path: '/api/admin/dashboard?role=admin' },
      { label: '?isAdmin=true', path: '/api/admin/dashboard?isAdmin=true' },
      { label: `?userId=${adminId}`, path: `/api/admin/dashboard?userId=${adminId}` },
    ];
    for (const b of bypasses) {
      const r = await req(b.path, { headers: { Cookie: normalCookie } });
      assert(`GET /api/admin/dashboard with ${b.label} as normal user still → 403`, r.status === 403, `got ${r.status}`);
    }
    const headerBypasses = [
      { 'x-admin': 'true' }, { 'x-is-admin': 'true' }, { 'x-user-role': 'admin' }, { 'x-user-id': adminId },
    ];
    for (const h of headerBypasses) {
      const r = await req('/api/admin/dashboard', { headers: { Cookie: normalCookie, ...h } });
      assert(`GET /api/admin/dashboard with header ${JSON.stringify(h)} still → 403`, r.status === 403, `got ${r.status}`);
    }
    const bodyBypass = await req('/api/admin/payments/fake-id/confirm', { method: 'POST', headers: { Cookie: normalCookie }, body: JSON.stringify({ role: 'admin', isAdmin: true, userId: adminId }) });
    assert('POST admin mutation route with forged role/isAdmin/userId body fields as normal user → 403', bodyBypass.status === 403, `got ${bodyBypass.status}`);
  }

  // ── USERS ────────────────────────────────────────────────────────────────
  console.log('── Users: search, pagination, isolation ──');
  {
    const asUser = await req('/api/admin/users?query=a', { headers: { Cookie: normalCookie } });
    assert('Normal user cannot call user-search API → 403', asUser.status === 403, `got ${asUser.status}`);

    const search = await req(`/api/admin/users?query=${encodeURIComponent(targetEmail)}`, { headers: { Cookie: adminCookie } });
    if (search.status === 200) {
      const found = (search.body.users || []).some((u) => u.id === targetId);
      assert('Admin can search users by email and find the target user', found, JSON.stringify(search.body).slice(0, 200));
      assert('User search response has pagination fields', typeof search.body.total === 'number' && typeof search.body.page === 'number', JSON.stringify(search.body));
    } else {
      assert('Admin user search by email (BLOCKED — see migration note)', false, `status=${search.status} body=${JSON.stringify(search.body)}`);
    }

    const detailAsUser = await req(`/api/admin/users/${targetId}`, { headers: { Cookie: normalCookie } });
    assert('Normal user cannot call user-detail API → 403', detailAsUser.status === 403, `got ${detailAsUser.status}`);

    const detail = await req(`/api/admin/users/${targetId}`, { headers: { Cookie: adminCookie } });
    if (detail.status === 200) {
      const leaksFinancials = JSON.stringify(detail.body).match(/income|rent|savings|monthlyIncomeKsh|budgetPin|pinHash|pin_hash/i);
      assert('User detail never includes income/rent/savings/PIN fields', !leaksFinancials, JSON.stringify(leaksFinancials));
    }
  }

  // ── PASSWORD RESET SUPPORT ──────────────────────────────────────────────
  console.log('── Password reset support ──');
  {
    const asUser = await req(`/api/admin/users/${targetId}/send-password-reset`, { method: 'POST', headers: { Cookie: normalCookie } });
    assert('Normal user cannot trigger admin password-reset endpoint → 403', asUser.status === 403, `got ${asUser.status}`);

    const asAdmin = await req(`/api/admin/users/${targetId}/send-password-reset`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('Admin can request password reset → 200', asAdmin.status === 200, `got ${asAdmin.status} ${JSON.stringify(asAdmin.body)}`);
    assert('Password reset response never contains a password field', !JSON.stringify(asAdmin.body).match(/password"\s*:\s*"(?!.*sent)/i));
    assert('Password reset response message is the generic confirmation', asAdmin.body.message === 'Password reset email sent.' || asAdmin.status !== 200);
  }

  // ── PAYMENTS ─────────────────────────────────────────────────────────────
  console.log('── Payment support ──');
  {
    const asUser = await req('/api/admin/payments', { headers: { Cookie: normalCookie } });
    assert('Normal user cannot access admin payment endpoints → 403', asUser.status === 403, `got ${asUser.status}`);

    const checkoutId = `console_${stamp}`;
    const { data: pay, error: payErr } = await admin.from('payments').insert({
      user_id: targetId, amount_ksh: 50, phone_number: '254712345678',
      plan_type: 'meal_plan_generation', checkout_request_id: checkoutId, merchant_request_id: `mr_${checkoutId}`,
      status: 'pending',
    }).select('*').single();
    if (payErr) throw new Error(`seed payment failed: ${payErr.message}`);

    const asUserConfirm = await req(`/api/admin/payments/${pay.id}/confirm`, { method: 'POST', headers: { Cookie: normalCookie } });
    assert('Normal user cannot confirm a payment → 403', asUserConfirm.status === 403, `got ${asUserConfirm.status}`);

    const confirmed = await req(`/api/admin/payments/${pay.id}/confirm`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('Admin can confirm a pending payment → 200', confirmed.status === 200, `got ${confirmed.status} ${JSON.stringify(confirmed.body)}`);

    const { data: row } = await admin.from('payments').select('status').eq('id', pay.id).single();
    assert('Confirmed payment is now status=success in the database', row?.status === 'success', JSON.stringify(row));

    const { data: ent } = await admin.from('meal_plan_entitlements').select('id').eq('payment_id', pay.id).maybeSingle();
    assert('Admin confirmation created an entitlement (same path as a real callback)', !!ent, JSON.stringify(ent));

    const doubleConfirm = await req(`/api/admin/payments/${pay.id}/confirm`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert('Confirming an already-confirmed payment is rejected, not double-processed → 409', doubleConfirm.status === 409, `got ${doubleConfirm.status}`);

    const tamperConfirm = await req(`/api/admin/payments/${pay.id}/confirm`, {
      method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ amountKsh: 1, userId: normalId, status: 'success' }),
    });
    assert('Client body fields (amount/user/status) cannot influence an already-processed confirm', tamperConfirm.status === 409, `got ${tamperConfirm.status}`);
  }

  // ── ACCESS CODES ─────────────────────────────────────────────────────────
  console.log('── Access code support: 7-day expiry stays enforced ──');
  {
    const asUser = await req('/api/admin/access-codes', { headers: { Cookie: normalCookie } });
    assert('Normal user cannot access admin code-management endpoints → 403', asUser.status === 403, `got ${asUser.status}`);

    const asUserIssue = await req('/api/admin/access-codes/issue', { method: 'POST', headers: { Cookie: normalCookie }, body: JSON.stringify({ userId: normalId }) });
    assert('Normal user cannot issue an access code → 403', asUserIssue.status === 403, `got ${asUserIssue.status}`);

    const issued = await req('/api/admin/access-codes/issue', { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ userId: targetId, description: 'test code' }) });
    if (issued.status === 200) {
      assert('Admin-issued code is returned in plaintext exactly once', typeof issued.body.code === 'string' && issued.body.code.startsWith('MLOW-'), JSON.stringify(issued.body));
      const { data: row } = await admin.from('meal_plan_access_codes').select('created_at, expires_at, code_hash').eq('id', issued.body.accessCodeId).single();
      assert('Issued code is stored only as a hash, never plaintext', row && row.code_hash && row.code_hash.length === 64 && !row.code_hash.includes(issued.body.code));
      if (row?.expires_at) {
        const delta = new Date(row.expires_at).getTime() - new Date(row.created_at).getTime();
        assert('Admin-issued code still gets exactly the 7-day expiry (database trigger, not this endpoint)', Math.abs(delta - 7 * 24 * 60 * 60 * 1000) < 5000, `delta=${delta}ms`);
      } else {
        assert('Admin-issued code has a bounded expires_at (BLOCKED — see migration note)', false, 'expires_at is null: migration 0003 not applied to this database');
      }

      const asAdminList = await req('/api/admin/access-codes?status=ACTIVE', { headers: { Cookie: adminCookie } });
      assert('Admin can view code status list', asAdminList.status === 200, JSON.stringify(asAdminList.body).slice(0, 150));
      const respText = JSON.stringify(asAdminList.body);
      assert('Access code list response never includes a code hash', !/[0-9a-f]{64}/.test(respText));

      // A client cannot bypass expiry by asking the redeem endpoint to trust a
      // forged expiry — same guarantee proven in security-tests-meal-plan-gate.mjs;
      // re-verified here specifically for an admin-issued code.
      const oldCode = `OLD-CONSOLE-${stamp}`;
      const codeHash = sha256(oldCode.trim().toUpperCase());
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from('meal_plan_access_codes').insert({ code_hash: codeHash, user_id: targetId, active: true, max_uses: 1, used_count: 0, description: 'test code', created_at: eightDaysAgo });
      const redeemOld = await req('/api/meal-plans/generation/redeem-access-code', { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ code: oldCode }) });
      assert('An expired code (even one that looks admin-issued) still cannot be redeemed', redeemOld.status === 400);

      const cancelAsUser = await req(`/api/admin/access-codes/${issued.body.accessCodeId}/cancel`, { method: 'POST', headers: { Cookie: normalCookie } });
      assert('Normal user cannot cancel an access code → 403', cancelAsUser.status === 403, `got ${cancelAsUser.status}`);
      const cancelled = await req(`/api/admin/access-codes/${issued.body.accessCodeId}/cancel`, { method: 'POST', headers: { Cookie: adminCookie } });
      assert('Admin can cancel an active access code', cancelled.status === 200, JSON.stringify(cancelled.body));
    } else {
      assert('Admin can issue an access code (BLOCKED — see migration note)', false, `status=${issued.status} body=${JSON.stringify(issued.body)}`);
    }
  }

  // ── SUPPORT NOTES ────────────────────────────────────────────────────────
  console.log('── Support notes: per-user and cross-user queue ──');
  {
    const asUserCreate = await req('/api/admin/support-notes', { method: 'POST', headers: { Cookie: normalCookie }, body: JSON.stringify({ userId: targetId, issue: 'x' }) });
    assert('Normal user cannot create a support note → 403', asUserCreate.status === 403, `got ${asUserCreate.status}`);

    const created = await req('/api/admin/support-notes', {
      method: 'POST', headers: { Cookie: adminCookie },
      body: JSON.stringify({ userId: targetId, issue: 'User could not log in.', actionTaken: 'Sent password reset email.' }),
    });
    assert('Admin can create a support note for a user → 201', created.status === 201, JSON.stringify(created.body).slice(0, 200));

    if (created.status === 201) {
      const perUser = await req(`/api/admin/support-notes/${targetId}`, { headers: { Cookie: adminCookie } });
      assert('Per-user support notes list includes the new note', perUser.status === 200 && (perUser.body.notes || []).some((n) => n.id === created.body.note.id), JSON.stringify(perUser.body).slice(0, 200));

      const queue = await req('/api/admin/support-notes?resolved=false', { headers: { Cookie: adminCookie } });
      assert('Cross-user open-support queue includes the new (unresolved) note', queue.status === 200 && (queue.body.notes || []).some((n) => n.id === created.body.note.id), JSON.stringify(queue.body).slice(0, 200));

      const resolveAsUser = await req(`/api/admin/support-notes/${created.body.note.id}/resolve`, { method: 'POST', headers: { Cookie: normalCookie }, body: JSON.stringify({}) });
      assert('Normal user cannot resolve a support note → 403', resolveAsUser.status === 403, `got ${resolveAsUser.status}`);

      const resolved = await req(`/api/admin/support-notes/${created.body.note.id}/resolve`, { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ resolution: 'Resolved.' }) });
      assert('Admin can mark a support note resolved', resolved.status === 200 && resolved.body.note?.resolved === true, JSON.stringify(resolved.body).slice(0, 200));

      const queueAfter = await req('/api/admin/support-notes?resolved=false', { headers: { Cookie: adminCookie } });
      assert('Resolved note no longer appears in the open queue', queueAfter.status === 200 && !(queueAfter.body.notes || []).some((n) => n.id === created.body.note.id), JSON.stringify(queueAfter.body).slice(0, 200));
    }
  }

  // ── AUDIT ────────────────────────────────────────────────────────────────
  console.log('── Audit log ──');
  {
    const asUser = await req('/api/admin/audit-log', { headers: { Cookie: normalCookie } });
    assert('Normal user cannot read the audit log → 403', asUser.status === 403, `got ${asUser.status}`);

    const asUserWrite = await admin.from('admin_audit_log').select('id').limit(1);
    // Not a real write attempt (RLS has no client policies to test via anon
    // key here, matching meal_plan_access_codes' own pattern) — this just
    // confirms the table exists / migration applied, to interpret results below.
    const migrationApplied = !asUserWrite.error;

    const log = await req('/api/admin/audit-log', { headers: { Cookie: adminCookie } });
    if (log.status === 200) {
      const actions = (log.body.entries || []).map((e) => e.action);
      assert('Recent admin actions from this run were recorded in the audit log', actions.includes('PAYMENT_CONFIRMED') || actions.includes('PASSWORD_RESET_REQUESTED') || actions.includes('ACCESS_CODE_ISSUED') || actions.includes('SUPPORT_NOTE_CREATED'), JSON.stringify(actions).slice(0, 200));
      const respText = JSON.stringify(log.body);
      // Action *names* like PASSWORD_RESET_REQUESTED legitimately contain the
      // word "password" — that's an audit label, not a leaked secret. Check
      // for actual sensitive fields/values instead: a "password"/"pin" JSON
      // key, a stored pin/code hash field, or a raw 64-hex-char hash value.
      const hasSensitiveField = /"password"\s*:|"pin"\s*:|"pinHash"|"pin_hash"|"codeHash"|"code_hash"/i.test(respText);
      const hasRawHash = /\b[0-9a-f]{64}\b/i.test(respText);
      assert('Audit log never contains a password, PIN, or code hash', !hasSensitiveField && !hasRawHash, respText.slice(0, 300));
    } else {
      assert(`Admin audit log is queryable (BLOCKED — see migration note, table exists: ${migrationApplied})`, false, `status=${log.status} body=${JSON.stringify(log.body)}`);
    }
  }

} finally {
  if (adminId) await admin.auth.admin.deleteUser(adminId).catch(() => {});
  if (normalId) await admin.auth.admin.deleteUser(normalId).catch(() => {});
  if (targetId) await admin.auth.admin.deleteUser(targetId).catch(() => {});
  await admin.from('meal_plan_access_codes').delete().is('user_id', null).eq('description', 'test code');
}

console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
