/**
 * Mlo Wangu — profiles.is_premium / premium_expiry self-escalation regression suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Background: profiles_self_update RLS is USING-only (no WITH CHECK), so a
 * normal user calling Supabase directly with the anon key + their own JWT
 * (exactly what Expo will do) could UPDATE any column on their own row,
 * including is_premium/premium_expiry — bypassing payment entirely. Verified
 * live before the fix (this suite repeats that exact attempt and asserts it
 * NOW fails). migrations/0009_prevent_premium_self_escalation.sql closes it
 * with a trigger mirroring the existing profiles.role protection
 * (migrations/0002), silently reverting any non-service-role change to
 * those two columns.
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

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `mlo-premium-esc-${stamp}@example.com`;
const password = 'EscTest123!';

console.log('\n═══ Mlo Wangu Premium Self-Escalation Regression Suite ═══\n');

let userId;
try {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: email } });
  if (createErr) throw new Error(`fixture setup failed: ${createErr.message}`);
  userId = created.user.id;

  const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: session, error: sessionErr } = await userClient.auth.signInWithPassword({ email, password });
  if (sessionErr) throw new Error(`sign-in failed: ${sessionErr.message}`);

  const scoped = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  // ── Baseline: fresh profile is not premium ──────────────────────────────
  const { data: before } = await admin.from('profiles').select('is_premium,premium_expiry').eq('id', userId).single();
  assert('Baseline: new profile is not premium', before.is_premium === false && !before.premium_expiry, JSON.stringify(before));

  // ── Attack: direct self-escalation via anon key + own JWT ───────────────
  console.log('── Direct self-escalation attempt (bypassing Express entirely) ──');
  const futureExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { error: updateErr } = await scoped.from('profiles').update({ is_premium: true, premium_expiry: futureExpiry }).eq('id', userId);
  // The update itself doesn't error (RLS USING clause still allows it to
  // match the row) — the trigger silently reverts the values server-side.
  assert('Direct update call does not itself error', !updateErr, updateErr?.message);

  const { data: after } = await admin.from('profiles').select('is_premium,premium_expiry').eq('id', userId).single();
  assert('is_premium was NOT changed by the direct client update (trigger reverted it)', after.is_premium === false, JSON.stringify(after));
  assert('premium_expiry was NOT changed by the direct client update (trigger reverted it)', !after.premium_expiry, JSON.stringify(after));

  // Also verify via the scoped (user) client's own read, not just the
  // service-role client, in case the trigger only fooled an admin-level read.
  const { data: afterAsUser } = await scoped.from('profiles').select('is_premium,premium_expiry').eq('id', userId).single();
  assert("User's own read of their profile also shows no escalation", afterAsUser.is_premium === false && !afterAsUser.premium_expiry, JSON.stringify(afterAsUser));

  // ── Legitimate path: service-role grant still works ─────────────────────
  console.log('── Legitimate service-role grant still works ──');
  const { error: grantErr } = await admin.from('profiles').update({ is_premium: true, premium_expiry: futureExpiry }).eq('id', userId);
  assert('Service-role update does not error', !grantErr, grantErr?.message);
  const { data: afterGrant } = await admin.from('profiles').select('is_premium,premium_expiry').eq('id', userId).single();
  assert('Service-role grant DOES take effect (trigger only blocks non-service-role callers)', afterGrant.is_premium === true && !!afterGrant.premium_expiry, JSON.stringify(afterGrant));

  // ── Role escalation still blocked too (regression check on migration 0002) ──
  console.log('── profiles.role self-escalation still blocked (0002 regression check) ──');
  const { error: roleErr } = await scoped.from('profiles').update({ role: 'admin' }).eq('id', userId);
  assert('Direct role-escalation update does not itself error', !roleErr, roleErr?.message);
  const { data: afterRole } = await admin.from('profiles').select('role').eq('id', userId).single();
  assert('role was NOT changed by the direct client update', afterRole.role === 'user', JSON.stringify(afterRole));
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try { if (userId) await admin.auth.admin.deleteUser(userId); } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
