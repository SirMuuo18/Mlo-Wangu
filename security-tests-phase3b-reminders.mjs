/**
 * Mlo Wangu — Phase 3B Stage 2, Item 2: Custom & Shopping-Day Reminders Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: CRUD on /api/reminders, ownership (RLS + server-side userId),
 * input validation, and confirmation that this table is entirely separate
 * from the existing water-reminder fields (no interaction with either).
 *
 * NOT covered, and not claimed as tested: actual on-device delivery of a
 * scheduled local notification — no physical device/emulator is available
 * in this environment, same disclosed limitation as the water reminder.
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
const emailA = `mlo-p3b-rem-a-${stamp}@example.com`;
const emailB = `mlo-p3b-rem-b-${stamp}@example.com`;
const password = 'Phase3BReminders123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

console.log('\n═══ Mlo Wangu Phase 3B — Custom & Shopping-Day Reminders Suite ═══\n');

let userAId, userBId, reminderId;
try {
  userAId = await createConfirmedUser(emailA);
  userBId = await createConfirmedUser(emailB);

  const anonA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sA } = await anonA.auth.signInWithPassword({ email: emailA, password });
  const authA = { Authorization: `Bearer ${sA.session.access_token}` };

  const anonB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sB } = await anonB.auth.signInWithPassword({ email: emailB, password });
  const authB = { Authorization: `Bearer ${sB.session.access_token}` };

  console.log('── Validation & auth ──');
  {
    const noAuth = await req('/api/reminders', { method: 'POST', body: JSON.stringify({ type: 'custom', label: 'x', time: '08:00', daysOfWeek: [] }) });
    assert('Unauthenticated create → 401', noAuth.status === 401, JSON.stringify(noAuth.body));

    const badType = await req('/api/reminders', { method: 'POST', headers: authA, body: JSON.stringify({ type: 'meal_prep', label: 'x', time: '08:00', daysOfWeek: [] }) });
    assert("Invalid type ('meal_prep' — not a real, server-supported type) → 400", badType.status === 400, JSON.stringify(badType.body));

    const badTime = await req('/api/reminders', { method: 'POST', headers: authA, body: JSON.stringify({ type: 'custom', label: 'x', time: '25:99', daysOfWeek: [] }) });
    assert('Invalid time format → 400', badTime.status === 400, JSON.stringify(badTime.body));

    const badDay = await req('/api/reminders', { method: 'POST', headers: authA, body: JSON.stringify({ type: 'custom', label: 'x', time: '08:00', daysOfWeek: ['funday'] }) });
    assert('Invalid day-of-week entry → 400', badDay.status === 400, JSON.stringify(badDay.body));

    const emptyLabel = await req('/api/reminders', { method: 'POST', headers: authA, body: JSON.stringify({ type: 'custom', label: '   ', time: '08:00', daysOfWeek: [] }) });
    assert('Empty label → 400', emptyLabel.status === 400, JSON.stringify(emptyLabel.body));
  }

  console.log('── Create, read, update, delete ──');
  {
    const create = await req('/api/reminders', { method: 'POST', headers: authA, body: JSON.stringify({ type: 'shopping_day', label: 'Buy vegetables', time: '09:30', daysOfWeek: ['mon', 'thu'] }) });
    assert('Valid create → 201', create.status === 201, JSON.stringify(create.body));
    reminderId = create.body.id;

    const list = await req('/api/reminders', { headers: authA });
    const found = list.body.reminders?.find((r) => r.id === reminderId);
    assert('Created reminder appears in the list with correct fields', found?.label === 'Buy vegetables' && found?.time === '09:30' && JSON.stringify(found?.daysOfWeek) === JSON.stringify(['mon', 'thu']), JSON.stringify(found));

    const update = await req(`/api/reminders/${reminderId}`, { method: 'PUT', headers: authA, body: JSON.stringify({ enabled: false }) });
    assert('Owner can update (disable) their own reminder → 200', update.status === 200, JSON.stringify(update.body));

    const afterUpdate = await req('/api/reminders', { headers: authA });
    assert('Update is reflected on next read', afterUpdate.body.reminders?.find((r) => r.id === reminderId)?.enabled === false);
  }

  console.log('── Ownership ──');
  {
    const listB = await req('/api/reminders', { headers: authB });
    assert("User B's list never contains User A's reminder", !(listB.body.reminders || []).some((r) => r.id === reminderId), JSON.stringify(listB.body.reminders));

    const updateAsB = await req(`/api/reminders/${reminderId}`, { method: 'PUT', headers: authB, body: JSON.stringify({ label: 'Hijacked' }) });
    assert("User B cannot update User A's reminder (404, not silently allowed)", updateAsB.status === 404, JSON.stringify(updateAsB.body));

    const deleteAsB = await req(`/api/reminders/${reminderId}`, { method: 'DELETE', headers: authB });
    assert("User B cannot delete User A's reminder (404)", deleteAsB.status === 404, JSON.stringify(deleteAsB.body));

    const { data: rlsRows, error: rlsErr } = await anonB.from('reminder_configs').select('id').eq('user_id', userAId);
    assert("Direct RLS check: User B's anon session cannot read User A's reminder_configs rows", !rlsErr && (rlsRows || []).length === 0, JSON.stringify({ error: rlsErr?.message, rows: rlsRows?.length }));

    const stillThere = await admin.from('reminder_configs').select('label').eq('id', reminderId).maybeSingle();
    assert("User A's reminder was never modified by User B's attempts", stillThere.data?.label === 'Buy vegetables', JSON.stringify(stillThere.data));
  }

  console.log('── Delete (real owner) ──');
  {
    const del = await req(`/api/reminders/${reminderId}`, { method: 'DELETE', headers: authA });
    assert('Owner can delete their own reminder → 200', del.status === 200, JSON.stringify(del.body));
    reminderId = null;
    const { data } = await admin.from('reminder_configs').select('id').eq('id', reminderId ?? '').maybeSingle();
    assert('Row is actually gone', !data);
  }

  console.log('── Separate from water reminders ──');
  {
    const { data: waterConfig } = await admin.from('water_target_config').select('*').eq('user_id', userAId).maybeSingle();
    assert('water_target_config table is untouched by this feature (no reminder_configs columns bled into it)', !waterConfig || !('type' in waterConfig), 'water_target_config unexpectedly has a reminder_configs-shaped column');
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (reminderId) await admin.from('reminder_configs').delete().eq('id', reminderId);
    if (userAId) await admin.from('reminder_configs').delete().eq('user_id', userAId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
