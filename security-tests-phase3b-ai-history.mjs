/**
 * Mlo Wangu — Phase 3B Stage 2, Item 6: AI Conversation History Suite.
 * Requires the server running against REAL Supabase (USE_JSON_DB=false).
 *
 * Covers: /api/ai/chat now writing both turns to ai_conversations, and the
 * new GET /api/ai/history reading them back — ownership (RLS + server-side
 * userId), ordering, and that a locked-Budget turn's had_financial_context
 * flag is recorded truthfully (false when locked) without ever attaching
 * financial figures to history the caller wouldn't otherwise have gotten.
 *
 * Uses the existing local fallback AI provider (no GEMINI_API_KEY assumed
 * configured in this environment) — the suite only asserts on persistence/
 * ownership, never on specific reply content, so it's provider-agnostic.
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
const emailA = `mlo-p3b-ai-a-${stamp}@example.com`;
const emailB = `mlo-p3b-ai-b-${stamp}@example.com`;
const password = 'Phase3BAiHistory123!';

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`fixture setup failed: ${error.message}`);
  return data.user.id;
}

console.log('\n═══ Mlo Wangu Phase 3B — AI Conversation History Suite ═══\n');

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

  console.log('── Chat persists both turns ──');
  {
    const uniqueQuestion = `What is a cheap dinner idea? (test marker ${stamp})`;
    const chat = await req('/api/ai/chat', { method: 'POST', headers: authA, body: JSON.stringify({ message: uniqueQuestion }) });
    assert('Chat request succeeds', chat.status === 200, JSON.stringify(chat.body));

    const { data: rows } = await admin.from('ai_conversations').select('role,content,had_financial_context').eq('user_id', userAId).order('created_at', { ascending: true });
    assert('Exactly one user turn and one assistant turn were persisted', (rows || []).length === 2, JSON.stringify(rows));
    assert('The user turn matches what was actually sent', rows?.[0]?.role === 'user' && rows[0].content === uniqueQuestion, JSON.stringify(rows?.[0]));
    assert('The assistant turn matches the actual reply returned to the client', rows?.[1]?.role === 'assistant' && rows[1].content === chat.body.reply, JSON.stringify(rows?.[1]));
    assert('had_financial_context is false — no financial session was unlocked for this request', rows?.every((r) => r.had_financial_context === false), JSON.stringify(rows));
  }

  console.log('── GET /api/ai/history ──');
  {
    const noAuth = await req('/api/ai/history');
    assert('Unauthenticated → 401', noAuth.status === 401, JSON.stringify(noAuth.body));

    const historyA = await req('/api/ai/history', { headers: authA });
    assert('Owner can read their own history → 200', historyA.status === 200, JSON.stringify(historyA.body));
    assert('History contains the turn just created, oldest-first', historyA.body.history?.length === 2 && historyA.body.history[0].role === 'user', JSON.stringify(historyA.body.history));

    const historyB = await req('/api/ai/history', { headers: authB });
    assert("User B's history is empty — never sees User A's conversation", (historyB.body.history || []).length === 0, JSON.stringify(historyB.body.history));
  }

  console.log('── Direct RLS check (as Expo eventually could query directly) ──');
  {
    const { data: rlsRows, error: rlsErr } = await anonB.from('ai_conversations').select('id').eq('user_id', userAId);
    assert("User B's own anon-key session cannot read User A's ai_conversations rows via RLS", !rlsErr && (rlsRows || []).length === 0, JSON.stringify({ error: rlsErr?.message, rows: rlsRows?.length }));
  }
} catch (err) {
  console.error('Suite crashed:', err);
  failed++;
} finally {
  try {
    if (userAId) await admin.from('ai_conversations').delete().eq('user_id', userAId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  } catch (cleanupErr) {
    console.error('Cleanup warning:', cleanupErr.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
