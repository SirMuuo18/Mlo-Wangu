// Supabase database adapter — used when USE_JSON_DB is not "true".
// All queries use service role key so they bypass RLS at the adapter layer.
// RLS still protects the database from any direct client access.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  IDatabaseAdapter, UserProfile, Budget, BudgetCategory,
  Expense, HouseholdMember, WaterConfig, WaterLog, PinLockoutStatus,
  PaymentRecord, PaymentStatus, SubscriptionRecord, PaymentPlanType,
  AccessCodeRecord, EntitlementRecord,
} from './db-adapter.js';

function mapPayment(row: Record<string, unknown>): PaymentRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    subscriptionId: (row.subscription_id as string) ?? null,
    amountKsh: row.amount_ksh as number,
    phoneNumber: row.phone_number as string,
    planType: row.plan_type as PaymentRecord['planType'],
    status: row.status as PaymentStatus,
    checkoutRequestId: (row.checkout_request_id as string) ?? null,
    merchantRequestId: (row.merchant_request_id as string) ?? null,
    mpesaReceipt: (row.mpesa_receipt as string) ?? null,
    resultDesc: (row.result_desc as string) ?? null,
    createdAt: row.created_at as string,
    verifiedAt: (row.verified_at as string) ?? null,
  };
}

function mapAccessCode(row: Record<string, unknown>): AccessCodeRecord {
  return {
    id: row.id as string,
    active: Boolean(row.active),
    expiresAt: (row.expires_at as string) ?? null,
    maxUses: row.max_uses as number,
    usedCount: row.used_count as number,
    userId: (row.user_id as string) ?? null,
  };
}

function mapEntitlement(row: Record<string, unknown>): EntitlementRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    source: row.source as EntitlementRecord['source'],
    paymentId: (row.payment_id as string) ?? null,
    accessCodeId: (row.access_code_id as string) ?? null,
    createdAt: row.created_at as string,
    expiresAt: (row.expires_at as string) ?? null,
    usedAt: (row.used_at as string) ?? null,
  };
}

function mapSubscription(row: Record<string, unknown>): SubscriptionRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    planType: row.plan_type as SubscriptionRecord['planType'],
    priceKsh: row.price_ksh as number,
    status: row.status as SubscriptionRecord['status'],
    startDate: (row.start_date as string) ?? null,
    endDate: (row.end_date as string) ?? null,
    mpesaReceipt: (row.mpesa_receipt as string) ?? null,
  };
}

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    role: (row.role as 'user' | 'admin') ?? 'user',
    hasBudgetPin: Boolean(row.has_budget_pin),
    isPremium: Boolean(row.is_premium),
    premiumExpiry: row.premium_expiry as string | null,
    onboardingComplete: Boolean(row.onboarding_complete),
    pinFailedAttempts: (row.pin_failed_attempts as number) ?? 0,
    pinLockedUntil: row.pin_locked_until
      ? new Date(row.pin_locked_until as string).getTime()
      : null,
  };
}

export class SupabaseDatabaseAdapter implements IDatabaseAdapter {
  private db: SupabaseClient;

  constructor() {
    this.db = getClient();
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  async getUser(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.db
      .from('profiles').select('*').eq('id', userId).single();
    if (error || !data) return null;
    return mapProfile(data);
  }

  async updateUser(userId: string, patch: Partial<UserProfile>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.hasBudgetPin !== undefined) dbPatch.has_budget_pin = patch.hasBudgetPin;
    if (patch.isPremium !== undefined) dbPatch.is_premium = patch.isPremium;
    if (patch.premiumExpiry !== undefined) dbPatch.premium_expiry = patch.premiumExpiry;
    if (patch.onboardingComplete !== undefined) dbPatch.onboarding_complete = patch.onboardingComplete;
    if (patch.pinFailedAttempts !== undefined) dbPatch.pin_failed_attempts = patch.pinFailedAttempts;
    if (patch.pinLockedUntil !== undefined) {
      dbPatch.pin_locked_until = patch.pinLockedUntil
        ? new Date(patch.pinLockedUntil).toISOString()
        : null;
    }
    dbPatch.updated_at = new Date().toISOString();
    await this.db.from('profiles').update(dbPatch).eq('id', userId);
  }

