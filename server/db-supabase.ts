// Supabase database adapter — used when USE_JSON_DB is not "true".
// All queries use service role key so they bypass RLS at the adapter layer.
// RLS still protects the database from any direct client access.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  IDatabaseAdapter, UserProfile, Budget, BudgetCategory,
  Expense, HouseholdMember, WaterConfig, WaterLog, PinLockoutStatus,
  PaymentRecord, PaymentStatus, SubscriptionRecord, PaymentPlanType,
  AccessCodeRecord, EntitlementRecord, NotificationRecord, MealRecord,
  MealIngredient, MealPlanRecord, MealPlanSaveInput, DayOfWeek, MealSlot,
  ShoppingListRecord, ShoppingListItemRecord,
} from './db-adapter.js';

const DAYS_OF_WEEK: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function mapNotification(row: Record<string, unknown>): NotificationRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    message: row.message as string,
    type: row.type as NotificationRecord['type'],
    isRead: Boolean(row.is_read),
    createdAt: row.created_at as string,
    data: (row.data as NotificationRecord['data']) ?? null,
  };
}

// meal_ingredients/meal_instructions arrive nested (Supabase embedded select)
// when present; tolerate either an array or a missing key.
function mapMeal(row: Record<string, unknown>): MealRecord {
  const ingredients = ((row.meal_ingredients as Record<string, unknown>[]) ?? [])
    .slice()
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((i): MealIngredient => ({
      name: i.name as string,
      quantity: Number(i.quantity),
      unit: i.unit as string,
      estimatedCostKsh: i.estimated_cost_ksh as number,
    }));
  const instructions = ((row.meal_instructions as Record<string, unknown>[]) ?? [])
    .slice()
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((i) => i.step as string);

  return {
    id: row.id as string,
    ownerId: (row.owner_id as string) ?? null,
    name: row.name as string,
    swahiliName: (row.swahili_name as string) ?? undefined,
    category: row.category as MealRecord['category'],
    prepTimeMinutes: row.prep_time_minutes as number,
    estimatedCostKsh: row.estimated_cost_ksh as number,
    costLevel: row.cost_level as MealRecord['costLevel'],
    description: (row.description as string) ?? '',
    imageUrl: (row.image_url as string) ?? undefined,
    servings: row.servings as number,
    kenyanCookingTips: (row.kenyan_cooking_tips as string) ?? undefined,
    isCustom: Boolean(row.is_custom),
    tags: (row.tags as string[]) ?? [],
    ingredients,
    instructions,
    nutrition: {
      proteinRich: Boolean(row.nutrition_protein),
      carbRich: Boolean(row.nutrition_carb),
      veggieRich: Boolean(row.nutrition_veggie),
      fruitIncluded: Boolean(row.nutrition_fruit),
      approxCalories: (row.approx_calories as number) ?? 500,
    },
  };
}

function mapPayment(row: Record<string, unknown>): PaymentRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    subscriptionId: (row.subscription_id as string) ?? null,
    amountKsh: row.amount_ksh as number,
    phoneNumber: row.phone_number as string,
    planType: row.plan_type as PaymentRecord['planType'],
    status: row.status as PaymentStatus,
    paymentMethod: (row.payment_method as PaymentRecord['paymentMethod']) ?? 'stk_push',
    checkoutRequestId: (row.checkout_request_id as string) ?? null,
    merchantRequestId: (row.merchant_request_id as string) ?? null,
    mpesaReceipt: (row.mpesa_receipt as string) ?? null,
    mpesaRawMessage: (row.mpesa_raw_message as string) ?? null,
    resultDesc: (row.result_desc as string) ?? null,
    createdAt: row.created_at as string,
    verifiedAt: (row.verified_at as string) ?? null,
    verifiedBy: (row.verified_by as string) ?? null,
    rejectionReason: (row.rejection_reason as string) ?? null,
  };
}

