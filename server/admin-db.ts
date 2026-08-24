// Admin & Customer Support Console — data layer.
//
// Always Supabase-backed (like paymentsDb in secure-db.ts) — the admin
// console only makes sense against real production data. Every function
// here is only ever called from routes gated by requireAuth + requireAdmin;
// none of these functions themselves re-check authorization — that is the
// caller's job, on every single route, every time.
//
// Reuses paymentsDb/secureDb for anything that already exists there
// (payment transitions, entitlement/subscription creation, user profile
// reads) rather than re-implementing that logic here.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { paymentsDb } from './secure-db.js';
import { sha256 } from './secure-db.js';
import { PREMIUM_PRICING } from './mpesa.js';

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

function clampPage(page: unknown): number {
  const n = Number(page);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
function clampPageSize(pageSize: unknown): number {
  const n = Number(pageSize);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 50) : 20;
}
// Escape PostgREST ilike wildcards in user-supplied search text so a
// literal '%' or '_' in a search term can't widen the match unexpectedly.
function escapeIlike(term: string): string {
  return term.replace(/[%_,()]/g, (c) => `\\${c}`);
}

export type AccessCodeStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string | null;
  role: 'user' | 'admin';
  hasBudgetPin: boolean;
  createdAt: string;
  premiumActive: boolean;
  hasActiveMealPlanAccess: boolean;
}

