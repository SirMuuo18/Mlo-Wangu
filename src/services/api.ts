import {
  FoodItem,
  Meal,
  Household,
  WeeklyMealPlan,
  ShoppingList,
  WaterLog,
  WaterTargetConfig,
  UserBudget,
  Expense,
  UserProfile,
  Subscription,
  NotificationItem,
  OverspendingAnalysis,
} from '../types';

// The financial session is an HttpOnly cookie managed entirely by the server.
// The frontend never stores, reads, or sends the session token manually.
// These exports are kept for backward compatibility but are intentional no-ops.
export function setFinancialToken(_token: string | null) { /* cookie is server-managed */ }
export function getStoredFinancialToken(): null { return null; }
export function setAuthenticatedUserId(_userId: string) { /* server resolves user from session */ }

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // credentials:'include' ensures the HttpOnly mlo_fin_session cookie is sent
  // on same-origin requests — the browser handles this automatically.
  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error: any = new Error(errorData.error || `HTTP error ${response.status}`);
    error.status = response.status;
    error.budgetLocked = errorData.budgetLocked;
    error.code = errorData.code;
    throw error;
  }

  return response.json();
}

// API Methods
export const api = {
  // Auth & Profile
  getMe: () => request<{ user: UserProfile }>('/api/auth/me'),

  // Food & Meals
  getFoodItems: () => request<{ items: FoodItem[] }>('/api/food/items'),
  getMeals: (params?: { category?: string; costLevel?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.costLevel) query.set('costLevel', params.costLevel);
    if (params?.search) query.set('search', params.search);
    return request<{ meals: Meal[] }>(`/api/meals?${query.toString()}`);
  },
  getMealById: (id: string) => request<{ meal: Meal }>(`/api/meals/${id}`),
  createMeal: (mealData: Partial<Meal>) =>
    request<{ meal: Meal }>('/api/meals', {
      method: 'POST',
      body: JSON.stringify(mealData),
    }),
  deleteMeal: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/meals/${id}`, {
      method: 'DELETE',
    }),
  whatCanICook: (data: { budgetKsh: number; householdSize?: number; ingredients?: string[] }) =>
    request<{ budgetKsh: number; householdSize: number; matchedMealsCount: number; meals: (Meal & { scaledCostKsh: number; fitsBudget: boolean; savingsKsh: number; matchedIngredients: number })[] }>('/api/meals/what-can-i-cook', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Meal Planner
  getCurrentMealPlan: () => request<{ mealPlan: WeeklyMealPlan }>('/api/meal-plans/current'),
  updateMealPlan: (mealPlan: WeeklyMealPlan) =>
    request<{ mealPlan: WeeklyMealPlan }>('/api/meal-plans/current', {
      method: 'PUT',
      body: JSON.stringify({ mealPlan }),
    }),
  generateMealPlan: (options: { preferences?: string[]; budgetAware?: boolean }) =>
    request<{ mealPlan: WeeklyMealPlan }>('/api/meal-plans/generate', {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  swapMeal: (data: { day: string; mealType: string; currentMealId: string; reason?: 'cheaper' | 'faster' | 'random' }) =>
    request<{ mealPlan: WeeklyMealPlan; swappedMeal: Meal }>('/api/meal-plans/swap', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // "Generate New Plan" gate — KSh 50 payment or access code buys one new
  // generation. Viewing the current plan above is always free. The server
  // is the sole authority: this status check is only a UX shortcut to avoid
  // flashing the payment modal for users who already have an entitlement —
  // generateMealPlan() itself can still return 402 PAYMENT_REQUIRED.
  getGenerationEntitlementStatus: () =>
    request<{ hasEntitlement: boolean; priceKsh: number }>('/api/meal-plans/generation/entitlement-status'),
  sendGenerationMpesaStkPush: (phoneNumber: string) =>
    request<{ paymentId: string; status: string; amountKsh: number; message: string }>('/api/payments/mpesa/generation/stk-push', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),
  redeemAccessCode: (code: string) =>
    request<{ success: boolean; message: string }>('/api/meal-plans/generation/redeem-access-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  // Household
  getHousehold: () => request<{ household: Household }>('/api/household'),
  updateHousehold: (household: Household) =>
    request<{ household: Household }>('/api/household', {
      method: 'PUT',
      body: JSON.stringify({ household }),
    }),

  // Shopping List
  getShoppingList: () => request<{ shoppingList: ShoppingList }>('/api/shopping/current'),
  updateShoppingList: (shoppingList: ShoppingList) =>
    request<{ shoppingList: ShoppingList }>('/api/shopping/current', {
      method: 'PUT',
      body: JSON.stringify({ shoppingList }),
    }),

  // Water & Hydration
  getWaterData: () => request<{ waterLog: WaterLog; config: WaterTargetConfig; history: WaterLog[] }>('/api/water/today'),
  logWater: (amountMl: number) =>
    request<{ waterLog: WaterLog }>('/api/water/log', {
      method: 'POST',
      body: JSON.stringify({ amountMl }),
    }),
  updateWaterConfig: (config: WaterTargetConfig) =>
    request<{ config: WaterTargetConfig }>('/api/water/config', {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),

  // Financial Auth — cookie is set/cleared server-side; frontend just calls these endpoints
  setupBudgetPin: (pin: string, confirmPin?: string) =>
    request<{ success: boolean; message: string }>('/api/financial-auth/setup-pin', {
      method: 'POST',
      body: JSON.stringify({ pin, confirmPin }),
    }),
  unlockBudget: (pin: string) =>
    request<{ unlocked: boolean; message: string }>('/api/financial-auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
  lockBudget: () =>
    request<{ locked: boolean; message: string }>('/api/financial-auth/lock', {
      method: 'POST',
    }),
  checkFinancialStatus: () => request<{ isUnlocked: boolean }>('/api/financial-auth/status'),

  // Private Financial Data (requires valid HttpOnly session cookie)
  getBudget: (month?: string) => {
    const q = month ? `?month=${month}` : '';
    return request<{ budget: UserBudget }>(`/api/financial/budget${q}`);
  },
  updateBudget: (budget: UserBudget) =>
    request<{ budget: UserBudget; validation: { totalAllocatedKsh: number; differenceKsh: number; status: string; message: string } }>('/api/financial/budget', {
      method: 'PUT',
      body: JSON.stringify({ budget }),
    }),
  getExpenses: (month?: string) => {
    const q = month ? `?month=${month}` : '';
    return request<{ expenses: Expense[] }>(`/api/financial/expenses${q}`);
  },
  addExpense: (data: { amountKsh: number; category: string; description: string; date?: string }) =>
    request<{ expense: Expense }>('/api/financial/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteExpense: (id: string) =>
    request<{ success: boolean }>(`/api/financial/expenses/${id}`, {
      method: 'DELETE',
    }),
  getFinancialSummary: (month?: string) => {
    const q = month ? `?month=${month}` : '';
    return request<{
      month: string;
      totalIncomeKsh: number;
      totalSpentKsh: number;
      remainingKsh: number;
      savingsRatePercent: number;
      categoryBreakdown: Record<string, { planned: number; spent: number; color: string }>;
      recentExpenses: Expense[];
      analysis: OverspendingAnalysis;
    }>(`/api/financial/summary${q}`);
  },

  // AI Assistant
  askAI: (message: string) =>
    request<{ reply: string; provider: string }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  // Payments & Subscription — Premium only ever activates from the server's
  // own verified Daraja callback. The frontend never asserts success; it
  // polls /api/payments/:id for the server's actual recorded status.
  sendMpesaStkPush: (phoneNumber: string, planType: 'weekly' | 'monthly') =>
    request<{ paymentId: string; status: string; amountKsh: number; planType: string; message: string }>('/api/payments/mpesa/stk-push', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, planType }),
    }),
  getPaymentStatus: (paymentId: string) =>
    request<{ payment: { id: string; status: 'pending' | 'success' | 'failed' | 'cancelled' | 'expired'; amountKsh: number; planType: string; createdAt: string; verifiedAt: string | null; mpesaReceipt: string | null } }>(`/api/payments/${paymentId}`),
  getSubscriptionStatus: () => request<{ isPremium: boolean; subscription?: Subscription | null }>('/api/subscription/status'),

  // Notifications
  getNotifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  markNotificationRead: (id: string) => request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),

  // Admin & Audit
  getAdminStats: () => request<any>('/api/admin/stats'),
  updateFoodPrice: (id: string, priceKsh: number, region?: string) =>
    request<{ foodItem: FoodItem }>(`/api/admin/food-items/${id}/price`, {
      method: 'PUT',
      body: JSON.stringify({ priceKsh, region }),
    }),
  runSecurityAudit: () => request<{ auditPassed: boolean; testsCount: number; results: any[]; timestamp: string }>('/api/admin/security-audit'),
};
