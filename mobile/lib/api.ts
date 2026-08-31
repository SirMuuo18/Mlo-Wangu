// The one client → server contract, mirroring src/services/api.ts's shape
// (method names, request/response types) but attaching a Supabase Bearer
// token instead of relying on a browser cookie jar. Every method here calls
// the SAME Express routes the web app calls — no endpoint here reimplements
// server-side business logic (auth verification, ownership, entitlement
// gating, financial math all stay server-side).
import { supabase } from './supabase';
import type { AuthUser } from '../types/auth';
import type {
  Meal, WeeklyMealPlan, FoodItem, Household, ShoppingList, WaterLog,
  WaterTargetConfig, UserBudget, Expense, OverspendingAnalysis, NotificationItem,
} from '../types/domain';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
if (!API_BASE_URL) {
  throw new Error('Missing EXPO_PUBLIC_API_BASE_URL. Copy mobile/.env.example to mobile/.env and set it.');
}

export class ApiError extends Error {
  status: number;
  code?: string;
  budgetLocked?: boolean;

  constructor(message: string, status: number, extra?: { code?: string; budgetLocked?: boolean }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = extra?.code;
    this.budgetLocked = extra?.budgetLocked;
  }
}

interface RequestOptions extends RequestInit {
  // Attaches X-Financial-Session for the handful of /api/financial/* routes
  // that will be wired up once the Budget PIN UI is built (Section 20 of the
  // audit) — not used by anything in this phase, but the plumbing point
  // belongs here, next to the one place Authorization is already attached,
  // not duplicated per-call-site later.
  financialToken?: string;
}