export const adminDb = {
  // ── Dashboard ────────────────────────────────────────────────────────────
  async getDashboardStats() {
    const nowIso = new Date().toISOString();
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      totalUsers, newUsers7d, activeUsers30d, premiumUsers,
      pendingPayments, confirmedPayments,
      activeAccessCodes, expiredAccessCodesRaw,
      recentRegistrations, recentPayments, recentAuditActions,
    ] = await Promise.all([
      db().from('profiles').select('id', { count: 'exact', head: true }),
      db().from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgoIso),
      db().from('profiles').select('id', { count: 'exact', head: true }).gte('updated_at', thirtyDaysAgoIso),
      db().from('subscriptions').select('user_id', { count: 'exact', head: true }).eq('status', 'active').gt('end_date', nowIso),
      db().from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db().from('payments').select('id', { count: 'exact', head: true }).eq('status', 'success'),
      db().from('meal_plan_access_codes').select('id', { count: 'exact', head: true }).eq('active', true).gt('expires_at', nowIso),
      db().from('meal_plan_access_codes').select('id', { count: 'exact', head: true }).eq('active', true).lt('expires_at', nowIso),
      db().from('profiles').select('id,name,email,created_at').order('created_at', { ascending: false }).limit(8),
      db().from('payments').select('id,user_id,amount_ksh,plan_type,status,created_at').order('created_at', { ascending: false }).limit(8),
      db().from('admin_audit_log').select('id,admin_id,action,target_user_id,result,created_at').order('created_at', { ascending: false }).limit(8),
    ]);

    // "Users with active meal-plan access" = an unused, unexpired entitlement.
    const { count: usersWithMealPlanAccess } = await db()
      .from('meal_plan_entitlements')
      .select('user_id', { count: 'exact', head: true })
      .is('used_at', null)
      .gt('expires_at', nowIso);

    return {
      totalUsers: totalUsers.count ?? 0,
      newUsersLast7Days: newUsers7d.count ?? 0,
      activeUsersLast30Days: activeUsers30d.count ?? 0,
      premiumUsers: premiumUsers.count ?? 0,
      usersWithActiveMealPlanAccess: usersWithMealPlanAccess ?? 0,
      pendingPayments: pendingPayments.count ?? 0,
      confirmedPayments: confirmedPayments.count ?? 0,
      activeAccessCodes: activeAccessCodes.count ?? 0,
      expiredAccessCodes: expiredAccessCodesRaw.count ?? 0,
      recentRegistrations: recentRegistrations.data ?? [],
      recentPayments: recentPayments.data ?? [],
      recentSupportActions: recentAuditActions.data ?? [],
    };
  },

  // ── Users ────────────────────────────────────────────────────────────────
  async searchUsers(query: string, page: unknown, pageSize: unknown) {
    const p = clampPage(page);
    const ps = clampPageSize(pageSize);
    const from = (p - 1) * ps;
    const to = from + ps - 1;

    let q = db()
      .from('profiles')
      .select('id,name,email,role,has_budget_pin,created_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    const term = (query || '').trim();
    if (term) {
      const isUuidLike = /^[0-9a-fA-F-]{8,36}$/.test(term);
      const esc = escapeIlike(term);
      q = isUuidLike
        ? q.or(`id.eq.${term},name.ilike.%${esc}%,email.ilike.%${esc}%`)
        : q.or(`name.ilike.%${esc}%,email.ilike.%${esc}%`);
    }

    const { data, error, count } = await q.range(from, to);
    if (error) throw new Error(`user search failed: ${error.message}`);
    const rows = data ?? [];
    const ids = rows.map((r) => r.id as string);

    const premiumIds = new Set<string>();
    const accessIds = new Set<string>();
    if (ids.length) {
      const nowIso = new Date().toISOString();
      const [{ data: subs }, { data: ents }] = await Promise.all([
        db().from('subscriptions').select('user_id').in('user_id', ids).eq('status', 'active').gt('end_date', nowIso),
        db().from('meal_plan_entitlements').select('user_id').in('user_id', ids).is('used_at', null).gt('expires_at', nowIso),
      ]);
      (subs ?? []).forEach((s: any) => premiumIds.add(s.user_id));
      (ents ?? []).forEach((e: any) => accessIds.add(e.user_id));
    }

    const users: AdminUserSummary[] = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email ?? null,
      role: r.role,
      hasBudgetPin: Boolean(r.has_budget_pin),
      createdAt: r.created_at,
      premiumActive: premiumIds.has(r.id),
      hasActiveMealPlanAccess: accessIds.has(r.id),
    }));

    return { users, total: count ?? 0, page: p, pageSize: ps };
  },

  async getUserDetail(userId: string) {
    const { data: profile, error } = await db()
      .from('profiles')
      .select('id,name,email,role,has_budget_pin,onboarding_complete,created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error || !profile) return null;

    const nowIso = new Date().toISOString();
    const [
      { data: payments }, { data: subscription }, { data: entitlements },
      { data: accessCodes }, { data: household },
    ] = await Promise.all([
      db().from('payments').select('id,amount_ksh,phone_number,plan_type,status,mpesa_receipt,created_at,verified_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(25),
      db().from('subscriptions').select('id,plan_type,price_ksh,status,start_date,end_date').eq('user_id', userId).order('start_date', { ascending: false }).limit(1).maybeSingle(),
      db().from('meal_plan_entitlements').select('id,source,created_at,expires_at,used_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      db().from('meal_plan_access_codes').select('id,active,max_uses,used_count,expires_at,created_at,description').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      db().from('households').select('id,name,household_members(id)').eq('owner_id', userId).maybeSingle(),
    ]);

    const hasActiveMealPlanAccess = (entitlements ?? []).some(
      (e: any) => !e.used_at && e.expires_at && new Date(e.expires_at) > new Date(nowIso)
    );

    return {
      account: {
        id: profile.id, name: profile.name, email: profile.email,
        role: profile.role, createdAt: profile.created_at,
        onboardingComplete: Boolean(profile.onboarding_complete),
        status: 'active' as const, // no separate ban/suspend flag exists today
      },
      mealPlan: {
        hasActiveMealPlanAccess,
        entitlements: (entitlements ?? []).map((e: any) => ({
          id: e.id, source: e.source, createdAt: e.created_at, expiresAt: e.expires_at, usedAt: e.used_at,
        })),
        accessCodes: (accessCodes ?? []).map((c: any) => ({
          id: c.id, status: computeAccessCodeStatus(c), maxUses: c.max_uses, usedCount: c.used_count,
          expiresAt: c.expires_at, createdAt: c.created_at, description: c.description,
        })),
      },
      payments: (payments ?? []).map((p: any) => ({
        id: p.id, amountKsh: p.amount_ksh, phoneNumber: p.phone_number, planType: p.plan_type,
        status: p.status, mpesaReceipt: p.status === 'success' ? p.mpesa_receipt : null,
        createdAt: p.created_at, verifiedAt: p.verified_at,
      })),
      subscription: subscription
        ? {
            planType: subscription.plan_type, priceKsh: subscription.price_ksh, status: subscription.status,
            startDate: subscription.start_date, endDate: subscription.end_date,
          }
        : null,
      household: household
        ? { id: household.id, name: household.name, memberCount: (household.household_members ?? []).length }
        : null,
    };
  },

  // ── Payments ─────────────────────────────────────────────────────────────
  async listPayments(status: string | undefined, page: unknown, pageSize: unknown) {
    const p = clampPage(page);
    const ps = clampPageSize(pageSize);
    const from = (p - 1) * ps;
    const to = from + ps - 1;

    let q = db()
      .from('payments')
      .select('id,user_id,amount_ksh,phone_number,plan_type,status,mpesa_receipt,created_at,verified_at', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);

    const { data, error, count } = await q.range(from, to);
    if (error) throw new Error(`payment list failed: ${error.message}`);
    const rows = data ?? [];
    const ids = [...new Set(rows.map((r: any) => r.user_id))];
    let emailMap: Record<string, string | null> = {};
    if (ids.length) {
      const { data: profs } = await db().from('profiles').select('id,email').in('id', ids);
      (profs ?? []).forEach((pr: any) => { emailMap[pr.id] = pr.email; });
    }
    const payments = rows.map((r: any) => ({
      id: r.id, userId: r.user_id, userEmail: emailMap[r.user_id] ?? null,
      amountKsh: r.amount_ksh, phoneNumber: r.phone_number, planType: r.plan_type, status: r.status,
      mpesaReceipt: r.status === 'success' ? r.mpesa_receipt : null,
      createdAt: r.created_at, verifiedAt: r.verified_at,
    }));
    return { payments, total: count ?? 0, page: p, pageSize: ps };
  },

  // Reuses the exact same guarded transition + entitlement/subscription
  // creation the real Daraja callback uses (server.ts's
  // /api/payments/mpesa/callback) — same atomicity/idempotency guarantees,
  // just triggered by an admin click instead of Safaricom. This is for
  // unsticking a payment the admin has independently verified actually
  // landed (e.g. a callback that never arrived) — it never lets the admin
  // (or the client) choose the amount or the user; both come from the
  // existing payment row, not the request.
  async confirmPayment(paymentId: string): Promise<{ ok: boolean; reason?: string }> {
    const payment = await paymentsDb.getPaymentById(paymentId);
    if (!payment) return { ok: false, reason: 'not_found' };
    if (payment.status !== 'pending') return { ok: false, reason: 'not_pending' };

    const updated = await paymentsDb.transitionPayment(paymentId, 'pending', {
      status: 'success',
      verifiedAt: new Date().toISOString(),
      resultDesc: 'Manually confirmed by admin after independent M-Pesa verification',
    });
    if (!updated) return { ok: false, reason: 'concurrent_transition' };

    if (payment.planType === 'meal_plan_generation') {
      await paymentsDb.createEntitlementFromPayment(payment.userId, payment.id);
    } else {
      const duration = PREMIUM_PRICING[payment.planType as 'weekly' | 'monthly'].durationDays;
      await paymentsDb.createOrExtendSubscription(payment.userId, {
        planType: payment.planType as 'weekly' | 'monthly',
        priceKsh: payment.amountKsh,
        durationDays: duration,
        mpesaReceipt: '',
        paymentId: payment.id,
      });
    }
    return { ok: true };
  },

  // ── Access Codes ─────────────────────────────────────────────────────────
  // Status is computed, not stored — fetches a recent, capped batch (most
  // recent 1000) rather than every row ever issued, which is the realistic
  // ceiling for an admin-issued support tool. Filtering/pagination of the
  // computed status happens in-process after that fetch.
  async listAccessCodes(status: AccessCodeStatus | undefined, page: unknown, pageSize: unknown) {
    const p = clampPage(page);
    const ps = clampPageSize(pageSize);

    const { data, error } = await db()
      .from('meal_plan_access_codes')
      .select('id,user_id,active,max_uses,used_count,expires_at,created_at,description')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw new Error(`access code list failed: ${error.message}`);

    const withStatus = (data ?? []).map((c: any) => ({
      id: c.id, userId: c.user_id, maxUses: c.max_uses, usedCount: c.used_count,
      expiresAt: c.expires_at, createdAt: c.created_at, description: c.description,
      status: computeAccessCodeStatus(c),
    }));
    const filtered = status ? withStatus.filter((c) => c.status === status) : withStatus;

    const ids = [...new Set(filtered.map((c) => c.userId).filter(Boolean))] as string[];
    let emailMap: Record<string, string | null> = {};
    if (ids.length) {
      const { data: profs } = await db().from('profiles').select('id,email').in('id', ids);
      (profs ?? []).forEach((pr: any) => { emailMap[pr.id] = pr.email; });
    }

    const total = filtered.length;
    const from = (p - 1) * ps;
    const page_ = filtered.slice(from, from + ps).map((c) => ({ ...c, userEmail: c.userId ? (emailMap[c.userId] ?? null) : null }));
    return { codes: page_, total, page: p, pageSize: ps };
  },

  // Generates a high-entropy, unpredictable code (crypto.randomBytes, never
  // derived from the user's id/email, never sequential). Only the SHA-256
  // hash is stored — the plaintext is returned exactly once, in this
  // function's return value, and the caller (the route handler) must not
  // log it or persist it anywhere. 7-day expiry is enforced by the database
  // trigger on meal_plan_access_codes (see migration 0003), not by this
  // function — this function never sets expires_at itself.
  async issueAccessCode(userId: string, adminId: string, description?: string) {
    const code = generateAccessCode();
    const codeHash = sha256(code.trim().toUpperCase());
    const { data, error } = await db()
      .from('meal_plan_access_codes')
      .insert({
        code_hash: codeHash, user_id: userId, active: true, max_uses: 1, used_count: 0,
        description: (description && description.trim().slice(0, 200)) || `Issued by admin support (${adminId})`,
      })
      .select('id, expires_at, created_at')
      .single();
    if (error || !data) throw new Error(`failed to issue access code: ${error?.message}`);
    return { id: data.id as string, code, expiresAt: (data.expires_at as string) ?? null, createdAt: data.created_at as string };
  },

  async cancelAccessCode(id: string): Promise<boolean> {
    const { data, error } = await db().from('meal_plan_access_codes').update({ active: false }).eq('id', id).select('id').maybeSingle();
    return !error && !!data;
  },

  // ── Support Notes ────────────────────────────────────────────────────────
  async listSupportNotes(userId: string) {
    const { data, error } = await db()
      .from('support_notes')
      .select('id,user_id,admin_id,issue,action_taken,resolution,resolved,created_at,updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`support notes list failed: ${error.message}`);
    return data ?? [];
  },

  // Cross-user support queue for the "Support" console tab — resolved
  // (defaults to only-open) filter lets admins see outstanding issues first.
  async listAllSupportNotes(resolved: boolean | undefined, page: unknown, pageSize: unknown) {
    const p = clampPage(page);
    const ps = clampPageSize(pageSize);
    const from = (p - 1) * ps;
    const to = from + ps - 1;

    let q = db()
      .from('support_notes')
      .select('id,user_id,admin_id,issue,action_taken,resolution,resolved,created_at,updated_at', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (resolved !== undefined) q = q.eq('resolved', resolved);

    const { data, error, count } = await q.range(from, to);
    if (error) throw new Error(`support notes list failed: ${error.message}`);
    const rows = data ?? [];
    const ids = [...new Set(rows.map((r: any) => r.user_id))];
    let emailMap: Record<string, string | null> = {};
    if (ids.length) {
      const { data: profs } = await db().from('profiles').select('id,email,name').in('id', ids);
      (profs ?? []).forEach((pr: any) => { emailMap[pr.id] = pr.email || pr.name; });
    }
    const notes = rows.map((r: any) => ({ ...r, userLabel: emailMap[r.user_id] ?? r.user_id }));
    return { notes, total: count ?? 0, page: p, pageSize: ps };
  },

  async createSupportNote(opts: { userId: string; adminId: string; issue: string; actionTaken?: string; resolution?: string; resolved?: boolean }) {
    const { data, error } = await db()
      .from('support_notes')
      .insert({
        user_id: opts.userId, admin_id: opts.adminId, issue: opts.issue.trim().slice(0, 2000),
        action_taken: opts.actionTaken?.trim().slice(0, 2000) || null,
        resolution: opts.resolution?.trim().slice(0, 2000) || null,
        resolved: Boolean(opts.resolved),
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`failed to create support note: ${error?.message}`);
    return data;
  },

  async resolveSupportNote(noteId: string, resolution?: string) {
    const { data, error } = await db()
      .from('support_notes')
      .update({ resolved: true, resolution: resolution?.trim().slice(0, 2000) || undefined, updated_at: new Date().toISOString() })
      .eq('id', noteId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`failed to resolve support note: ${error.message}`);
    return data;
  },

  // ── Audit Log ────────────────────────────────────────────────────────────
  async logAudit(opts: { adminId: string; action: string; targetUserId?: string | null; metadata?: Record<string, unknown>; result?: 'success' | 'failure' }) {
    try {
      await db().from('admin_audit_log').insert({
        admin_id: opts.adminId,
        action: opts.action,
        target_user_id: opts.targetUserId ?? null,
        metadata: opts.metadata ?? {},
        result: opts.result ?? 'success',
      });
    } catch (err: any) {
      // Never let audit-logging failure block the admin action itself —
      // log server-side only.
      console.error('[admin-audit] failed to write audit log entry:', err?.message || err);
    }
  },

  async listAuditLog(targetUserId: string | undefined, page: unknown, pageSize: unknown) {
    const p = clampPage(page);
    const ps = clampPageSize(pageSize);
    const from = (p - 1) * ps;
    const to = from + ps - 1;

    let q = db()
      .from('admin_audit_log')
      .select('id,admin_id,action,target_user_id,metadata,result,created_at', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (targetUserId) q = q.eq('target_user_id', targetUserId);

    const { data, error, count } = await q.range(from, to);
    if (error) throw new Error(`audit log list failed: ${error.message}`);
    return { entries: data ?? [], total: count ?? 0, page: p, pageSize: ps };
  },
};

function computeAccessCodeStatus(row: { active: boolean; expires_at: string; used_count: number; max_uses: number }): AccessCodeStatus {
  if (!row.active) return 'CANCELLED';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'EXPIRED';
  if (row.used_count >= row.max_uses) return 'USED';
  return 'ACTIVE';
}

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // no 0/O/1/I/L — avoids support-call ambiguity
function randomAlphabetChar(alphabet: string): string {
  // Rejection sampling avoids modulo bias from 256 not being a multiple of the alphabet length.
  const max = 256 - (256 % alphabet.length);
  let byte: number;
  do {
    byte = crypto.randomBytes(1)[0];
  } while (byte >= max);
  return alphabet[byte % alphabet.length];
}
function generateAccessCode(): string {
  let raw = '';
  for (let i = 0; i < 12; i++) raw += randomAlphabetChar(CODE_ALPHABET);
  return `MLOW-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
