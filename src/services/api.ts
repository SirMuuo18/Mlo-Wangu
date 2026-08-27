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

export interface ReminderConfig {
  id: string;
  type: 'shopping_day' | 'custom';
  label: string;
  time: string;
  daysOfWeek: string[];
  enabled: boolean;
}

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
  updateProfileName: (name: string) =>
    request<{ user: { id: string; name: string } | null }>('/api/profile', { method: 'PUT', body: JSON.stringify({ name }) }),
  changeEmail: (newEmail: string, currentPassword: string) =>
    request<{ success: boolean; message: string }>('/api/profile/change-email', {
      method: 'POST', body: JSON.stringify({ newEmail, currentPassword }),
    }),
  // Phase 3B, items 8/9. Export returns the full structured JSON as-is —
  // the caller decides how to present/save it (a file download, in this
  // component's case). Deletion requires the exact server contract:
  // currentPassword + confirmation === 'DELETE'.
  exportAccountData: () => request<Record<string, unknown>>('/api/account/export'),
  deleteAccount: (currentPassword: string) =>
    request<{ success: boolean; message: string }>('/api/account/delete', {
      method: 'POST', body: JSON.stringify({ currentPassword, confirmation: 'DELETE' }),
    }),

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

  // M-Pesa Till (Buy Goods) manual-entry payment — alternative to STK push
  // for both Premium and the generation gate. Never auto-verified; always
  // lands as a 'pending' payment awaiting admin confirmation.
  getTillInfo: () => request<{ tillNumber: string }>('/api/payments/mpesa/till-info'),
  // mpesaMessage is the FULL pasted M-Pesa confirmation SMS — the server
  // extracts the transaction code from it, never trusting a client-parsed code.
  submitTillPayment: (planType: 'weekly' | 'monthly' | 'meal_plan_generation', phoneNumber: string, mpesaMessage: string) =>
    request<{ paymentId: string; status: string; amountKsh: number; message: string }>('/api/payments/mpesa/till-submit', {
      method: 'POST',
      body: JSON.stringify({ planType, phoneNumber, mpesaMessage }),
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
  getAiHistory: () =>
    request<{ history: Array<{ id: string; role: 'user' | 'assistant'; content: string; hadFinancialContext: boolean; createdAt: string }> }>('/api/ai/history'),

  // Payments & Subscription — Premium only ever activates from the server's
  // own verified Daraja callback. The frontend never asserts success; it
  // polls /api/payments/:id for the server's actual recorded status.
  sendMpesaStkPush: (phoneNumber: string, planType: 'weekly' | 'monthly') =>
    request<{ paymentId: string; status: string; amountKsh: number; planType: string; message: string }>('/api/payments/mpesa/stk-push', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, planType }),
    }),
  getPaymentStatus: (paymentId: string) =>
    request<{ payment: { id: string; status: 'pending' | 'success' | 'failed' | 'cancelled' | 'expired' | 'rejected'; amountKsh: number; planType: string; createdAt: string; verifiedAt: string | null; mpesaReceipt: string | null; rejectionReason: string | null; isStale: boolean } }>(`/api/payments/${paymentId}`),
  getSubscriptionStatus: () => request<{ isPremium: boolean; subscription?: Subscription | null }>('/api/subscription/status'),

  // Notifications
  getNotifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  // Custom & shopping-day reminders (Phase 3B, item 2) — config only; web
  // has no local-notification delivery mechanism, so this manages the
  // config that mobile actually schedules from.
  getReminders: () => request<{ reminders: ReminderConfig[] }>('/api/reminders'),
  createReminder: (input: { type: 'shopping_day' | 'custom'; label: string; time: string; daysOfWeek: string[] }) =>
    request<{ id: string }>('/api/reminders', { method: 'POST', body: JSON.stringify(input) }),
  updateReminder: (id: string, patch: { label?: string; time?: string; daysOfWeek?: string[]; enabled?: boolean }) =>
    request<{ success: boolean }>(`/api/reminders/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteReminder: (id: string) =>
    request<{ success: boolean }>(`/api/reminders/${id}`, { method: 'DELETE' }),
  markNotificationRead: (id: string) => request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),

  // Admin & Audit
  getAdminStats: () => request<any>('/api/admin/stats'),
  updateFoodPrice: (id: string, priceKsh: number, region?: string) =>
    request<{ foodItem: FoodItem }>(`/api/admin/food-items/${id}/price`, {
      method: 'PUT',
      body: JSON.stringify({ priceKsh, region }),
    }),
  runSecurityAudit: () => request<{ auditPassed: boolean; testsCount: number; results: any[]; timestamp: string }>('/api/admin/security-audit'),

  // Admin & Customer Support Console — every call below hits a route gated
  // by requireAuth + requireAdmin server-side; the frontend enforces nothing.
  getAdminDashboard: () => request<AdminDashboardStats>('/api/admin/dashboard'),
  searchAdminUsers: (query: string, page = 1, pageSize = 20) =>
    request<AdminUserListResult>(`/api/admin/users?query=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`),
  getAdminUserDetail: (userId: string) => request<AdminUserDetail>(`/api/admin/users/${userId}`),
  sendAdminPasswordReset: (userId: string) =>
    request<{ message: string }>(`/api/admin/users/${userId}/send-password-reset`, { method: 'POST' }),
  getAdminPayments: (status?: string, page = 1, pageSize = 20) =>
    request<AdminPaymentListResult>(`/api/admin/payments?${status ? `status=${status}&` : ''}page=${page}&pageSize=${pageSize}`),
  confirmAdminPayment: (paymentId: string) =>
    request<{ success: boolean; message: string }>(`/api/admin/payments/${paymentId}/confirm`, { method: 'POST' }),
  verifyTillPayment: (paymentId: string) =>
    request<{ success: boolean; accessCodeId: string; code: string | null; expiresAt: string | null; alreadyVerified: boolean }>(
      `/api/admin/payments/${paymentId}/verify-till`, { method: 'POST' }
    ),
  rejectTillPayment: (paymentId: string, reason: string) =>
    request<{ success: boolean }>(`/api/admin/payments/${paymentId}/reject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
  resendAccessCodeEmail: (paymentId: string) =>
    request<{ success: boolean; mode: 'resent_existing' | 'reissued_new' }>(
      `/api/admin/payments/${paymentId}/resend-code-email`, { method: 'POST' }
    ),
  getAdminAccessCodes: (status?: string, page = 1, pageSize = 20) =>
    request<AdminAccessCodeListResult>(`/api/admin/access-codes?${status ? `status=${status}&` : ''}page=${page}&pageSize=${pageSize}`),
  issueAdminAccessCode: (userId: string, description?: string) =>
    request<{ success: boolean; accessCodeId: string; code: string; expiresAt: string | null }>('/api/admin/access-codes/issue', {
      method: 'POST',
      body: JSON.stringify({ userId, description }),
    }),
  cancelAdminAccessCode: (id: string) =>
    request<{ success: boolean }>(`/api/admin/access-codes/${id}/cancel`, { method: 'POST' }),
  getSupportNotes: (userId: string) => request<{ notes: SupportNote[] }>(`/api/admin/support-notes/${userId}`),
  getAllSupportNotes: (resolved?: boolean, page = 1, pageSize = 20) =>
    request<{ notes: (SupportNote & { userLabel: string })[]; total: number; page: number; pageSize: number }>(
      `/api/admin/support-notes?${resolved !== undefined ? `resolved=${resolved}&` : ''}page=${page}&pageSize=${pageSize}`
    ),
  createSupportNote: (data: { userId: string; issue: string; actionTaken?: string; resolution?: string; resolved?: boolean }) =>
    request<{ note: SupportNote }>('/api/admin/support-notes', { method: 'POST', body: JSON.stringify(data) }),
  resolveSupportNote: (noteId: string, resolution?: string) =>
    request<{ note: SupportNote }>(`/api/admin/support-notes/${noteId}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) }),
  getAdminAuditLog: (targetUserId?: string, page = 1, pageSize = 20) =>
    request<AdminAuditLogResult>(`/api/admin/audit-log?${targetUserId ? `targetUserId=${targetUserId}&` : ''}page=${page}&pageSize=${pageSize}`),
};

// ── Admin console types ──────────────────────────────────────────────────────
export interface AdminDashboardStats {
  totalUsers: number;
  newUsersLast7Days: number;
  activeUsersLast30Days: number;
  premiumUsers: number;
  usersWithActiveMealPlanAccess: number;
  pendingPayments: number;
  confirmedPayments: number;
  activeAccessCodes: number;
  expiredAccessCodes: number;
  recentRegistrations: { id: string; name: string; email: string | null; created_at: string }[];
  recentPayments: { id: string; user_id: string; amount_ksh: number; plan_type: string; status: string; created_at: string }[];
  recentSupportActions: { id: string; admin_id: string; action: string; target_user_id: string | null; result: string; created_at: string }[];
}

export interface AdminUserSummary {
  id: string; name: string; email: string | null; role: 'user' | 'admin';
  hasBudgetPin: boolean; createdAt: string; premiumActive: boolean; hasActiveMealPlanAccess: boolean;
}
export interface AdminUserListResult { users: AdminUserSummary[]; total: number; page: number; pageSize: number; }

export interface AdminUserDetail {
  account: { id: string; name: string; email: string | null; role: string; createdAt: string; onboardingComplete: boolean; status: 'active' };
  mealPlan: {
    hasActiveMealPlanAccess: boolean;
    entitlements: { id: string; source: string; createdAt: string; expiresAt: string | null; usedAt: string | null }[];
    accessCodes: { id: string; status: string; maxUses: number; usedCount: number; expiresAt: string; createdAt: string; description: string | null }[];
  };
  payments: { id: string; amountKsh: number; phoneNumber: string; planType: string; status: string; paymentMethod: 'stk_push' | 'till_manual'; mpesaReceipt: string | null; mpesaRawMessage: string | null; createdAt: string; verifiedAt: string | null }[];
  subscription: { planType: string; priceKsh: number; status: string; startDate: string | null; endDate: string | null } | null;
  household: { id: string; name: string; memberCount: number } | null;
  recentNotifications: AdminUserNotification[];
}

export interface AdminPaymentRow {
  id: string; userId: string; userEmail: string | null; amountKsh: number; phoneNumber: string;
  planType: string; status: string; paymentMethod: 'stk_push' | 'till_manual'; mpesaReceipt: string | null; mpesaRawMessage: string | null; createdAt: string; verifiedAt: string | null;
}
export interface AdminUserNotification { id: string; title: string; type: string; isRead: boolean; createdAt: string; }
export interface AdminPaymentListResult { payments: AdminPaymentRow[]; total: number; page: number; pageSize: number; }

export interface AdminAccessCodeRow {
  id: string; userId: string | null; userEmail: string | null; maxUses: number; usedCount: number;
  expiresAt: string; createdAt: string; description: string | null; status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';
}
export interface AdminAccessCodeListResult { codes: AdminAccessCodeRow[]; total: number; page: number; pageSize: number; }

export interface SupportNote {
  id: string; user_id: string; admin_id: string; issue: string; action_taken: string | null;
  resolution: string | null; resolved: boolean; created_at: string; updated_at: string;
}

export interface AdminAuditLogEntry {
  id: string; admin_id: string; action: string; target_user_id: string | null;
  metadata: Record<string, unknown>; result: 'success' | 'failure'; created_at: string;
}
export interface AdminAuditLogResult { entries: AdminAuditLogEntry[]; total: number; page: number; pageSize: number; }