// Reads the token from the ACTIVE Supabase session on every call rather than
// caching it in a module variable — supabase-js's own getSession() already
// transparently refreshes an expiring token, so this is always the freshest
// valid token without this file needing to duplicate that logic.
async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { financialToken, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };

  const accessToken = await getAccessToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (financialToken) headers['X-Financial-Session'] = financialToken;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...init, headers });
  } catch {
    // Never leak the raw network error (may contain the base URL/host) into
    // a user-facing message — a generic, actionable message is enough.
    throw new ApiError('Unable to reach the server. Check your connection and try again.', 0);
  }

  if (!response.ok) {
    let body: { error?: string; code?: string; budgetLocked?: boolean } = {};
    try {
      body = await response.json();
    } catch {
      // Non-JSON error body (e.g. a proxy/edge error page) — fall through to the generic message below.
    }
    throw new ApiError(body.error || `Request failed (${response.status})`, response.status, {
      code: body.code,
      budgetLocked: body.budgetLocked,
    });
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  // ── Auth & Profile ─────────────────────────────────────────────────────
  // Registration goes through the Express route (not supabase.auth.signUp())
  // because this is the ONLY path that creates an account with
  // email_confirm:true server-side (service-role key) — the app has no
  // email-confirmation-link landing page, so a Supabase-side signUp() would
  // create a permanently unconfirmable account. See server.ts's own comment
  // on this route.
  register: (email: string, password: string, name: string) =>
    request<{ message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  getMe: () => request<{ user: AuthUser }>('/api/auth/me'),
  updateProfileName: (name: string) =>
    request<{ user: { id: string; name: string } | null }>('/api/profile', { method: 'PUT', body: JSON.stringify({ name }) }),
  changeEmail: (newEmail: string, currentPassword: string) =>
    request<{ success: boolean; message: string }>('/api/profile/change-email', {
      method: 'POST', body: JSON.stringify({ newEmail, currentPassword }),
    }),
  // Phase 3B, items 8/9. Same server contract as the web client — no
  // second data model, no new endpoints.
  exportAccountData: (financialToken?: string) => request<Record<string, unknown>>('/api/account/export', { financialToken }),
  deleteAccount: (currentPassword: string) =>
    request<{ success: boolean; message: string }>('/api/account/delete', {
      method: 'POST', body: JSON.stringify({ currentPassword, confirmation: 'DELETE' }),
    }),

  completeOnboarding: (data: { hasBudget?: boolean; monthlyIncomeKsh?: number }) =>
    request<{ ok: boolean }>('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Food & Meals (catalog is public; custom meals are owner-scoped server-side) ──
  getFoodItems: () => request<{ items: FoodItem[] }>('/api/food/items'),
  getMeals: (params?: { category?: string; costLevel?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.costLevel) query.set('costLevel', params.costLevel);
    if (params?.search) query.set('search', params.search);
    return request<{ meals: Meal[] }>(`/api/meals?${query.toString()}`);
  },
  getMealById: (id: string) => request<{ meal: Meal }>(`/api/meals/${id}`),
  whatCanICook: (data: { budgetKsh: number; householdSize?: number; ingredients?: string[] }) =>
    request<{
      budgetKsh: number; isNoLimit: boolean; householdSize: number; matchedMealsCount: number;
      meals: (Meal & { scaledCostKsh: number; fitsBudget: boolean; savingsKsh: number; matchedIngredients: number })[];
    }>('/api/meals/what-can-i-cook', { method: 'POST', body: JSON.stringify(data) }),

  // ── Meal Planner ──────────────────────────────────────────────────────────
  getCurrentMealPlan: () => request<{ mealPlan: WeeklyMealPlan | null }>('/api/meal-plans/current'),
  // Gated server-side — a 402 with code:'PAYMENT_REQUIRED' means no
  // entitlement/Premium exists; the UI must show the payment/access-code
  // path, never assume/create local access.
  generateMealPlan: () =>
    request<{ mealPlan: WeeklyMealPlan; householdSize: number; weeklyFoodBudgetKsh: number | null }>(
      '/api/meal-plans/generate', { method: 'POST', body: JSON.stringify({}) }
    ),
  swapMeal: (data: { day: string; mealType: string; currentMealId: string; reason?: 'cheaper' | 'faster' | 'random' }) =>
    request<{ mealPlan: WeeklyMealPlan; swappedMeal: Meal }>('/api/meal-plans/swap', {
      method: 'POST', body: JSON.stringify(data),
    }),
  starMealPlanWeek: (weekStartDate: string) =>
    request<{ success: boolean }>(`/api/meal-plans/${weekStartDate}/star`, { method: 'POST' }),
  unstarMealPlanWeek: (weekStartDate: string) =>
    request<{ success: boolean }>(`/api/meal-plans/${weekStartDate}/star`, { method: 'DELETE' }),
  getStarredMeals: () => request<{ mealIds: string[] }>('/api/meals/starred'),
  starMeal: (mealId: string) => request<{ success: boolean }>(`/api/meals/${mealId}/star`, { method: 'POST' }),
  unstarMeal: (mealId: string) => request<{ success: boolean }>(`/api/meals/${mealId}/star`, { method: 'DELETE' }),
  getGenerationEntitlementStatus: () =>
    request<{ hasEntitlement: boolean; priceKsh: number }>('/api/meal-plans/generation/entitlement-status'),
  // Same opaque error message on any failure reason, reproduced as-is,
  // never elaborated on client-side (a wrong/expired/exhausted code all
  // look identical to the caller, exactly like web).
  redeemAccessCode: (code: string) =>
    request<{ success: boolean; message: string }>('/api/meal-plans/generation/redeem-access-code', {
      method: 'POST', body: JSON.stringify({ code }),
    }),

  // ── M-Pesa Till payment (meal-plan generation gate) ─────────────────────
  // Till/manual-entry only — no STK push (disabled on web too, "while the
  // Daraja app is pending" per server.ts's own GeneratePlanModal-adjacent
  // comment) and no M-Pesa secret of any kind ever touches this client.
  // A submission here is never auto-verified; it always waits on an admin
  // and is polled via getPaymentStatus below.
  getTillInfo: () => request<{ tillNumber: string }>('/api/payments/mpesa/till-info'),
  submitTillPayment: (planType: 'meal_plan_generation', phoneNumber: string, mpesaMessage: string) =>
    request<{ paymentId: string; status: string; amountKsh: number; message: string }>('/api/payments/mpesa/till-submit', {
      method: 'POST', body: JSON.stringify({ planType, phoneNumber, mpesaMessage }),
    }),
  getPaymentStatus: (paymentId: string) =>
    request<{ payment: { id: string; status: 'pending' | 'success' | 'failed' | 'cancelled' | 'expired' | 'rejected'; amountKsh: number; planType: string; createdAt: string; verifiedAt: string | null; mpesaReceipt: string | null; rejectionReason: string | null; isStale: boolean } }>(`/api/payments/${paymentId}`),

  // ── Household ─────────────────────────────────────────────────────────────
  getHousehold: () => request<{ household: Household }>('/api/household'),
  updateHousehold: (household: Household) =>
    request<{ household: Household }>('/api/household', { method: 'PUT', body: JSON.stringify({ household }) }),

  // ── Shopping List ─────────────────────────────────────────────────────────
  getShoppingList: () => request<{ shoppingList: ShoppingList | null }>('/api/shopping/current'),
  updateShoppingList: (shoppingList: ShoppingList) =>
    request<{ shoppingList: ShoppingList }>('/api/shopping/current', { method: 'PUT', body: JSON.stringify({ shoppingList }) }),
  checkShoppingDuplicate: (name: string) =>
    request<{ duplicate: boolean; canonicalName?: string; existingItem?: { name: string; quantity: number; unit: string } }>(
      `/api/shopping/check-duplicate?name=${encodeURIComponent(name)}`
    ),

  // ── Water & Hydration ─────────────────────────────────────────────────────
  getWaterData: () => request<{ waterLog: WaterLog; config: WaterTargetConfig; history: WaterLog[] }>('/api/water/today'),
  logWater: (amountMl: number) => request<{ waterLog: WaterLog }>('/api/water/log', { method: 'POST', body: JSON.stringify({ amountMl }) }),

  // ── Financial Auth (Budget PIN) ───────────────────────────────────────────
  // setupPin/unlock return `financialToken` in the body specifically because
  // this client always authenticates as 'bearer' (see server/auth-
  // middleware.ts's res.locals.authMethod) — never present for a cookie caller.
  setupBudgetPin: (pin: string, confirmPin: string) =>
    request<{ success: boolean; message: string; financialToken?: string }>('/api/financial-auth/setup-pin', {
      method: 'POST', body: JSON.stringify({ pin, confirmPin }),
    }),
  unlockBudget: (pin: string) =>
    request<{ unlocked: boolean; message: string; financialToken?: string; lockedUntilSeconds?: number }>('/api/financial-auth/unlock', {
      method: 'POST', body: JSON.stringify({ pin }),
    }),
  lockBudget: (financialToken: string) =>
    request<{ locked: boolean }>('/api/financial-auth/lock', { method: 'POST', financialToken }),
  checkFinancialStatus: (financialToken: string) =>
    request<{ isUnlocked: boolean }>('/api/financial-auth/status', { financialToken }),

  // ── Private Financial Data (requires a valid financial session token) ────
  getBudget: (financialToken: string, month?: string) =>
    request<{ budget: UserBudget | null }>(`/api/financial/budget${month ? `?month=${month}` : ''}`, { financialToken }),
  updateBudget: (financialToken: string, budget: UserBudget) =>
    request<{ budget: UserBudget; validation: { totalAllocatedKsh: number; differenceKsh: number; status: string; message: string } }>(
      '/api/financial/budget', { method: 'PUT', financialToken, body: JSON.stringify({ budget }) }
    ),
  getExpenses: (financialToken: string, month?: string) =>
    request<{ expenses: Expense[] }>(`/api/financial/expenses${month ? `?month=${month}` : ''}`, { financialToken }),
  addExpense: (financialToken: string, data: { amountKsh: number; category: string; description: string; date?: string }) =>
    request<{ expense: Expense }>('/api/financial/expenses', { method: 'POST', financialToken, body: JSON.stringify(data) }),
  deleteExpense: (financialToken: string, id: string) =>
    request<{ success: boolean }>(`/api/financial/expenses/${id}`, { method: 'DELETE', financialToken }),
  getFinancialSummary: (financialToken: string, month?: string) =>
    request<{
      month: string; totalIncomeKsh: number; totalSpentKsh: number; remainingKsh: number; savingsRatePercent: number;
      categoryBreakdown: Record<string, { planned: number; spent: number; color: string }>;
      recentExpenses: Expense[]; analysis: OverspendingAnalysis;
    }>(`/api/financial/summary${month ? `?month=${month}` : ''}`, { financialToken }),

  // ── Notifications ─────────────────────────────────────────────────────────
  // Strictly owner-scoped server-side (RLS + app-layer check, audited
  // separately) — this client never filters/trusts ownership itself.
  getNotifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  markNotificationRead: (id: string) => request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),
  registerPushToken: (token: string, platform: 'ios' | 'android') =>
    request<{ success: boolean }>('/api/push/register', { method: 'POST', body: JSON.stringify({ token, platform }) }),
  unregisterPushToken: (token: string) =>
    request<{ success: boolean }>('/api/push/unregister', { method: 'POST', body: JSON.stringify({ token }) }),

  // ── AI Assistant ──────────────────────────────────────────────────────────
  // The Gemini API key never leaves the server. Financial context is
  // injected server-side ONLY when a valid financial session accompanies
  // the request (see requireAuth/server.ts's /api/ai/chat) — attach
  // X-Financial-Session here only when the caller is actually unlocked;
  // never send financial data merely because it exists on the device.
  askAI: (message: string, financialToken?: string) =>
    request<{ reply: string; provider: string }>('/api/ai/chat', {
      method: 'POST', financialToken, body: JSON.stringify({ message }),
    }),
  getAiHistory: () =>
    request<{ history: Array<{ id: string; role: 'user' | 'assistant'; content: string; hadFinancialContext: boolean; createdAt: string }> }>('/api/ai/history'),

  // Custom & shopping-day reminders (Phase 3B, item 2) — config only; local
  // delivery is handled entirely by mobile/lib/reminders.ts.
  getReminders: () =>
    request<{ reminders: ReminderConfig[] }>('/api/reminders'),
  createReminder: (input: { type: 'shopping_day' | 'custom'; label: string; time: string; daysOfWeek: string[] }) =>
    request<{ id: string }>('/api/reminders', { method: 'POST', body: JSON.stringify(input) }),
  updateReminder: (id: string, patch: { label?: string; time?: string; daysOfWeek?: string[]; enabled?: boolean }) =>
    request<{ success: boolean }>(`/api/reminders/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteReminder: (id: string) =>
    request<{ success: boolean }>(`/api/reminders/${id}`, { method: 'DELETE' }),
};

export interface ReminderConfig {
  id: string;
  type: 'shopping_day' | 'custom';
  label: string;
  time: string;
  daysOfWeek: string[];
  enabled: boolean;
}