  // ── Budget PIN ────────────────────────────────────────────────────────────
  async getPinCredential(userId: string): Promise<{ pinHash: string; pinSalt: string } | null> {
    const { data, error } = await this.db
      .from('budget_pin_credentials').select('pin_hash,pin_salt').eq('user_id', userId).single();
    if (error || !data) return null;
    return { pinHash: data.pin_hash as string, pinSalt: data.pin_salt as string };
  }

  async setPinCredential(userId: string, pinHash: string, pinSalt: string): Promise<void> {
    await this.db.from('budget_pin_credentials').upsert(
      { user_id: userId, pin_hash: pinHash, pin_salt: pinSalt, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }

  // ── PIN Lockout ───────────────────────────────────────────────────────────
  async checkPinLockout(userId: string): Promise<PinLockoutStatus> {
    const { data } = await this.db
      .from('profiles')
      .select('pin_failed_attempts,pin_locked_until')
      .eq('id', userId)
      .single();
    if (!data) return { isLocked: false, lockedUntilMs: null, failedAttempts: 0 };
    const lockedUntilMs = data.pin_locked_until
      ? new Date(data.pin_locked_until as string).getTime()
      : null;
    const isLocked = lockedUntilMs ? Date.now() < lockedUntilMs : false;
    return {
      isLocked,
      lockedUntilMs: isLocked ? lockedUntilMs : null,
      failedAttempts: (data.pin_failed_attempts as number) ?? 0,
    };
  }

  async recordPinFailure(userId: string): Promise<void> {
    const { data } = await this.db
      .from('profiles').select('pin_failed_attempts').eq('id', userId).single();
    const attempts = ((data?.pin_failed_attempts as number) ?? 0) + 1;
    let lockedUntil: string | null = null;
    if (attempts >= 10) {
      lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    } else if (attempts >= 5) {
      lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }
    await this.db.from('profiles').update({
      pin_failed_attempts: attempts,
      pin_locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
  }

  async resetPinAttempts(userId: string): Promise<void> {
    await this.db.from('profiles').update({
      pin_failed_attempts: 0,
      pin_locked_until: null,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
  }

  // ── Financial Sessions ────────────────────────────────────────────────────
  async createFinancialSession(userId: string, tokenHash: string, expiresAt: number): Promise<void> {
    await this.db.from('financial_sessions').insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(expiresAt).toISOString(),
    });
  }

  async getFinancialSessionByTokenHash(tokenHash: string): Promise<{ userId: string; expiresAt: number } | null> {
    const { data, error } = await this.db
      .from('financial_sessions')
      .select('user_id,expires_at')
      .eq('token_hash', tokenHash)
      .single();
    if (error || !data) return null;
    return {
      userId: data.user_id as string,
      expiresAt: new Date(data.expires_at as string).getTime(),
    };
  }

  async deleteFinancialSession(tokenHash: string): Promise<void> {
    await this.db.from('financial_sessions').delete().eq('token_hash', tokenHash);
  }

  async deleteUserFinancialSessions(userId: string): Promise<void> {
    await this.db.from('financial_sessions').delete().eq('user_id', userId);
  }

  // ── Budget ────────────────────────────────────────────────────────────────
  async getBudget(userId: string, month: string = new Date().toISOString().slice(0, 7)): Promise<Budget | null> {
    const { data, error } = await this.db
      .from('budgets').select('*').eq('user_id', userId).eq('month', month).single();
    if (error || !data) return null;
    const { data: cats } = await this.db
      .from('budget_categories').select('*').eq('budget_id', data.id as string).order('sort_order');
    return {
      monthlyIncomeKsh: data.monthly_income_ksh as number,
      incomeType: (data.income_type as Budget['incomeType']) ?? 'monthly',
      month: data.month as string,
      categories: (cats ?? []).map((c: Record<string, unknown>) => ({
        category: c.category as string,
        plannedAmountKsh: c.planned_amount_ksh as number,
        color: c.color as string,
      })),
    };
  }

  async setBudget(userId: string, budget: Budget): Promise<void> {
    const { data: existing } = await this.db
      .from('budgets').select('id').eq('user_id', userId).eq('month', budget.month).single();

    let budgetId: string;
    if (existing?.id) {
      budgetId = existing.id as string;
      await this.db.from('budgets').update({
        monthly_income_ksh: budget.monthlyIncomeKsh,
        income_type: budget.incomeType,
        updated_at: new Date().toISOString(),
      }).eq('id', budgetId);
    } else {
      const { data: inserted } = await this.db.from('budgets').insert({
        user_id: userId,
        month: budget.month,
        monthly_income_ksh: budget.monthlyIncomeKsh,
        income_type: budget.incomeType,
      }).select('id').single();
      budgetId = (inserted as Record<string, unknown>)?.id as string;
    }

    await this.db.from('budget_categories').delete().eq('budget_id', budgetId);
    if (budget.categories.length > 0) {
      await this.db.from('budget_categories').insert(
        budget.categories.map((c, i) => ({
          budget_id: budgetId,
          category: c.category,
          planned_amount_ksh: c.plannedAmountKsh,
          color: c.color,
          sort_order: i,
        }))
      );
    }
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  async getExpenses(userId: string): Promise<Expense[]> {
    const { data } = await this.db
      .from('expenses').select('*').eq('user_id', userId).order('expense_date', { ascending: false });
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      userId: r.user_id as string,
      amountKsh: r.amount_ksh as number,
      category: r.category as string,
      description: r.description as string,
      expenseDate: r.expense_date as string,
      createdAt: r.created_at as string,
    }));
  }

  async addExpense(userId: string, expense: Omit<Expense, 'id' | 'userId' | 'createdAt'>): Promise<Expense> {
    const { data, error } = await this.db.from('expenses').insert({
      user_id: userId,
      amount_ksh: expense.amountKsh,
      category: expense.category,
      description: expense.description,
      expense_date: expense.expenseDate,
    }).select('*').single();
    if (error || !data) throw new Error('Failed to add expense');
    const r = data as Record<string, unknown>;
    return {
      id: r.id as string,
      userId: r.user_id as string,
      amountKsh: r.amount_ksh as number,
      category: r.category as string,
      description: r.description as string,
      expenseDate: r.expense_date as string,
      createdAt: r.created_at as string,
    };
  }

  async deleteExpense(userId: string, expenseId: string): Promise<boolean> {
    const { error } = await this.db
      .from('expenses').delete().eq('id', expenseId).eq('user_id', userId);
    return !error;
  }

  // ── Household Members ─────────────────────────────────────────────────────
  async getHouseholdMembers(userId: string): Promise<HouseholdMember[]> {
    const { data: hh } = await this.db
      .from('households').select('id').eq('owner_id', userId).single();
    if (!hh) return [];
    const { data: members } = await this.db
      .from('household_members').select('*').eq('household_id', (hh as Record<string, unknown>).id as string);
    return (members ?? []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      name: m.name as string,
      ageGroup: m.age_group as HouseholdMember['ageGroup'],
      preferences: (m.preferences as string[]) ?? [],
      allergies: (m.allergies as string[]) ?? [],
      dislikes: (m.dislikes as string[]) ?? [],
      nutritionGoals: m.nutrition_goals as string | undefined,
    }));
  }

