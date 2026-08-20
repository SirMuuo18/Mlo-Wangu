// Mode-aware store for the privacy-critical surface: profile, Budget PIN,
// financial sessions, budget, expenses, household members, water.
//
// USE_JSON_DB=true  -> delegates to the existing JSON store (server/db.ts), unchanged.
// USE_JSON_DB=false -> delegates to the real Supabase adapter (server/db-supabase.ts),
//                      which is RLS-protected and queried with the service role key.
//
// Everything else except payments/subscriptions (meal-plan persistence,
// shopping lists, notifications, AI conversation logs) still lives in the
// JSON store regardless of mode — see the Supabase connection report for
// that scope call. Payments/subscriptions (below, `paymentsDb`) are always
// Supabase-backed, unconditionally — real money moves through here, so
// there is no JSON/demo fallback for it at all, regardless of USE_JSON_DB.

import crypto from 'crypto';
import { db, getCurrentYearMonth, getTodayDate } from './db.js';
import { SupabaseDatabaseAdapter } from './db-supabase.js';
import type { UserProfile, Household, HouseholdMember, WaterTargetConfig, WaterLog, UserBudget, Expense } from '../src/types.js';
import type { PaymentStatus, PaymentPlanType } from './db-adapter.js';
import { MEAL_PLAN_GENERATION_ENTITLEMENT_VALID_MS } from './mpesa.js';

function useJson(): boolean {
  return process.env.USE_JSON_DB === 'true';
}

