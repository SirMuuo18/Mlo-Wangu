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

let currentFinancialToken: string | null = null;
let currentUserId: string = 'usr_mwangi_demo';

export function setFinancialToken(token: string | null) {
  currentFinancialToken = token;
  if (token) {
    sessionStorage.setItem('mlo_financial_token', token);
  } else {
    sessionStorage.removeItem('mlo_financial_token');
  }
}

export function getStoredFinancialToken(): string | null {
  if (!currentFinancialToken) {
    currentFinancialToken = sessionStorage.getItem('mlo_financial_token');
  }
  return currentFinancialToken;
}

export function setAuthenticatedUserId(userId: string) {
  currentUserId = userId;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': currentUserId,
    ...(options.headers as Record<string, string> || {}),
  };

  const finToken = getStoredFinancialToken();
  if (finToken) {
    headers['x-financial-token'] = finToken;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
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

  // Financial Auth
  setupBudgetPin: (pin: string) =>
    request<{ success: boolean; message: string; financialToken: string }>('/api/financial-auth/setup-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
  unlockBudget: (pin: string, timeoutMinutes = 15) =>
    request<{ unlocked: boolean; financialToken: string; message: string }>('/api/financial-auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ pin, timeoutMinutes }),
    }),
  lockBudget: () =>
    request<{ locked: boolean; message: string }>('/api/financial-auth/lock', {
      method: 'POST',
    }),
  checkFinancialStatus: () => request<{ isUnlocked: boolean; userId: string }>('/api/financial-auth/status'),

  // Private Financial Data (Requires Financial Token)
  getBudget: (month?: string) => {
    const q = month ? `?month=${month}` : '';
    return request<{ budget: UserBudget }>(`/api/financial/budget${q}`);
  },
  updateBudget: (budget: UserBudget) =>
    request<{ budget: UserBudget }>('/api/financial/budget', {
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

  // Payments & Subscription
  sendMpesaStkPush: (phoneNumber: string, planType: 'weekly' | 'monthly') =>
    request<{ success: boolean; checkoutRequestId: string; message: string; amountKsh: number }>('/api/payments/mpesa/stk-push', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, planType }),
    }),
  verifyMpesaPayment: (checkoutRequestId: string, planType: 'weekly' | 'monthly', phoneNumber: string) =>
    request<{ verified: boolean; subscription: Subscription; message: string }>('/api/payments/mpesa/verify', {
      method: 'POST',
      body: JSON.stringify({ checkoutRequestId, planType, phoneNumber }),
    }),
  getSubscriptionStatus: () => request<{ isPremium: boolean; subscription?: Subscription }>('/api/subscription/status'),

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
  runSecurityAudit: () => request<{ auditPassed: boolean; testsCount: number; results: any[]; timestamp: string }>('/api/security-audit/run'),
};