function mapAccessCode(row: Record<string, unknown>): AccessCodeRecord {
  return {
    id: row.id as string,
    active: Boolean(row.active),
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    maxUses: row.max_uses as number,
    usedCount: row.used_count as number,
    userId: (row.user_id as string) ?? null,
    paymentId: (row.payment_id as string) ?? null,
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
    email: (row.email as string) ?? null,
    role: (row.role as 'user' | 'admin') ?? 'user',
    hasBudgetPin: Boolean(row.has_budget_pin),
    isPremium: Boolean(row.is_premium),
    premiumExpiry: row.premium_expiry as string | null,
    onboardingComplete: Boolean(row.onboarding_complete),
    pinFailedAttempts: (row.pin_failed_attempts as number) ?? 0,
    pinLockedUntil: row.pin_locked_until
      ? new Date(row.pin_locked_until as string).getTime()
      : null,
    budgetDigestEnabled: Boolean(row.budget_digest_enabled),
    budgetDigestLastSentAt: (row.budget_digest_last_sent_at as string) ?? null,
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
    if (patch.budgetDigestEnabled !== undefined) dbPatch.budget_digest_enabled = patch.budgetDigestEnabled;
    if (patch.budgetDigestLastSentAt !== undefined) dbPatch.budget_digest_last_sent_at = patch.budgetDigestLastSentAt;
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
      payment_method: 'stk_push',
    }).select('*').single();
    if (error || !row) throw new Error('Failed to create pending payment');
    return mapPayment(row);
  }

  async createPendingTillPayment(userId: string, data: { amountKsh: number; phoneNumber: string; planType: PaymentPlanType; mpesaCode: string; mpesaRawMessage?: string }): Promise<PaymentRecord | null> {
    const { data: row, error } = await this.db.from('payments').insert({
      user_id: userId,
      amount_ksh: data.amountKsh,
      phone_number: data.phoneNumber,
      plan_type: data.planType,
      status: 'pending',
      payment_method: 'till_manual',
      mpesa_receipt: data.mpesaCode,
      mpesa_raw_message: data.mpesaRawMessage ?? null,
    }).select('*').single();
    if (error) {
      // Postgres unique_violation on idx_payments_receipt — this code was
      // already submitted for another payment.
      if ((error as { code?: string }).code === '23505') return null;
      throw new Error(`Failed to create Till payment: ${error.message}`);
    }
    if (!row) return null;
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
  async transitionPayment(paymentId: string, expectedStatus: PaymentStatus, patch: Partial<Pick<PaymentRecord, 'status' | 'mpesaReceipt' | 'resultDesc' | 'verifiedAt' | 'verifiedBy' | 'rejectionReason'>> & { rawCallback?: unknown }): Promise<PaymentRecord | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.mpesaReceipt !== undefined) dbPatch.mpesa_receipt = patch.mpesaReceipt;
    if (patch.resultDesc !== undefined) dbPatch.result_desc = patch.resultDesc;
    if (patch.verifiedAt !== undefined) dbPatch.verified_at = patch.verifiedAt;
    if (patch.verifiedBy !== undefined) dbPatch.verified_by = patch.verifiedBy;
    if (patch.rejectionReason !== undefined) dbPatch.rejection_reason = patch.rejectionReason;
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

  // ── Notifications ─────────────────────────────────────────────────────────
  // Strict ownership — never `.or('user_id.is.null,...')`. A notification
  // with no userId must never be creatable (userId is a required parameter,
  // not an optional field on the patch) or returned to any caller.
  async getNotifications(userId: string): Promise<NotificationRecord[]> {
    const { data } = await this.db
      .from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return (data ?? []).map(mapNotification);
  }

  async addNotification(userId: string, notif: Omit<NotificationRecord, 'id' | 'userId' | 'isRead' | 'createdAt'>): Promise<NotificationRecord> {
    const { data, error } = await this.db.from('notifications').insert({
      user_id: userId,
      title: notif.title,
      message: notif.message,
      // 'grocery' isn't in the notifications.type CHECK constraint (and
      // nothing in the app actually creates one) — fold it into 'system'
      // rather than let the insert fail.
      type: notif.type === 'grocery' ? 'system' : notif.type,
      data: notif.data ?? null,
    }).select('*').single();
    if (error || !data) throw new Error(`Failed to create notification: ${error?.message}`);
    return mapNotification(data);
  }

  async markNotificationRead(id: string, userId: string): Promise<boolean> {
    const { data, error } = await this.db.from('notifications')
      .update({ is_read: true }).eq('id', id).eq('user_id', userId).select('id');
    return !error && !!data && data.length > 0;
  }

  // ── Meal Catalog ──────────────────────────────────────────────────────────
  async getMeals(requesterId?: string): Promise<MealRecord[]> {
    let query = this.db.from('meals').select('*, meal_ingredients(*), meal_instructions(*)');
    query = requesterId ? query.or(`owner_id.is.null,owner_id.eq.${requesterId}`) : query.is('owner_id', null);
    const { data } = await query;
    return (data ?? []).map(mapMeal);
  }

  async getMealById(id: string, requesterId?: string): Promise<MealRecord | null> {
    const { data, error } = await this.db
      .from('meals').select('*, meal_ingredients(*), meal_instructions(*)').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const meal = mapMeal(data);
    if (meal.ownerId && meal.ownerId !== requesterId) return null;
    return meal;
  }

  async addMeal(ownerId: string, meal: Omit<MealRecord, 'id' | 'ownerId' | 'isCustom'>): Promise<MealRecord> {
    const { data: row, error } = await this.db.from('meals').insert({
      owner_id: ownerId,
      name: meal.name,
      swahili_name: meal.swahiliName ?? null,
      category: meal.category,
      prep_time_minutes: meal.prepTimeMinutes,
      estimated_cost_ksh: meal.estimatedCostKsh,
      cost_level: meal.costLevel,
      description: meal.description,
      image_url: meal.imageUrl ?? null,
      servings: meal.servings,
      kenyan_cooking_tips: meal.kenyanCookingTips ?? null,
      is_custom: true,
      tags: meal.tags,
      nutrition_protein: meal.nutrition.proteinRich,
      nutrition_carb: meal.nutrition.carbRich,
      nutrition_veggie: meal.nutrition.veggieRich,
      nutrition_fruit: meal.nutrition.fruitIncluded,
      approx_calories: meal.nutrition.approxCalories,
    }).select('id').single();
    if (error || !row) throw new Error(`Failed to create meal: ${error?.message}`);
    const mealId = (row as Record<string, unknown>).id as string;

    if (meal.ingredients.length > 0) {
      await this.db.from('meal_ingredients').insert(
        meal.ingredients.map((ing, i) => ({
          meal_id: mealId, name: ing.name, quantity: ing.quantity, unit: ing.unit,
          estimated_cost_ksh: ing.estimatedCostKsh, sort_order: i,
        }))
      );
    }
    if (meal.instructions.length > 0) {
      await this.db.from('meal_instructions').insert(
        meal.instructions.map((step, i) => ({ meal_id: mealId, step, sort_order: i }))
      );
    }

    const created = await this.getMealById(mealId, ownerId);
    if (!created) throw new Error('Failed to read back created meal');
    return created;
  }

  // Only the meal's owner may delete it — system meals (owner_id NULL) can
  // never match this filter regardless of requesterId.
  async deleteMeal(id: string, requesterId: string): Promise<boolean> {
    const { data, error } = await this.db.from('meals')
      .delete().eq('id', id).eq('owner_id', requesterId).select('id');
    return !error && !!data && data.length > 0;
  }

  async getSystemMealByName(name: string): Promise<MealRecord | null> {
    const { data, error } = await this.db
      .from('meals').select('*, meal_ingredients(*), meal_instructions(*)')
      .is('owner_id', null).eq('name', name).maybeSingle();
    if (error || !data) return null;
    return mapMeal(data);
  }

  // ── Meal Plans ────────────────────────────────────────────────────────────
  async getMealPlan(userId: string, weekStartDate?: string): Promise<MealPlanRecord | null> {
    let query = this.db.from('meal_plans')
      .select('*, meal_plan_slots(day_of_week, slot, meals(*, meal_ingredients(*), meal_instructions(*)))')
      .eq('user_id', userId);
    query = weekStartDate ? query.eq('week_start_date', weekStartDate) : query.order('week_start_date', { ascending: false });
    const { data, error } = await query.limit(1).maybeSingle();
    if (error || !data) return null;

    const row = data as Record<string, unknown>;
    const days = {} as MealPlanRecord['days'];
    for (const day of DAYS_OF_WEEK) days[day] = {};
    for (const slotRow of (row.meal_plan_slots as Record<string, unknown>[]) ?? []) {
      const day = slotRow.day_of_week as DayOfWeek;
      const slot = slotRow.slot as MealSlot;
      const mealRow = slotRow.meals as Record<string, unknown> | null;
      days[day][slot] = mealRow ? mapMeal(mealRow) : null;
    }

    return {
      id: row.id as string,
      userId: row.user_id as string,
      householdId: (row.household_id as string) ?? null,
      weekStartDate: row.week_start_date as string,
      createdAt: row.created_at as string,
      isStarred: Boolean(row.is_starred),
      days,
    };
  }

  // Upserts the meal_plans parent row atomically (ON CONFLICT (user_id,
  // week_start_date)) instead of the previous select-then-insert-or-update,
  // which had a TOCTOU gap two near-simultaneous generations could race
  // through. Slot replacement below ("delete children, reinsert", same
  // pattern as setBudget/setHouseholdMembers) is additionally serialized by
  // the per-user generation lock at the route level (see
  // claimGenerationLock) so two concurrent saves for the same week can't
  // interleave their slot writes either.
  async saveMealPlan(plan: MealPlanSaveInput): Promise<MealPlanRecord> {
    const { data: existing } = await this.db.from('meal_plans')
      .select('is_starred').eq('user_id', plan.userId).eq('week_start_date', plan.weekStartDate).maybeSingle();
    if (existing && (existing as Record<string, unknown>).is_starred) {
      throw new Error('STARRED_WEEK_PROTECTED');
    }

    const { data: upserted, error } = await this.db.from('meal_plans')
      .upsert(
        { user_id: plan.userId, household_id: plan.householdId, week_start_date: plan.weekStartDate },
        { onConflict: 'user_id,week_start_date' },
      ).select('id').single();
    if (error || !upserted) throw new Error(`Failed to save meal plan: ${error?.message}`);
    const planId = (upserted as Record<string, unknown>).id as string;

    await this.db.from('meal_plan_slots').delete().eq('meal_plan_id', planId);
    const slotRows: Record<string, unknown>[] = [];
    for (const day of DAYS_OF_WEEK) {
      for (const slot of MEAL_SLOTS) {
        const meal = plan.days[day]?.[slot];
        if (meal) slotRows.push({ meal_plan_id: planId, day_of_week: day, slot, meal_id: meal.id });
      }
    }
    if (slotRows.length > 0) await this.db.from('meal_plan_slots').insert(slotRows);

    const saved = await this.getMealPlan(plan.userId, plan.weekStartDate);
    if (!saved) throw new Error('Failed to read back saved meal plan');
    return saved;
  }

  // ── Meal-Plan History / Anti-Repeat / Starring ───────────────────────────
  async getMealUsageHistory(userId: string, weeksBack: number, beforeWeekStartDate: string): Promise<{ mealId: string; count: number }[]> {
    const before = new Date(`${beforeWeekStartDate}T00:00:00Z`);
    const cutoff = new Date(before.getTime() - weeksBack * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: plans } = await this.db.from('meal_plans')
      .select('id').eq('user_id', userId).gte('week_start_date', cutoff).lt('week_start_date', beforeWeekStartDate);
    const planIds = (plans ?? []).map((p) => (p as Record<string, unknown>).id as string);
    if (planIds.length === 0) return [];

    const { data: slots } = await this.db.from('meal_plan_slots').select('meal_id').in('meal_plan_id', planIds);
    const counts = new Map<string, number>();
    for (const row of slots ?? []) {
      const mealId = (row as Record<string, unknown>).meal_id as string | null;
      if (!mealId) continue;
      counts.set(mealId, (counts.get(mealId) || 0) + 1);
    }
    return [...counts.entries()].map(([mealId, count]) => ({ mealId, count }));
  }

  async getPreviousWeekMealIds(userId: string, beforeWeekStartDate: string): Promise<string[] | null> {
    const { data: plan } = await this.db.from('meal_plans')
      .select('id').eq('user_id', userId).lt('week_start_date', beforeWeekStartDate)
      .order('week_start_date', { ascending: false }).limit(1).maybeSingle();
    if (!plan) return null;
    const planId = (plan as Record<string, unknown>).id as string;
    const { data: slots } = await this.db.from('meal_plan_slots').select('meal_id').eq('meal_plan_id', planId);
    return (slots ?? []).map((r) => (r as Record<string, unknown>).meal_id as string).filter(Boolean);
  }

  async setMealPlanStarred(userId: string, weekStartDate: string, starred: boolean): Promise<boolean> {
    const { data, error } = await this.db.from('meal_plans')
      .update({ is_starred: starred }).eq('user_id', userId).eq('week_start_date', weekStartDate).select('id');
    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  async getStarredMealIds(userId: string): Promise<Set<string>> {
    const { data } = await this.db.from('starred_meals').select('meal_id').eq('user_id', userId);
    return new Set((data ?? []).map((r) => (r as Record<string, unknown>).meal_id as string));
  }

  async starMeal(userId: string, mealId: string): Promise<void> {
    await this.db.from('starred_meals').upsert({ user_id: userId, meal_id: mealId }, { onConflict: 'user_id,meal_id' });
  }

  async unstarMeal(userId: string, mealId: string): Promise<void> {
    await this.db.from('starred_meals').delete().eq('user_id', userId).eq('meal_id', mealId);
  }

  // CAS-style: the INSERT itself is the atomic claim (a unique-violation on
  // user_id means another live claim exists). A claim older than
  // staleAfterMs is assumed abandoned (crashed request that never released)
  // and is reclaimed via a conditional delete-then-retry rather than
  // deadlocking generation for that user forever.
  async claimGenerationLock(userId: string, staleAfterMs: number): Promise<boolean> {
    const { error } = await this.db.from('meal_plan_generation_locks').insert({ user_id: userId });
    if (!error) return true;

    const staleCutoff = new Date(Date.now() - staleAfterMs).toISOString();
    const { data: reclaimed } = await this.db.from('meal_plan_generation_locks')
      .delete().eq('user_id', userId).lt('claimed_at', staleCutoff).select('user_id');
    if (!reclaimed || reclaimed.length === 0) return false;

    const { error: retryError } = await this.db.from('meal_plan_generation_locks').insert({ user_id: userId });
    return !retryError;
  }

  async releaseGenerationLock(userId: string): Promise<void> {
    await this.db.from('meal_plan_generation_locks').delete().eq('user_id', userId);
  }

  // ── Shopping Lists ────────────────────────────────────────────────────────
  async getShoppingList(userId: string, weekStartDate?: string): Promise<ShoppingListRecord | null> {
    let query = this.db.from('shopping_lists').select('*, shopping_list_items(*)').eq('user_id', userId);
    query = weekStartDate ? query.eq('week_start_date', weekStartDate) : query.order('week_start_date', { ascending: false });
    const { data, error } = await query.limit(1).maybeSingle();
    if (error || !data) return null;
    return mapShoppingList(data as Record<string, unknown>);
  }

  async saveShoppingList(list: Omit<ShoppingListRecord, 'updatedAt'> & { updatedAt?: string }): Promise<ShoppingListRecord> {
    const { data: existing } = await this.db.from('shopping_lists')
      .select('id').eq('user_id', list.userId).eq('week_start_date', list.weekStartDate).maybeSingle();

    let listId: string;
    if (existing?.id) {
      listId = existing.id as string;
      await this.db.from('shopping_lists').update({ updated_at: new Date().toISOString() }).eq('id', listId);
    } else {
      const { data: inserted, error } = await this.db.from('shopping_lists').insert({
        user_id: list.userId, week_start_date: list.weekStartDate,
      }).select('id').single();
      if (error || !inserted) throw new Error(`Failed to create shopping list: ${error?.message}`);
      listId = (inserted as Record<string, unknown>).id as string;
    }

    await this.db.from('shopping_list_items').delete().eq('shopping_list_id', listId);
    if (list.items.length > 0) {
      await this.db.from('shopping_list_items').insert(
        list.items.map((item, i) => ({
          shopping_list_id: listId, name: item.name, category: item.category,
          quantity: item.quantity, unit: item.unit, estimated_price_ksh: item.estimatedPriceKsh,
          actual_price_ksh: item.actualPriceKsh ?? null, is_purchased: item.isPurchased, sort_order: i,
          frequency: item.frequency || 'weekly', source: item.source || 'generated',
        }))
      );
    }

    const saved = await this.getShoppingList(list.userId, list.weekStartDate);
    if (!saved) throw new Error('Failed to read back saved shopping list');
    return saved;
  }

  // ── Account data export (Phase 3B, item 8) ────────────────────────────────
  // Every query below is explicitly scoped `.eq('user_id'|'owner_id', userId)`
  // — there is no code path here that can return another user's row.
  // Deliberately EXCLUDED, and not a bug: budget_pin_credentials (PIN
  // hash/salt), financial_sessions (session tokens), email_log/
  // server_error_log (operational/admin-facing, not user content),
  // push_tokens (raw device tokens), meal_plan_access_codes (only ever
  // holds a hash — its existence is already reflected via entitlements/
  // payments), admin_audit_log/support_notes (admin-authored internal
  // records, out of scope for this pass). payments.daraja_callback_raw is
  // excluded from the payments rows below for the same "no server-internal
  // material" reason, even though it's the user's own transaction.
  async getAccountExport(userId: string, includeFinancial: boolean) {
    const [
      profile, households, meals, mealPlans, shoppingLists, waterConfig, waterLogs,
      reminders, notifications, payments, subscriptions, entitlements, aiHistory,
    ] = await Promise.all([
      this.db.from('profiles').select('id,name,email,role,has_budget_pin,is_premium,premium_expiry,onboarding_complete,budget_digest_enabled,created_at').eq('id', userId).maybeSingle(),
      this.db.from('households').select('id,name,created_at,household_members(id,name,age_group,preferences,allergies,dislikes,nutrition_goals)').eq('owner_id', userId),
      this.db.from('meals').select('id,name,category,prep_time_minutes,estimated_cost_ksh,servings,created_at').eq('owner_id', userId),
      this.db.from('meal_plans').select('id,week_start_date,created_at,meal_plan_slots(day_of_week,slot,meals(name))').eq('user_id', userId),
      this.db.from('shopping_lists').select('id,week_start_date,updated_at,shopping_list_items(name,category,quantity,unit,estimated_price_ksh,actual_price_ksh,is_purchased,frequency,source)').eq('user_id', userId),
      this.db.from('water_configs').select('daily_target_ml,glass_size_ml,reminders_enabled,reminder_schedule').eq('user_id', userId).maybeSingle(),
      this.db.from('water_logs').select('log_date,total_ml,target_ml').eq('user_id', userId).order('log_date', { ascending: false }).limit(90),
      this.db.from('reminder_configs').select('type,label,time,days_of_week,enabled,created_at').eq('user_id', userId),
      this.db.from('notifications').select('title,message,type,is_read,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
      this.db.from('payments').select('id,amount_ksh,plan_type,payment_method,status,mpesa_receipt,rejection_reason,created_at,verified_at').eq('user_id', userId).order('created_at', { ascending: false }),
      this.db.from('subscriptions').select('plan_type,price_ksh,status,start_date,end_date,created_at').eq('user_id', userId).order('created_at', { ascending: false }),
      this.db.from('meal_plan_entitlements').select('source,created_at,expires_at,used_at').eq('user_id', userId).order('created_at', { ascending: false }),
      this.db.from('ai_conversations').select('role,content,had_financial_context,created_at').eq('user_id', userId).order('created_at', { ascending: true }).limit(1000),
    ]);

    const result: Record<string, unknown> = {
      profile: profile.data ?? null,
      households: households.data ?? [],
      customMeals: meals.data ?? [],
      mealPlans: mealPlans.data ?? [],
      shoppingLists: shoppingLists.data ?? [],
      water: { config: waterConfig.data ?? null, recentLogs: waterLogs.data ?? [] },
      reminders: reminders.data ?? [],
      notifications: notifications.data ?? [],
      payments: payments.data ?? [],
      subscriptions: subscriptions.data ?? [],
      mealPlanEntitlements: entitlements.data ?? [],
      aiConversationHistory: aiHistory.data ?? [],
    };

    if (includeFinancial) {
      const [budgets, expenses] = await Promise.all([
        this.db.from('budgets').select('month,monthly_income_ksh,income_type,budget_categories(category,planned_amount_ksh,color)').eq('user_id', userId),
        this.db.from('expenses').select('amount_ksh,category,description,expense_date,created_at').eq('user_id', userId).order('expense_date', { ascending: false }),
      ]);
      result.budgets = budgets.data ?? [];
      result.expenses = expenses.data ?? [];
    }

    return result;
  }

  // ── Access-code & Premium expiry warnings (Phase 3B, item 4) ──────────────
  // Called from GET /api/auth/me (see trigger-point rationale in
  // migrations/0016_expiry_warned_at.sql). Best-effort: a failure here must
  // never break the profile fetch that triggered it — caller wraps in
  // try/catch. Returns nothing; its only effect is zero-or-more notification
  // rows plus the expiry_warned_at markers that prevent it firing twice.
  // Atomic claim for the budget-digest send slot (Phase 3B, item 3) — an
  // UPDATE conditioned on the row still being outside the interval, exactly
  // like checkAndWarnExpiringCredentials's per-row CAS guard below. Two
  // near-simultaneous GET /api/auth/me calls for the same user (a real
  // possibility — a web page load can fire more than one) must never both
  // "win" and each create their own digest notification; only the request
  // whose UPDATE actually matches a row proceeds to send anything.
  async claimBudgetDigestSlot(userId: string, intervalMs: number): Promise<boolean> {
    const cutoffIso = new Date(Date.now() - intervalMs).toISOString();
    const nowIso = new Date().toISOString();
    const { data, error } = await this.db
      .from('profiles')
      .update({ budget_digest_last_sent_at: nowIso })
      .eq('id', userId)
      .eq('budget_digest_enabled', true)
      .or(`budget_digest_last_sent_at.is.null,budget_digest_last_sent_at.lte.${cutoffIso}`)
      .select('id');
    if (error) throw new Error(`claimBudgetDigestSlot failed: ${error.message}`);
    return (data ?? []).length > 0;
  }

  async checkAndWarnExpiringCredentials(userId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const soonIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: codes } = await this.db
      .from('meal_plan_access_codes')
      .select('id, expires_at')
      .eq('user_id', userId)
      .eq('active', true)
      .is('expiry_warned_at', null)
      .gt('expires_at', nowIso)
      .lte('expires_at', soonIso);

    for (const code of codes ?? []) {
      const { error: markError } = await this.db
        .from('meal_plan_access_codes')
        .update({ expiry_warned_at: nowIso })
        .eq('id', code.id)
        .is('expiry_warned_at', null); // CAS-style guard against a concurrent duplicate warning
      if (markError) continue;
      await this.db.from('notifications').insert({
        user_id: userId, type: 'system', title: 'Your access code expires soon',
        message: `Your meal-plan access code expires within 24 hours (${new Date(code.expires_at as string).toLocaleString()}). Use it before then, or purchase again if it lapses.`,
        data: { expiresAt: code.expires_at },
      });
    }

    const { data: subs } = await this.db
      .from('subscriptions')
      .select('id, end_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('expiry_warned_at', null)
      .gt('end_date', nowIso)
      .lte('end_date', soonIso);

    for (const sub of subs ?? []) {
      const { error: markError } = await this.db
        .from('subscriptions')
        .update({ expiry_warned_at: nowIso })
        .eq('id', sub.id)
        .is('expiry_warned_at', null);
      if (markError) continue;
      await this.db.from('notifications').insert({
        user_id: userId, type: 'system', title: 'Your Premium subscription expires soon',
        message: `Your Premium subscription expires within 24 hours (${new Date(sub.end_date as string).toLocaleString()}). Renew to keep uninterrupted access.`,
        data: { expiresAt: sub.end_date },
      });
    }
  }

  // ── Custom & shopping-day reminders (Phase 3B, item 2) ────────────────────
  async getReminders(userId: string): Promise<Array<{ id: string; type: 'shopping_day' | 'custom'; label: string; time: string; daysOfWeek: string[]; enabled: boolean }>> {
    const { data, error } = await this.db
      .from('reminder_configs')
      .select('id,type,label,time,days_of_week,enabled')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`getReminders failed: ${error.message}`);
    return (data ?? []).map((r: any) => ({ id: r.id, type: r.type, label: r.label, time: r.time, daysOfWeek: r.days_of_week ?? [], enabled: r.enabled }));
  }

  async createReminder(userId: string, input: { type: 'shopping_day' | 'custom'; label: string; time: string; daysOfWeek: string[] }): Promise<{ id: string }> {
    const { data, error } = await this.db.from('reminder_configs').insert({
      user_id: userId, type: input.type, label: input.label, time: input.time, days_of_week: input.daysOfWeek, enabled: true,
    }).select('id').single();
    if (error) throw new Error(`createReminder failed: ${error.message}`);
    return { id: data.id };
  }

  // Scoped to the caller — updates/deletes only ever match a row that is
  // also owned by userId, so a forged/guessed id can never touch another
  // user's reminder (defense in depth alongside the RLS policy itself).
  async updateReminder(userId: string, id: string, patch: { label?: string; time?: string; daysOfWeek?: string[]; enabled?: boolean }): Promise<boolean> {
    const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.label !== undefined) dbPatch.label = patch.label;
    if (patch.time !== undefined) dbPatch.time = patch.time;
    if (patch.daysOfWeek !== undefined) dbPatch.days_of_week = patch.daysOfWeek;
    if (patch.enabled !== undefined) dbPatch.enabled = patch.enabled;
    const { data, error } = await this.db.from('reminder_configs').update(dbPatch).eq('id', id).eq('user_id', userId).select('id');
    if (error) throw new Error(`updateReminder failed: ${error.message}`);
    return (data ?? []).length > 0;
  }

  async deleteReminder(userId: string, id: string): Promise<boolean> {
    const { data, error } = await this.db.from('reminder_configs').delete().eq('id', id).eq('user_id', userId).select('id');
    if (error) throw new Error(`deleteReminder failed: ${error.message}`);
    return (data ?? []).length > 0;
  }

  // ── AI conversation history (Phase 3B, item 6) ────────────────────────────
  // ai_conversations already existed, fully RLS-protected (auth.uid() =
  // user_id), before this phase — it was simply never written to. No schema
  // change needed; this just starts using what was already there.
  async saveAiMessage(userId: string, role: 'user' | 'assistant', content: string, hadFinancialContext: boolean): Promise<void> {
    const { error } = await this.db.from('ai_conversations').insert({
      user_id: userId, role, content, had_financial_context: hadFinancialContext,
    });
    if (error) throw new Error(`saveAiMessage failed: ${error.message}`);
  }

  async getAiHistory(userId: string, limit: number): Promise<Array<{ id: string; role: 'user' | 'assistant'; content: string; hadFinancialContext: boolean; createdAt: string }>> {
    const { data, error } = await this.db
      .from('ai_conversations')
      .select('id,role,content,had_financial_context,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`getAiHistory failed: ${error.message}`);
    return (data ?? [])
      .map((r: any) => ({ id: r.id, role: r.role, content: r.content, hadFinancialContext: r.had_financial_context, createdAt: r.created_at }))
      .reverse(); // oldest-first for chat-log display
  }

  // ── Push tokens (Phase 3B, item 1) ────────────────────────────────────────
  // Upsert keyed on `token` alone (not `user_id, token`) — see
  // migrations/0012_push_tokens.sql for why a re-registered token must
  // replace its previous owner's row rather than coexist with it.
  async registerPushToken(userId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
    const { error } = await this.db.from('push_tokens').upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'token' }
    );
    if (error) throw new Error(`registerPushToken failed: ${error.message}`);
  }

  // Scoped to the caller — deletes only if the token belongs to userId, so a
  // forged/guessed token value can never unregister another user's device.
  async unregisterPushToken(userId: string, token: string): Promise<void> {
    const { error } = await this.db.from('push_tokens').delete().eq('user_id', userId).eq('token', token);
    if (error) throw new Error(`unregisterPushToken failed: ${error.message}`);
  }

  async getPushTokensForUser(userId: string): Promise<string[]> {
    const { data, error } = await this.db.from('push_tokens').select('token').eq('user_id', userId);
    if (error) throw new Error(`getPushTokensForUser failed: ${error.message}`);
    return (data ?? []).map((r: { token: string }) => r.token);
  }

  // Called when Expo's send API reports DeviceNotRegistered for this token —
  // reactive cleanup, since no cron/scheduled job exists in this codebase.
  async deletePushTokenByValue(token: string): Promise<void> {
    const { error } = await this.db.from('push_tokens').delete().eq('token', token);
    if (error) throw new Error(`deletePushTokenByValue failed: ${error.message}`);
  }

  // ── Server error log (Phase 3B, item 15) ──────────────────────────────────
  // Best-effort, fire-and-forget by contract (see server/errorLog.ts) — this
  // method itself still throws on a real DB error so the caller can decide
  // whether to swallow it, but nothing here ever blocks or retries.
  async logServerError(entry: { route: string; severity: 'error' | 'warning'; userId: string | null; message: string; context?: Record<string, unknown> }): Promise<void> {
    const { error } = await this.db.from('server_error_log').insert({
      route: entry.route, severity: entry.severity, user_id: entry.userId,
      message: entry.message, context: entry.context ?? null,
    });
    if (error) throw new Error(`logServerError failed: ${error.message}`);
  }

  async listServerErrors(page: number, pageSize: number): Promise<{ rows: Array<{ id: string; correlationId: string; occurredAt: string; route: string; severity: string; userId: string | null; message: string; context: Record<string, unknown> | null }>; total: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await this.db
      .from('server_error_log')
      .select('id,correlation_id,occurred_at,route,severity,user_id,message,context', { count: 'exact' })
      .order('occurred_at', { ascending: false })
      .range(from, to);
    if (error) throw new Error(`listServerErrors failed: ${error.message}`);
    return {
      rows: (data ?? []).map((r: any) => ({
        id: r.id, correlationId: r.correlation_id, occurredAt: r.occurred_at, route: r.route,
        severity: r.severity, userId: r.user_id, message: r.message, context: r.context,
      })),
      total: count ?? 0,
    };
  }
}

function mapShoppingList(row: Record<string, unknown>): ShoppingListRecord {
  const items = ((row.shopping_list_items as Record<string, unknown>[]) ?? [])
    .slice()
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((i): ShoppingListItemRecord => ({
      id: i.id as string,
      name: i.name as string,
      category: i.category as string,
      quantity: Number(i.quantity),
      unit: i.unit as string,
      estimatedPriceKsh: i.estimated_price_ksh as number,
      actualPriceKsh: (i.actual_price_ksh as number) ?? null,
      isPurchased: Boolean(i.is_purchased),
      frequency: ((i.frequency as 'weekly' | 'monthly') ?? 'weekly'),
      source: ((i.source as 'generated' | 'manual') ?? 'generated'),
    }));
  return {
    id: row.id as string,
    userId: row.user_id as string,
    weekStartDate: row.week_start_date as string,
    updatedAt: row.updated_at as string,
    items,
  };
}