let supabaseAdapter: SupabaseDatabaseAdapter | null = null;
function sb(): SupabaseDatabaseAdapter {
  if (!supabaseAdapter) supabaseAdapter = new SupabaseDatabaseAdapter();
  return supabaseAdapter;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export const secureDb = {
  // ── Profile ─────────────────────────────────────────────────────────────
  // Return shape intentionally loose: JSON mode returns the full JSON user row
  // (includes email/createdAt); Supabase mode returns only what `profiles` has
  // (no email column — that lives in auth.users, merged by the caller from
  // res.locals.userEmail set by requireAuth).
  async getUser(userId: string): Promise<Record<string, any> | undefined> {
    if (useJson()) return db.getUser(userId);
    const u = await sb().getUser(userId);
    return u ?? undefined;
  },

  async updateUser(userId: string, patch: Partial<UserProfile>): Promise<void> {
    if (useJson()) { db.updateUser(userId, patch); return; }
    await sb().updateUser(userId, patch);
  },

  // ── Budget PIN ──────────────────────────────────────────────────────────
  async setBudgetPin(userId: string, pin: string): Promise<boolean> {
    if (useJson()) return db.setBudgetPin(userId, pin);
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(pin, salt, 10000, 64, 'sha256').toString('hex');
    await sb().setPinCredential(userId, hash, salt);
    await sb().updateUser(userId, { hasBudgetPin: true });
    return true;
  },

  async verifyBudgetPin(userId: string, pin: string): Promise<boolean> {
    if (useJson()) return db.verifyBudgetPin(userId, pin);
    const cred = await sb().getPinCredential(userId);
    if (!cred) return false;
    const verifyHash = crypto.pbkdf2Sync(pin, cred.pinSalt, 10000, 64, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(cred.pinHash, 'hex'), Buffer.from(verifyHash, 'hex'));
  },

  async checkPinLockout(userId: string): Promise<{ locked: boolean; secondsRemaining: number }> {
    if (useJson()) return db.checkPinLockout(userId);
    const status = await sb().checkPinLockout(userId);
    if (!status.isLocked || !status.lockedUntilMs) return { locked: false, secondsRemaining: 0 };
    return { locked: true, secondsRemaining: Math.ceil((status.lockedUntilMs - Date.now()) / 1000) };
  },

  async recordPinFailure(userId: string): Promise<void> {
    if (useJson()) { db.recordPinFailure(userId); return; }
    await sb().recordPinFailure(userId);
  },

  async resetPinAttempts(userId: string): Promise<void> {
    if (useJson()) { db.resetPinAttempts(userId); return; }
    await sb().resetPinAttempts(userId);
  },

  // ── Financial Sessions ──────────────────────────────────────────────────
  async createFinancialSession(userId: string, durationMinutes = 15): Promise<string> {
    if (useJson()) return db.createFinancialSession(userId, durationMinutes);
    await sb().deleteUserFinancialSessions(userId);
    const token = `fin_${crypto.randomBytes(32).toString('hex')}`;
    const expiresAt = Date.now() + durationMinutes * 60 * 1000;
    await sb().createFinancialSession(userId, sha256(token), expiresAt);
    return token;
  },

  async getFinancialSession(token: string): Promise<{ token: string; userId: string; expiresAt: number } | undefined> {
    if (useJson()) return db.getFinancialSession(token);
    const session = await sb().getFinancialSessionByTokenHash(sha256(token));
    if (!session) return undefined;
    return { token, userId: session.userId, expiresAt: session.expiresAt };
  },

  async verifyFinancialSession(userId: string, token?: string): Promise<boolean> {
    if (!token) return false;
    const session = await secureDb.getFinancialSession(token);
    if (!session || session.userId !== userId) return false;
    if (session.expiresAt < Date.now()) {
      await secureDb.invalidateFinancialSession(token);
      return false;
    }
    return true;
  },

  async invalidateFinancialSession(token: string): Promise<void> {
    if (useJson()) { db.invalidateFinancialSession(token); return; }
    await sb().deleteFinancialSession(sha256(token));
  },

  async invalidateAllFinancialSessionsForUser(userId: string): Promise<void> {
    if (useJson()) { db.invalidateAllFinancialSessionsForUser(userId); return; }
    await sb().deleteUserFinancialSessions(userId);
  },

  // ── Budget & Expenses ───────────────────────────────────────────────────
  async getBudget(userId: string, month: string = getCurrentYearMonth()): Promise<UserBudget | undefined> {
    if (useJson()) return db.getBudget(userId, month);
    const b = await sb().getBudget(userId, month);
    if (!b) return undefined;
    return {
      id: `bg_${userId}_${b.month}`,
      userId,
      month: b.month,
      monthlyIncomeKsh: b.monthlyIncomeKsh,
      // NOTE: db-adapter.ts's Budget.incomeType ('monthly'|'weekly'|'daily') and
      // src/types.ts's UserBudget.incomeType ('monthly'|'weekly'|'biweekly'|'irregular')
      // are pre-existing, independently-defined enums that don't fully overlap.
      // Reconciling them is outside this scoped fix; cast pragmatically here.
      incomeType: b.incomeType as UserBudget['incomeType'],
      categories: b.categories as UserBudget['categories'],
      updatedAt: new Date().toISOString(),
    };
  },

  async saveBudget(budget: UserBudget): Promise<UserBudget> {
    if (useJson()) return db.saveBudget(budget);
    await sb().setBudget(budget.userId, {
      monthlyIncomeKsh: budget.monthlyIncomeKsh,
      incomeType: budget.incomeType as any,
      month: budget.month,
      categories: budget.categories,
    });
    return budget;
  },

  async getExpenses(userId: string, month: string = getCurrentYearMonth()): Promise<Expense[]> {
    if (useJson()) return db.getExpenses(userId, month);
    const all = await sb().getExpenses(userId);
    return all
      .filter((e) => e.expenseDate.startsWith(month))
      .map((e) => ({ id: e.id, userId: e.userId, amountKsh: e.amountKsh, category: e.category as Expense['category'], description: e.description, date: e.expenseDate, createdAt: e.createdAt }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  async addExpense(expense: Expense): Promise<Expense> {
    if (useJson()) return db.addExpense(expense);
    const e = await sb().addExpense(expense.userId, {
      amountKsh: expense.amountKsh,
      category: expense.category,
      description: expense.description,
      expenseDate: expense.date,
    });
    return { id: e.id, userId: e.userId, amountKsh: e.amountKsh, category: e.category as Expense['category'], description: e.description, date: e.expenseDate, createdAt: e.createdAt };
  },

  async deleteExpense(userId: string, expenseId: string): Promise<boolean> {
    if (useJson()) return db.deleteExpense(userId, expenseId);
    return sb().deleteExpense(userId, expenseId);
  },

  async calculateOverspendingAnalysis(userId: string, month: string = getCurrentYearMonth()) {
    const budget = await secureDb.getBudget(userId, month);
    const expenses = await secureDb.getExpenses(userId, month);

    const foodCategory = budget?.categories.find((c) => c.category === 'Food');
    const foodPlanned = foodCategory ? foodCategory.plannedAmountKsh : 7000;

    const foodExpenses = expenses.filter((e) => e.category === 'Food');
    const foodSpent = foodExpenses.reduce((acc, curr) => acc + curr.amountKsh, 0);
    const foodRemaining = foodPlanned - foodSpent;

    const now = new Date();
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);

    const dailyAllowance = Math.max(0, Math.round(foodRemaining / daysRemaining));
    const expectedSpentToDate = (currentDay / daysInMonth) * foodPlanned;
    const velocityPercent = expectedSpentToDate > 0 ? Math.round((foodSpent / expectedSpentToDate) * 100) : 100;
    const projectedMonthEnd = Math.round((foodSpent / Math.max(1, currentDay)) * daysInMonth);

    let alertType: 'danger' | 'warning' | 'positive' | 'savings' = 'positive';
    let alertMessage = `You're doing great! You have KSh ${foodRemaining.toLocaleString()} left for the month (KSh ${dailyAllowance}/day).`;
    let isOverspending = false;
    let suggestedAction: string | undefined;

    if (foodRemaining <= 0) {
      alertType = 'danger';
      isOverspending = true;
      alertMessage = `You have reached 100% of your food budget with ${daysRemaining} days remaining in the month.`;
      suggestedAction = 'Adjust your meal plan to ultra-low cost Kenyan staples (Ugali, Beans, Sukuma wiki).';
    } else if (velocityPercent > 125) {
      alertType = 'warning';
      isOverspending = true;
      alertMessage = `You have used ${Math.round((foodSpent / foodPlanned) * 100)}% of your food budget. At your current pace, you may exceed your plan by ~KSh ${(projectedMonthEnd - foodPlanned).toLocaleString()}.`;
      suggestedAction = 'Switch 2-3 dinners this week to budget-friendly recipes (under KSh 150/meal).';
    } else if (foodRemaining < 1000 && daysRemaining > 7) {
      alertType = 'warning';
      isOverspending = true;
      alertMessage = `Remaining allowance is KSh ${dailyAllowance}/day for ${daysRemaining} days.`;
      suggestedAction = 'Leverage bulk pantry staples like Githeri, Rice, and Ndengu.';
    }

    return {
      foodBudgetPlannedKsh: foodPlanned,
      foodBudgetSpentKsh: foodSpent,
      foodBudgetRemainingKsh: foodRemaining,
      daysRemainingInMonth: daysRemaining,
      recommendedDailyAllowanceKsh: dailyAllowance,
      spendingVelocityPercent: velocityPercent,
      projectedMonthEndSpendingKsh: projectedMonthEnd,
      isOverspending,
      alertType,
      alertMessage,
      suggestedAction,
    };
  },

  // ── Household Members ───────────────────────────────────────────────────
  async getHousehold(userId: string): Promise<Household | undefined> {
    if (useJson()) return db.getHousehold(userId);
    const members = await sb().getHouseholdMembers(userId);
    return {
      id: `hh_${userId}`,
      ownerId: userId,
      name: 'My Family',
      members: members as HouseholdMember[],
      createdAt: new Date().toISOString(),
    };
  },

  async updateHousehold(household: Household): Promise<Household> {
    if (useJson()) return db.updateHousehold(household);
    await sb().setHouseholdMembers(household.ownerId, household.members);
    return household;
  },

  // ── Water ────────────────────────────────────────────────────────────────
  async getWaterConfig(userId: string): Promise<WaterTargetConfig> {
    if (useJson()) return db.getWaterConfig(userId);
    const c = await sb().getWaterConfig(userId);
    return { dailyTargetMl: c.dailyTargetMl, glassSizeMl: c.glassSizeMl, reminderFrequencyMinutes: c.reminderFrequencyMinutes, remindersEnabled: c.remindersEnabled, schedule: c.reminderSchedule };
  },

  async updateWaterConfig(userId: string, config: WaterTargetConfig): Promise<WaterTargetConfig> {
    if (useJson()) return db.updateWaterConfig(userId, config);
    await sb().setWaterConfig(userId, { dailyTargetMl: config.dailyTargetMl, glassSizeMl: config.glassSizeMl, reminderFrequencyMinutes: config.reminderFrequencyMinutes, remindersEnabled: config.remindersEnabled, reminderSchedule: config.schedule });
    return config;
  },

  async getWaterLog(userId: string, date: string = getTodayDate()): Promise<WaterLog> {
    if (useJson()) return db.getWaterLog(userId, date);
    const log = await sb().getWaterLog(userId, date);
    if (!log) {
      const config = await sb().getWaterConfig(userId);
      return { id: `wl_${userId}_${date}`, userId, date, totalMl: 0, targetMl: config.dailyTargetMl, logs: [] };
    }
    return { id: `wl_${userId}_${date}`, userId, date, totalMl: log.totalMl, targetMl: log.targetMl, logs: log.entries.map((e) => ({ time: e.loggedAt, amountMl: e.amountMl })) };
  },

  async addWater(userId: string, amountMl: number, date: string = getTodayDate()): Promise<WaterLog> {
    if (useJson()) return db.addWater(userId, amountMl, date);
    const log = await sb().logWaterEntry(userId, date, amountMl);
    return { id: `wl_${userId}_${date}`, userId, date, totalMl: log.totalMl, targetMl: log.targetMl, logs: log.entries.map((e) => ({ time: e.loggedAt, amountMl: e.amountMl })) };
  },

  async getWaterHistory7Days(userId: string): Promise<WaterLog[]> {
    if (useJson()) return db.getWaterHistory7Days(userId);
    const logs: WaterLog[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      logs.push(await secureDb.getWaterLog(userId, dateStr));
    }
    return logs;
  },
};

// Always Supabase-backed — no JSON mode, no fallback. Throws (via sb()) if
// Supabase isn't configured; route handlers must treat that as a clean 503,
// never as a successful payment.
export const paymentsDb = {
  createPendingPayment: (userId: string, data: { amountKsh: number; phoneNumber: string; planType: PaymentPlanType }) =>
    sb().createPendingPayment(userId, data),
  setPaymentCheckoutIds: (paymentId: string, data: { checkoutRequestId: string; merchantRequestId: string }) =>
    sb().setPaymentCheckoutIds(paymentId, data),
  getPaymentById: (paymentId: string) => sb().getPaymentById(paymentId),
  getPaymentByCheckoutRequestId: (checkoutRequestId: string) => sb().getPaymentByCheckoutRequestId(checkoutRequestId),
  getRecentPendingPayment: (userId: string, withinMs: number) => sb().getRecentPendingPayment(userId, withinMs),
  transitionPayment: (paymentId: string, expectedStatus: PaymentStatus, patch: Parameters<SupabaseDatabaseAdapter['transitionPayment']>[2]) =>
    sb().transitionPayment(paymentId, expectedStatus, patch),
  getLatestSubscription: (userId: string) => sb().getLatestSubscription(userId),
  createOrExtendSubscription: (userId: string, data: { planType: 'weekly' | 'monthly'; priceKsh: number; durationDays: number; mpesaReceipt: string; paymentId: string }) =>
    sb().createOrExtendSubscription(userId, data),
  countActiveSubscriptions: () => sb().countActiveSubscriptions(),

  // ── "Generate New Plan" gate ─────────────────────────────────────────────
  getUnusedEntitlement: (userId: string) => sb().getUnusedEntitlement(userId),
  claimEntitlement: (entitlementId: string, userId: string) => sb().claimEntitlement(entitlementId, userId),
  releaseEntitlement: (entitlementId: string) => sb().releaseEntitlement(entitlementId),
  createEntitlementFromPayment: (userId: string, paymentId: string) =>
    sb().createEntitlementFromPayment(userId, paymentId, new Date(Date.now() + MEAL_PLAN_GENERATION_ENTITLEMENT_VALID_MS).toISOString()),

  // Verifies a raw access code server-side (hash comparison only — the
  // plaintext code never touches the database) and, if valid, atomically
  // consumes one use and creates an entitlement. Returns null for every
  // failure case (not found, inactive, expired, exhausted, wrong user) so
  // the route handler can return one opaque error regardless of which.
  async redeemAccessCode(userId: string, rawCode: string): Promise<{ entitlementId: string } | null> {
    const hash = sha256(rawCode.trim().toUpperCase());
    const record = await sb().getAccessCodeByHash(hash);
    if (!record) return null;
    const claimed = await sb().claimAccessCodeUse(record.id, userId);
    if (!claimed) return null;
    const expiresAt = new Date(Date.now() + MEAL_PLAN_GENERATION_ENTITLEMENT_VALID_MS).toISOString();
    const entitlement = await sb().createEntitlementFromAccessCode(userId, claimed.id, expiresAt);
    return { entitlementId: entitlement.id };
  },
};