  async setHouseholdMembers(userId: string, members: HouseholdMember[]): Promise<void> {
    let { data: hh } = await this.db
      .from('households').select('id').eq('owner_id', userId).single();
    if (!hh) {
      const { data: newHh } = await this.db
        .from('households').insert({ owner_id: userId, name: 'My Family' }).select('id').single();
      hh = newHh;
    }
    const hhId = (hh as Record<string, unknown>).id as string;
    await this.db.from('household_members').delete().eq('household_id', hhId);
    if (members.length > 0) {
      await this.db.from('household_members').insert(
        members.map((m) => ({
          household_id: hhId,
          name: m.name,
          age_group: m.ageGroup,
          preferences: m.preferences,
          allergies: m.allergies,
          dislikes: m.dislikes,
          nutrition_goals: m.nutritionGoals ?? null,
        }))
      );
    }
  }

  // ── Water ─────────────────────────────────────────────────────────────────
  async getWaterConfig(userId: string): Promise<WaterConfig> {
    const { data } = await this.db
      .from('water_configs').select('*').eq('user_id', userId).single();
    if (!data) {
      return {
        dailyTargetMl: 2000,
        glassSizeMl: 250,
        reminderFrequencyMinutes: 120,
        remindersEnabled: true,
        reminderSchedule: ['08:00', '10:30', '13:00', '15:30', '18:00', '20:00'],
      };
    }
    const r = data as Record<string, unknown>;
    return {
      dailyTargetMl: r.daily_target_ml as number,
      glassSizeMl: r.glass_size_ml as number,
      reminderFrequencyMinutes: r.reminder_frequency_minutes as number,
      remindersEnabled: Boolean(r.reminders_enabled),
      reminderSchedule: (r.reminder_schedule as string[]) ?? [],
    };
  }

