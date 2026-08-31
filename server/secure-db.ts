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
import { db, getCurrentYearMonth, getTodayDate, getMondayOfCurrentWeek, generateShoppingItemsFromMealPlan } from './db.js';
import { SupabaseDatabaseAdapter } from './db-supabase.js';
import type { UserProfile, Household, HouseholdMember, WaterTargetConfig, WaterLog, UserBudget, Expense, NotificationItem, Meal, WeeklyMealPlan, ShoppingList, DayOfWeek } from '../src/types.js';
import type { PaymentStatus, PaymentPlanType, MealRecord, NotificationRecord } from './db-adapter.js';
import { MEAL_PLAN_GENERATION_ENTITLEMENT_VALID_MS } from './mpesa.js';
import { mergeShoppingItems, MergeableItem } from './shoppingCanonicalization.js';

function useJson(): boolean {
  return process.env.USE_JSON_DB === 'true';
}

let supabaseAdapter: SupabaseDatabaseAdapter | null = null;
function sb(): SupabaseDatabaseAdapter {
  if (!supabaseAdapter) supabaseAdapter = new SupabaseDatabaseAdapter();
  return supabaseAdapter;
}

export function sha256(input: string): string {
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

    // General, all-category warnings — not just Food. Sensible thresholds
    // only (≥80% used, or over budget), never one per small expense.
    const warnings: string[] = [];
    for (const cat of budget?.categories || []) {
      if (!cat.plannedAmountKsh) continue; // no planned amount set yet — nothing to warn about
      const catSpent = expenses.filter((e) => e.category === cat.category).reduce((sum, e) => sum + e.amountKsh, 0);
      if (catSpent > cat.plannedAmountKsh) {
        warnings.push(`You've exceeded your ${cat.category} budget by KSh ${(catSpent - cat.plannedAmountKsh).toLocaleString()}.`);
      } else if (catSpent / cat.plannedAmountKsh >= 0.8) {
        warnings.push(`You've used ${Math.round((catSpent / cat.plannedAmountKsh) * 100)}% of your ${cat.category} budget.`);
      }
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
      // Aliases BudgetView.tsx actually reads (see field docs on the
      // OverspendingAnalysis type) — same values as the fields above.
      dailySafeSpendingKsh: dailyAllowance,
      projectedMonthEndSpendKsh: projectedMonthEnd,
      recommendations: suggestedAction ? [suggestedAction] : [],
      warnings,
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
  createPendingTillPayment: (userId: string, data: { amountKsh: number; phoneNumber: string; planType: PaymentPlanType; mpesaCode: string; mpesaRawMessage?: string }) =>
    sb().createPendingTillPayment(userId, data),
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

const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function mapMealRecordToMeal(r: MealRecord): Meal {
  return {
    id: r.id,
    name: r.name,
    swahiliName: r.swahiliName,
    category: r.category,
    prepTimeMinutes: r.prepTimeMinutes,
    estimatedCostKsh: r.estimatedCostKsh,
    costLevel: r.costLevel,
    ingredients: r.ingredients,
    instructions: r.instructions,
    nutrition: r.nutrition,
    tags: r.tags,
    description: r.description,
    imageUrl: r.imageUrl,
    servings: r.servings,
    kenyanCookingTips: r.kenyanCookingTips,
    isCustom: r.isCustom,
    ownerId: r.ownerId ?? undefined,
  };
}

// ── Notifications ─────────────────────────────────────────────────────────
export const notificationsDb = {
  async getNotifications(userId: string): Promise<NotificationItem[]> {
    if (useJson()) return db.getNotifications(userId);
    const rows = await sb().getNotifications(userId);
    return rows.map((r: NotificationRecord) => ({
      id: r.id, userId: r.userId, title: r.title, message: r.message,
      type: r.type as NotificationItem['type'], isRead: r.isRead, createdAt: r.createdAt,
      data: r.data ?? undefined,
    }));
  },

  async addNotification(userId: string, notif: Omit<NotificationItem, 'id' | 'userId' | 'isRead' | 'createdAt'>): Promise<NotificationItem> {
    if (useJson()) return db.addNotification({ ...notif, userId });
    const r = await sb().addNotification(userId, notif);
    return { id: r.id, userId: r.userId, title: r.title, message: r.message, type: r.type as NotificationItem['type'], isRead: r.isRead, createdAt: r.createdAt, data: r.data ?? undefined };
  },

  async markNotificationRead(id: string, userId: string): Promise<boolean> {
    if (useJson()) return db.markNotificationRead(id, userId);
    return sb().markNotificationRead(id, userId);
  },
};

// Account data export (Phase 3B, item 8) — Supabase-only; JSON dev mode has
// no real per-user persistence across most of these tables to export anyway.
export const accountExportDb = {
  async export(userId: string, includeFinancial: boolean) {
    if (useJson()) return null;
    return sb().getAccountExport(userId, includeFinancial);
  },
};

// Budget-digest send-slot claim (Phase 3B, item 3) — Supabase-only, like
// the payment/subscription system itself.
export const budgetDigestDb = {
  async claimSlot(userId: string, intervalMs: number): Promise<boolean> {
    if (useJson()) return false; // dev mode never sends a digest
    return sb().claimBudgetDigestSlot(userId, intervalMs);
  },
};

// Access-code & Premium expiry warnings (Phase 3B, item 4) — Supabase-only,
// like the payment/subscription system itself; JSON dev mode has no real
// access-code or subscription lifecycle to warn about.
export const expiryWarningDb = {
  async checkAndWarn(userId: string): Promise<void> {
    if (useJson()) return;
    await sb().checkAndWarnExpiringCredentials(userId);
  },
};

// reminder_configs is a real user-facing CRUD resource (RLS-protected, not
// service-role-only). JSON dev mode returns an empty list / no-ops rather
// than inventing a second storage model for it — reminders were never
// persisted in dev mode before this phase either (water's own JSON-mode
// storage is unaffected and unchanged).
export const reminderDb = {
  async list(userId: string) {
    if (useJson()) return [];
    return sb().getReminders(userId);
  },
  async create(userId: string, input: { type: 'shopping_day' | 'custom'; label: string; time: string; daysOfWeek: string[] }) {
    if (useJson()) return { id: `reminder_${Date.now()}` };
    return sb().createReminder(userId, input);
  },
  async update(userId: string, id: string, patch: { label?: string; time?: string; daysOfWeek?: string[]; enabled?: boolean }) {
    if (useJson()) return true;
    return sb().updateReminder(userId, id, patch);
  },
  async remove(userId: string, id: string) {
    if (useJson()) return true;
    return sb().deleteReminder(userId, id);
  },
};

// ai_conversations already exists with working RLS — JSON dev mode never had
// any AI-history persistence (the chat was always fully stateless there),
// so it stays that way rather than inventing a second storage model for it.
export const aiDb = {
  async saveMessage(userId: string, role: 'user' | 'assistant', content: string, hadFinancialContext: boolean): Promise<void> {
    if (useJson()) return; // no-op — dev-mode chat has always been stateless
    await sb().saveAiMessage(userId, role, content, hadFinancialContext);
  },
  async getHistory(userId: string, limit: number = 50) {
    if (useJson()) return [];
    return sb().getAiHistory(userId, limit);
  },
};

// Always Supabase-backed — no JSON mode. Push delivery has no meaning in the
// local JSON-store dev mode (see migrations/0012_push_tokens.sql).
export const pushDb = {
  registerPushToken: (userId: string, token: string, platform: 'ios' | 'android') =>
    sb().registerPushToken(userId, token, platform),
  unregisterPushToken: (userId: string, token: string) => sb().unregisterPushToken(userId, token),
  getPushTokensForUser: (userId: string) => sb().getPushTokensForUser(userId),
  deletePushTokenByValue: (token: string) => sb().deletePushTokenByValue(token),
};

// Always Supabase-backed — no JSON mode. See migrations/0013_server_error_log.sql.
export const errorLogDb = {
  logServerError: (entry: { route: string; severity: 'error' | 'warning'; userId: string | null; message: string; context?: Record<string, unknown> }) =>
    sb().logServerError(entry),
  listServerErrors: (page: number, pageSize: number) => sb().listServerErrors(page, pageSize),
};

// ── Meal catalog, meal plans, shopping lists ────────────────────────────────
// (JSON mode delegates straight to db.ts, which already speaks Meal/
// WeeklyMealPlan/ShoppingList natively; Supabase mode maps MealRecord/
// MealPlanRecord/ShoppingListRecord to the same frontend-facing shapes.)
export const contentDb = {
  async getMeals(requesterId?: string): Promise<Meal[]> {
    if (useJson()) return db.getMeals(requesterId);
    const rows = await sb().getMeals(requesterId);
    return rows.map(mapMealRecordToMeal);
  },

  async getMealById(id: string, requesterId?: string): Promise<Meal | undefined> {
    if (useJson()) return db.getMealById(id, requesterId);
    const r = await sb().getMealById(id, requesterId);
    return r ? mapMealRecordToMeal(r) : undefined;
  },

  // ownerId always comes from the verified session — never accepted from
  // the request body.
  async addMeal(ownerId: string, meal: Omit<Meal, 'id' | 'ownerId' | 'isCustom'>): Promise<Meal> {
    if (useJson()) {
      return db.addMeal({
        id: `meal_custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        ...meal,
        isCustom: true,
        ownerId,
      });
    }
    const r = await sb().addMeal(ownerId, meal);
    return mapMealRecordToMeal(r);
  },

  async deleteMeal(id: string, requesterId: string): Promise<boolean> {
    if (useJson()) return db.deleteMeal(id, requesterId);
    return sb().deleteMeal(id, requesterId);
  },

  async getSystemMealByName(name: string): Promise<Meal | undefined> {
    if (useJson()) return undefined; // JSON dev mode never needs the seed script
    const r = await sb().getSystemMealByName(name);
    return r ? mapMealRecordToMeal(r) : undefined;
  },

  async getMealPlan(userId: string, weekStartDate: string = getMondayOfCurrentWeek()): Promise<WeeklyMealPlan | undefined> {
    if (useJson()) return db.getMealPlan(userId, weekStartDate);
    const p = await sb().getMealPlan(userId, weekStartDate);
    if (!p) return undefined;
    const days = {} as WeeklyMealPlan['days'];
    for (const day of DAYS) {
      const d = p.days[day] ?? {};
      days[day] = {
        breakfast: d.breakfast ? mapMealRecordToMeal(d.breakfast) : (undefined as any),
        lunch: d.lunch ? mapMealRecordToMeal(d.lunch) : (undefined as any),
        dinner: d.dinner ? mapMealRecordToMeal(d.dinner) : (undefined as any),
        snack: d.snack ? mapMealRecordToMeal(d.snack) : undefined,
      };
    }
    return { id: p.id, userId: p.userId, householdId: p.householdId || '', weekStartDate: p.weekStartDate, days, createdAt: p.createdAt, isStarred: p.isStarred };
  },

  async saveMealPlan(plan: WeeklyMealPlan): Promise<WeeklyMealPlan> {
    if (useJson()) return db.saveMealPlan(plan);
    // meal_plans.household_id is a real FK to households(id) (a UUID). The
    // household object secureDb.getHousehold() hands back for display
    // purposes synthesizes a non-UUID id (`hh_${userId}`) rather than the
    // real households row id, so a synthetic/legacy id here must not be
    // forwarded — household_id isn't read back anywhere in the app, so NULL
    // is always safe.
    const isRealUuid = typeof plan.householdId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plan.householdId);
    const input = {
      id: plan.id, userId: plan.userId, householdId: isRealUuid ? plan.householdId : null, weekStartDate: plan.weekStartDate,
      days: Object.fromEntries(DAYS.map((day) => [day, {
        breakfast: plan.days[day]?.breakfast ? { id: plan.days[day].breakfast.id } : null,
        lunch: plan.days[day]?.lunch ? { id: plan.days[day].lunch.id } : null,
        dinner: plan.days[day]?.dinner ? { id: plan.days[day].dinner.id } : null,
        snack: plan.days[day]?.snack ? { id: plan.days[day].snack!.id } : null,
      }])) as any,
    };
    await sb().saveMealPlan(input);
    // Mirror db.saveMealPlan's side effect: regenerate + persist the shopping list.
    // Manually-added items (Phase 3B, item 10) must survive this regeneration
    // — the generator only ever knows about meal-plan ingredients, so any
    // source==='manual' row from the previous list is carried forward
    // alongside the freshly generated ones rather than being wiped by the
    // replace-all write contentDb.saveShoppingList still performs.
    const shoppingItems = generateShoppingItemsFromMealPlan(plan);
    const previousList = await contentDb.getShoppingList(plan.userId, plan.weekStartDate);
    const manualItems = (previousList?.items ?? []).filter((i) => i.source === 'manual');
    // contentDb.saveShoppingList runs everything through mergeShoppingItems
    // before persisting, so a manual item that names the same ingredient as
    // a freshly-generated one (e.g. user added "Pishori Rice" by hand, the
    // new plan also calls for "White Rice") merges into one row instead of
    // duplicating — the concat here is just "everything that should be
    // considered," not the final dedup pass.
    await contentDb.saveShoppingList({
      id: `sl_${plan.id}`, userId: plan.userId, weekStartDate: plan.weekStartDate,
      items: [...shoppingItems, ...manualItems], updatedAt: new Date().toISOString(),
    });
    const saved = await contentDb.getMealPlan(plan.userId, plan.weekStartDate);
    return saved || plan;
  },

  // ── Meal-Plan History / Anti-Repeat / Starring ───────────────────────────
  async getMealUsageHistory(userId: string, weeksBack: number, beforeWeekStartDate: string): Promise<{ mealId: string; count: number }[]> {
    if (useJson()) return db.getMealUsageHistory(userId, weeksBack, beforeWeekStartDate);
    return sb().getMealUsageHistory(userId, weeksBack, beforeWeekStartDate);
  },

  async getPreviousWeekMealIds(userId: string, beforeWeekStartDate: string): Promise<string[] | null> {
    if (useJson()) return db.getPreviousWeekMealIds(userId, beforeWeekStartDate);
    return sb().getPreviousWeekMealIds(userId, beforeWeekStartDate);
  },

  async setMealPlanStarred(userId: string, weekStartDate: string, starred: boolean): Promise<boolean> {
    if (useJson()) return db.setMealPlanStarred(userId, weekStartDate, starred);
    return sb().setMealPlanStarred(userId, weekStartDate, starred);
  },

  async getStarredMealIds(userId: string): Promise<Set<string>> {
    if (useJson()) return db.getStarredMealIds(userId);
    return sb().getStarredMealIds(userId);
  },

  async starMeal(userId: string, mealId: string): Promise<void> {
    if (useJson()) return db.starMeal(userId, mealId);
    return sb().starMeal(userId, mealId);
  },

  async unstarMeal(userId: string, mealId: string): Promise<void> {
    if (useJson()) return db.unstarMeal(userId, mealId);
    return sb().unstarMeal(userId, mealId);
  },

  async claimGenerationLock(userId: string, staleAfterMs: number): Promise<boolean> {
    if (useJson()) return db.claimGenerationLock(userId, staleAfterMs);
    return sb().claimGenerationLock(userId, staleAfterMs);
  },

  async releaseGenerationLock(userId: string): Promise<void> {
    if (useJson()) return db.releaseGenerationLock(userId);
    return sb().releaseGenerationLock(userId);
  },

  async getShoppingList(userId: string, weekStartDate: string = getMondayOfCurrentWeek()): Promise<ShoppingList | undefined> {
    if (useJson()) return db.getShoppingList(userId, weekStartDate);
    const l = await sb().getShoppingList(userId, weekStartDate);
    if (!l) return undefined;
    return {
      id: l.id, userId: l.userId, weekStartDate: l.weekStartDate, updatedAt: l.updatedAt,
      items: l.items.map((i) => ({
        id: i.id, name: i.name, category: i.category as ShoppingList['items'][0]['category'],
        quantity: i.quantity, unit: i.unit, estimatedPriceKsh: i.estimatedPriceKsh,
        isPurchased: i.isPurchased, frequency: i.frequency, source: i.source,
        canonicalKey: i.canonicalKey ?? undefined, variant: i.variant ?? undefined,
        isCompound: i.isCompound ?? undefined,
      })),
    };
  },

  // Every write funnels through here — the manual PUT route (server.ts) and
  // saveMealPlan's regenerate-and-persist step above both call this, so this
  // is the single chokepoint where mergeShoppingItems runs. Nothing should
  // ever bypass it to write shopping_list_items directly.
  async saveShoppingList(list: ShoppingList): Promise<ShoppingList> {
    const merged: MergeableItem[] = mergeShoppingItems(list.items.map((i) => ({
      id: i.id, name: i.name, category: i.category, quantity: i.quantity, unit: i.unit,
      estimatedPriceKsh: i.estimatedPriceKsh, actualPriceKsh: i.actualPriceKsh ?? null,
      isPurchased: i.isPurchased, frequency: i.frequency ?? 'weekly', source: i.source ?? 'generated',
    })));
    const mergedList: ShoppingList = { ...list, items: merged.map((i) => ({
      id: i.id || `shop_item_${Math.random().toString(36).slice(2)}`,
      name: i.name, category: i.category as ShoppingList['items'][0]['category'],
      quantity: i.quantity, unit: i.unit, estimatedPriceKsh: i.estimatedPriceKsh,
      actualPriceKsh: i.actualPriceKsh ?? undefined, isPurchased: i.isPurchased,
      frequency: i.frequency, source: i.source, canonicalKey: i.canonicalKey,
      variant: i.variant, isCompound: i.isCompound, quantityNote: i.quantityNote,
    })) };

    if (useJson()) return db.saveShoppingList(mergedList);

    const saved = await sb().saveShoppingList({
      id: mergedList.id, userId: mergedList.userId, weekStartDate: mergedList.weekStartDate,
      items: mergedList.items.map((i) => ({
        id: i.id, name: i.name, category: i.category, quantity: i.quantity, unit: i.unit,
        estimatedPriceKsh: i.estimatedPriceKsh, actualPriceKsh: i.actualPriceKsh ?? null,
        isPurchased: i.isPurchased, frequency: i.frequency ?? 'weekly', source: i.source ?? 'generated',
        canonicalKey: i.canonicalKey ?? null, unitGroup: undefined, variant: i.variant ?? null,
        isCompound: i.isCompound ?? false,
      })),
    });
    return {
      id: saved.id, userId: saved.userId, weekStartDate: saved.weekStartDate, updatedAt: saved.updatedAt,
      items: saved.items.map((i) => ({
        id: i.id, name: i.name, category: i.category as ShoppingList['items'][0]['category'],
        quantity: i.quantity, unit: i.unit, estimatedPriceKsh: i.estimatedPriceKsh,
        isPurchased: i.isPurchased, frequency: i.frequency, source: i.source,
        canonicalKey: i.canonicalKey ?? undefined, variant: i.variant ?? undefined,
        isCompound: i.isCompound ?? undefined,
      })),
    };
  },
};