  async setWaterConfig(userId: string, config: WaterConfig): Promise<void> {
    await this.db.from('water_configs').upsert(
      {
        user_id: userId,
        daily_target_ml: config.dailyTargetMl,
        glass_size_ml: config.glassSizeMl,
        reminder_frequency_minutes: config.reminderFrequencyMinutes,
        reminders_enabled: config.remindersEnabled,
        reminder_schedule: config.reminderSchedule,
      },
      { onConflict: 'user_id' }
    );
  }

  async getWaterLog(userId: string, date: string): Promise<WaterLog | null> {
    const { data: log } = await this.db
      .from('water_logs').select('*').eq('user_id', userId).eq('log_date', date).single();
    if (!log) return null;
    const r = log as Record<string, unknown>;
    const { data: entries } = await this.db
      .from('water_log_entries').select('*').eq('water_log_id', r.id as string).order('logged_at');
    return {
      date,
      totalMl: r.total_ml as number,
      targetMl: r.target_ml as number,
      entries: (entries ?? []).map((e: Record<string, unknown>) => ({
        loggedAt: e.logged_at as string,
        amountMl: e.amount_ml as number,
      })),
    };
  }

  async logWaterEntry(userId: string, date: string, amountMl: number): Promise<WaterLog> {
    const config = await this.getWaterConfig(userId);
    const { data: existing } = await this.db
      .from('water_logs').select('id,total_ml').eq('user_id', userId).eq('log_date', date).single();

    let logId: string;
    let newTotal: number;

    if (existing) {
      const r = existing as Record<string, unknown>;
      logId = r.id as string;
      newTotal = (r.total_ml as number) + amountMl;
      await this.db.from('water_logs').update({
        total_ml: newTotal, target_ml: config.dailyTargetMl,
      }).eq('id', logId);
    } else {
      newTotal = amountMl;
      const { data: newLog } = await this.db.from('water_logs').insert({
        user_id: userId, log_date: date, total_ml: amountMl, target_ml: config.dailyTargetMl,
      }).select('id').single();
      logId = (newLog as Record<string, unknown>).id as string;
    }

    await this.db.from('water_log_entries').insert({
      water_log_id: logId, logged_at: new Date().toISOString(), amount_ml: amountMl,
    });

    return this.getWaterLog(userId, date) as Promise<WaterLog>;
  }

  // ── Payments & Subscriptions ─────────────────────────────────────────────
  async createPendingPayment(userId: string, data: { amountKsh: number; phoneNumber: string; planType: PaymentPlanType }): Promise<PaymentRecord> {
    const { data: row, error } = await this.db.from('payments').insert({
      user_id: userId,
      amount_ksh: data.amountKsh,
      phone_number: data.phoneNumber,
      plan_type: data.planType,
      status: 'pending',
    }).select('*').single();
    if (error || !row) throw new Error('Failed to create pending payment');
    return mapPayment(row);
  }

  async setPaymentCheckoutIds(paymentId: string, data: { checkoutRequestId: string; merchantRequestId: string }): Promise<void> {
    await this.db.from('payments').update({
      checkout_request_id: data.checkoutRequestId,
      merchant_request_id: data.merchantRequestId,
    }).eq('id', paymentId);
  }

  async getPaymentById(paymentId: string): Promise<PaymentRecord | null> {
    const { data, error } = await this.db.from('payments').select('*').eq('id', paymentId).single();
    if (error || !data) return null;
    return mapPayment(data);
  }

  async getPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<PaymentRecord | null> {
    const { data, error } = await this.db.from('payments').select('*').eq('checkout_request_id', checkoutRequestId).single();
    if (error || !data) return null;
    return mapPayment(data);
  }

  async getRecentPendingPayment(userId: string, withinMs: number): Promise<PaymentRecord | null> {
    const since = new Date(Date.now() - withinMs).toISOString();
    const { data, error } = await this.db.from('payments')
      .select('*').eq('user_id', userId).eq('status', 'pending')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    return mapPayment(data);
  }

  // Guarded UPDATE: the WHERE clause includes status = expectedStatus, so this
  // relies on Postgres row-level atomicity as the idempotency mechanism — if
  // a concurrent/duplicate callback already flipped the row, this update
  // matches zero rows and we return null rather than double-processing.
  async transitionPayment(paymentId: string, expectedStatus: PaymentStatus, patch: Partial<Pick<PaymentRecord, 'status' | 'mpesaReceipt' | 'resultDesc' | 'verifiedAt'>> & { rawCallback?: unknown }): Promise<PaymentRecord | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.mpesaReceipt !== undefined) dbPatch.mpesa_receipt = patch.mpesaReceipt;
    if (patch.resultDesc !== undefined) dbPatch.result_desc = patch.resultDesc;
    if (patch.verifiedAt !== undefined) dbPatch.verified_at = patch.verifiedAt;
    if (patch.rawCallback !== undefined) dbPatch.daraja_callback_raw = patch.rawCallback;

    const { data, error } = await this.db.from('payments')
      .update(dbPatch).eq('id', paymentId).eq('status', expectedStatus).select('*');
    if (error || !data || data.length === 0) return null;
    return mapPayment(data[0]);
  }

  async getLatestSubscription(userId: string): Promise<SubscriptionRecord | null> {
    const { data, error } = await this.db.from('subscriptions')
      .select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    return mapSubscription(data);
  }

  // Renewal-aware: if the user's current subscription is still active in the
  // future, the new duration extends from its existing end_date rather than
  // overwriting remaining paid time. Otherwise starts fresh from now.
  async createOrExtendSubscription(userId: string, data: { planType: 'weekly' | 'monthly'; priceKsh: number; durationDays: number; mpesaReceipt: string; paymentId: string }): Promise<SubscriptionRecord> {
    const existing = await this.getLatestSubscription(userId);
    const now = Date.now();
    const currentEnd = existing?.status === 'active' && existing.endDate ? new Date(existing.endDate).getTime() : 0;
    const base = currentEnd > now ? currentEnd : now;
    const newEnd = new Date(base + data.durationDays * 24 * 60 * 60 * 1000).toISOString();

    let subscriptionId: string;
    if (existing?.status === 'active' && currentEnd > now) {
      // Extend the existing active subscription row.
      await this.db.from('subscriptions').update({
        end_date: newEnd, plan_type: data.planType, price_ksh: data.priceKsh, mpesa_receipt: data.mpesaReceipt,
      }).eq('id', existing.id);
      subscriptionId = existing.id;
    } else {
      const { data: inserted, error } = await this.db.from('subscriptions').insert({
        user_id: userId, plan_type: data.planType, price_ksh: data.priceKsh, status: 'active',
        start_date: new Date(base).toISOString(), end_date: newEnd, mpesa_receipt: data.mpesaReceipt,
      }).select('id').single();
      if (error || !inserted) throw new Error('Failed to create subscription');
      subscriptionId = (inserted as Record<string, unknown>).id as string;
    }

    await this.db.from('payments').update({ subscription_id: subscriptionId }).eq('id', data.paymentId);
    await this.db.from('profiles').update({ is_premium: true, premium_expiry: newEnd, updated_at: new Date().toISOString() }).eq('id', userId);

    const { data: finalRow } = await this.db.from('subscriptions').select('*').eq('id', subscriptionId).single();
    return mapSubscription(finalRow as Record<string, unknown>);
  }

  async countActiveSubscriptions(): Promise<number> {
    const { count } = await this.db.from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('end_date', new Date().toISOString());
    return count ?? 0;
  }

  // ── "Generate New Plan" gate: entitlements & access codes ────────────────
  // Read-only lookup — oldest unconsumed, unexpired entitlement for this
  // user, if any. Never mutates anything; the generate endpoint must still
  // call claimEntitlement() to actually consume it.
  async getUnusedEntitlement(userId: string): Promise<EntitlementRecord | null> {
    const { data, error } = await this.db.from('meal_plan_entitlements')
      .select('*').eq('user_id', userId).is('used_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (error || !data) return null;
    return mapEntitlement(data);
  }

  // Guarded UPDATE: only succeeds if the row is still unclaimed (used_at IS
  // NULL) and still belongs to this user. This is the atomicity guarantee
  // against double-consumption from a double-click or concurrent requests —
  // only one caller can ever win this update for a given entitlement id.
  async claimEntitlement(entitlementId: string, userId: string): Promise<EntitlementRecord | null> {
    const { data, error } = await this.db.from('meal_plan_entitlements')
      .update({ used_at: new Date().toISOString() })
      .eq('id', entitlementId).eq('user_id', userId).is('used_at', null)
      .select('*');
    if (error || !data || data.length === 0) return null;
    return mapEntitlement(data[0]);
  }

  // Best-effort rollback of a claim when generation fails after claiming —
  // the user must not lose a paid entitlement to a server-side error.
  async releaseEntitlement(entitlementId: string): Promise<void> {
    await this.db.from('meal_plan_entitlements').update({ used_at: null }).eq('id', entitlementId);
  }

  async createEntitlementFromPayment(userId: string, paymentId: string, expiresAt: string): Promise<EntitlementRecord> {
    const { data, error } = await this.db.from('meal_plan_entitlements').insert({
      user_id: userId, source: 'payment', payment_id: paymentId, expires_at: expiresAt,
    }).select('*').single();
    if (error || !data) throw new Error('Failed to create entitlement from payment');
    return mapEntitlement(data);
  }

  async createEntitlementFromAccessCode(userId: string, accessCodeId: string, expiresAt: string): Promise<EntitlementRecord> {
    const { data, error } = await this.db.from('meal_plan_entitlements').insert({
      user_id: userId, source: 'access_code', access_code_id: accessCodeId, expires_at: expiresAt,
    }).select('*').single();
    if (error || !data) throw new Error('Failed to create entitlement from access code');
    return mapEntitlement(data);
  }

  async getAccessCodeByHash(codeHash: string): Promise<AccessCodeRecord | null> {
    const { data, error } = await this.db.from('meal_plan_access_codes').select('*').eq('code_hash', codeHash).maybeSingle();
    if (error || !data) return null;
    return mapAccessCode(data);
  }

  // Guarded UPDATE: re-checks active/expiry/use-limit/ownership against a
  // fresh read, then does a compare-and-swap on used_count (WHERE used_count
  // = the value we just read). PostgREST has no atomic "SET x = x + 1", so
  // the CAS on the old value is what makes this safe under concurrency: if
  // another request already claimed a use in between, this update matches
  // zero rows and we return null — the last remaining use of a multi-use
  // code (or a user-bound code redeemed by the wrong user) can never be
  // double-granted by a race.
  async claimAccessCodeUse(accessCodeId: string, userId: string): Promise<AccessCodeRecord | null> {
    const { data: current, error: fetchError } = await this.db.from('meal_plan_access_codes')
      .select('used_count, max_uses, active, expires_at, user_id').eq('id', accessCodeId).single();
    if (fetchError || !current) return null;
    const row = current as Record<string, unknown>;
    const usedCount = row.used_count as number;
    const maxUses = row.max_uses as number;
    if (!row.active || usedCount >= maxUses) return null;
    if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) return null;
    if (row.user_id && row.user_id !== userId) return null;

    const { data, error } = await this.db.from('meal_plan_access_codes')
      .update({ used_count: usedCount + 1 })
      .eq('id', accessCodeId).eq('used_count', usedCount)
      .select('*');
    if (error || !data || data.length === 0) return null;
    return mapAccessCode(data[0]);
  }
}
