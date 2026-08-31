// Database adapter interface — shared by JSON (dev) and Supabase (production) adapters.
// All userId parameters are verified server-side auth IDs, never client-provided.

export interface UserProfile {
  id: string;
  name: string;
  email?: string | null;
  role: 'user' | 'admin';
  hasBudgetPin: boolean;
  isPremium: boolean;
  premiumExpiry?: string | null;
  onboardingComplete: boolean;
  pinFailedAttempts: number;
  pinLockedUntil: number | null;  // epoch ms
  budgetDigestEnabled?: boolean;
  budgetDigestLastSentAt?: string | null;
}

export interface FinancialSession {
  token: string;
  userId: string;
  expiresAt: number;  // epoch ms
}

export interface BudgetCategory {
  category: string;
  plannedAmountKsh: number;
  color: string;
}

export interface Budget {
  monthlyIncomeKsh: number;
  incomeType: 'monthly' | 'weekly' | 'daily';
  month: string;  // 'YYYY-MM'
  categories: BudgetCategory[];
}

export interface Expense {
  id: string;
  userId: string;
  amountKsh: number;
  category: string;
  description: string;
  expenseDate: string;  // 'YYYY-MM-DD'
  createdAt: string;
}

export interface HouseholdMember {
  id: string;
  name: string;
  ageGroup: 'adult' | 'teen' | 'child' | 'infant';
  preferences: string[];
  allergies: string[];
  dislikes: string[];
  nutritionGoals?: string;
}

export interface WaterConfig {
  dailyTargetMl: number;
  glassSizeMl: number;
  reminderFrequencyMinutes: number;
  remindersEnabled: boolean;
  reminderSchedule: string[];
}

export interface WaterLog {
  date: string;       // 'YYYY-MM-DD'
  totalMl: number;
  targetMl: number;
  entries: { loggedAt: string; amountMl: number }[];
}

export interface PinLockoutStatus {
  isLocked: boolean;
  lockedUntilMs: number | null;
  failedAttempts: number;
}

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'expired' | 'rejected';

// 'meal_plan_generation' is a one-off KSh 50 purchase (the "Generate New
// Plan" gate) — distinct from the 'weekly'/'monthly' subscription plans and
// never linked to a subscription row.
export type PaymentPlanType = 'weekly' | 'monthly' | 'meal_plan_generation';

export type PaymentMethod = 'stk_push' | 'till_manual';

export interface PaymentRecord {
  id: string;
  userId: string;
  subscriptionId: string | null;
  amountKsh: number;
  phoneNumber: string;
  planType: PaymentPlanType;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  mpesaReceipt: string | null;
  // Full pasted M-Pesa confirmation SMS for a till_manual submission — the
  // code itself is still extracted into mpesaReceipt above. Null for
  // stk_push payments.
  mpesaRawMessage: string | null;
  resultDesc: string | null;
  createdAt: string;
  verifiedAt: string | null;
  // Set only by the admin Till-verification/rejection actions
  // (verifyTillPayment/rejectTillPayment in admin-db.ts) — null for every
  // other payment (STK-verified via the real Daraja callback never sets
  // these; a client can never set them either way).
  verifiedBy: string | null;
  rejectionReason: string | null;
}

// ── "Generate New Plan" gate ────────────────────────────────────────────────
export interface AccessCodeRecord {
  id: string;
  active: boolean;
  createdAt: string;
  // Database-authoritative — always set, always at most 7 days after
  // createdAt (enforced by the cap_access_code_expiry trigger). Never
  // trust/accept a client-supplied value for this field.
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  userId: string | null;
  // Set only when this code was issued by the Till-verification flow
  // (verifyTillPayment in admin-db.ts) — null for a manually-issued support
  // code. A payment can back at most one access code (unique partial index).
  paymentId: string | null;
}

export interface EntitlementRecord {
  id: string;
  userId: string;
  source: 'payment' | 'access_code';
  paymentId: string | null;
  accessCodeId: string | null;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planType: 'weekly' | 'monthly';
  priceKsh: number;
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  startDate: string | null;
  endDate: string | null;
  mpesaReceipt: string | null;
}

// ── Notifications ────────────────────────────────────────────────────────────
// userId is always required — a notification with no owner must never be
// creatable, let alone returned to any user as if it were theirs.
export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'water' | 'meal' | 'grocery' | 'budget' | 'system' | 'premium';
  isRead: boolean;
  createdAt: string;
  data?: { accessCode?: string; paymentId?: string; expiresAt?: string | null; rejectionReason?: string } | null;
}

// ── Meal Catalog (system meals, owner_id NULL, + user custom meals) ──────────
export interface MealIngredient {
  name: string;
  quantity: number;
  unit: string;
  estimatedCostKsh: number;
}

export interface MealRecord {
  id: string;
  ownerId: string | null;  // null = system meal, visible to everyone
  name: string;
  swahiliName?: string;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  prepTimeMinutes: number;
  estimatedCostKsh: number;
  costLevel: 'budget' | 'moderate' | 'feast';
  description: string;
  imageUrl?: string;
  servings: number;
  kenyanCookingTips?: string;
  isCustom: boolean;
  tags: string[];
  ingredients: MealIngredient[];
  instructions: string[];
  nutrition: {
    proteinRich: boolean;
    carbRich: boolean;
    veggieRich: boolean;
    fruitIncluded: boolean;
    approxCalories: number;
  };
}

// ── Meal Plans ─────────────────────────────────────────────────────────────
export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealPlanRecord {
  id: string;
  userId: string;
  householdId: string | null;
  weekStartDate: string;  // 'YYYY-MM-DD'
  createdAt: string;
  isStarred: boolean;
  days: Record<DayOfWeek, Partial<Record<MealSlot, MealRecord | null>>>;
}

// Save only needs each slot's meal id (it must already be a real row in
// `meals`, i.e. sourced from getMeals()/getMealById()/addMeal()) — not a
// full MealRecord.
export interface MealPlanSaveInput {
  id: string;
  userId: string;
  householdId: string | null;
  weekStartDate: string;
  createdAt?: string;
  days: Record<DayOfWeek, Partial<Record<MealSlot, { id: string } | null>>>;
}

// ── Shopping Lists ───────────────────────────────────────────────────────────
export interface ShoppingListItemRecord {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  estimatedPriceKsh: number;
  actualPriceKsh?: number | null;
  isPurchased: boolean;
  frequency: 'weekly' | 'monthly';
  source: 'generated' | 'manual';
  canonicalKey?: string | null;
  unitGroup?: string | null;
  variant?: string | null;
  isCompound?: boolean;
}

export interface ShoppingListRecord {
  id: string;
  userId: string;
  weekStartDate: string;
  updatedAt: string;
  items: ShoppingListItemRecord[];
}

export interface IDatabaseAdapter {
  // ── Profile ───────────────────────────────────────────────────────────────
  getUser(userId: string): Promise<UserProfile | null>;
  updateUser(userId: string, patch: Partial<UserProfile>): Promise<void>;

  // ── Budget PIN ────────────────────────────────────────────────────────────
  getPinCredential(userId: string): Promise<{ pinHash: string; pinSalt: string } | null>;
  setPinCredential(userId: string, pinHash: string, pinSalt: string): Promise<void>;

  // ── PIN Lockout ───────────────────────────────────────────────────────────
  checkPinLockout(userId: string): Promise<PinLockoutStatus>;
  recordPinFailure(userId: string): Promise<void>;
  resetPinAttempts(userId: string): Promise<void>;

  // ── Financial Sessions ────────────────────────────────────────────────────
  createFinancialSession(userId: string, tokenHash: string, expiresAt: number): Promise<void>;
  getFinancialSessionByTokenHash(tokenHash: string): Promise<{ userId: string; expiresAt: number } | null>;
  deleteFinancialSession(tokenHash: string): Promise<void>;
  deleteUserFinancialSessions(userId: string): Promise<void>;

  // ── Budget ────────────────────────────────────────────────────────────────
  // month defaults to the current calendar month ('YYYY-MM') when omitted.
  getBudget(userId: string, month?: string): Promise<Budget | null>;
  setBudget(userId: string, budget: Budget): Promise<void>;

  // ── Expenses ──────────────────────────────────────────────────────────────
  getExpenses(userId: string): Promise<Expense[]>;
  addExpense(userId: string, expense: Omit<Expense, 'id' | 'userId' | 'createdAt'>): Promise<Expense>;
  deleteExpense(userId: string, expenseId: string): Promise<boolean>;

  // ── Household Members ─────────────────────────────────────────────────────
  getHouseholdMembers(userId: string): Promise<HouseholdMember[]>;
  setHouseholdMembers(userId: string, members: HouseholdMember[]): Promise<void>;

  // ── Water ─────────────────────────────────────────────────────────────────
  getWaterConfig(userId: string): Promise<WaterConfig>;
  setWaterConfig(userId: string, config: WaterConfig): Promise<void>;
  getWaterLog(userId: string, date: string): Promise<WaterLog | null>;
  logWaterEntry(userId: string, date: string, amountMl: number): Promise<WaterLog>;

  // ── Payments & Subscriptions ────────────────────────────────────────────
  // Real M-Pesa persistence — Supabase-backed only, no JSON equivalent.
  createPendingPayment(userId: string, data: { amountKsh: number; phoneNumber: string; planType: PaymentPlanType }): Promise<PaymentRecord>;
  // Till/Buy Goods manual entry — created directly as 'pending' with the
  // user-submitted receipt code already attached (there is no Daraja
  // callback for this path); an admin must confirm it before anything is
  // granted. Returns null (never throws) if the receipt code was already
  // used by another payment — the unique index on mpesa_receipt is the
  // actual guarantee, this is just a clean way to surface that to the caller.
  createPendingTillPayment(userId: string, data: { amountKsh: number; phoneNumber: string; planType: PaymentPlanType; mpesaCode: string; mpesaRawMessage?: string }): Promise<PaymentRecord | null>;
  setPaymentCheckoutIds(paymentId: string, data: { checkoutRequestId: string; merchantRequestId: string }): Promise<void>;
  getPaymentById(paymentId: string): Promise<PaymentRecord | null>;
  getPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<PaymentRecord | null>;
  getRecentPendingPayment(userId: string, withinMs: number): Promise<PaymentRecord | null>;
  // Guarded transition: only succeeds if the payment's current status still
  // equals expectedStatus. Returns null if it doesn't (already processed by
  // a concurrent/duplicate callback) — this IS the idempotency mechanism.
  transitionPayment(paymentId: string, expectedStatus: PaymentStatus, patch: Partial<Pick<PaymentRecord, 'status' | 'mpesaReceipt' | 'resultDesc' | 'verifiedAt' | 'verifiedBy' | 'rejectionReason'>> & { rawCallback?: unknown }): Promise<PaymentRecord | null>;
  getLatestSubscription(userId: string): Promise<SubscriptionRecord | null>;
  createOrExtendSubscription(userId: string, data: { planType: 'weekly' | 'monthly'; priceKsh: number; durationDays: number; mpesaReceipt: string; paymentId: string }): Promise<SubscriptionRecord>;
  countActiveSubscriptions(): Promise<number>;

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications(userId: string): Promise<NotificationRecord[]>;
  addNotification(userId: string, notif: Omit<NotificationRecord, 'id' | 'userId' | 'isRead' | 'createdAt'>): Promise<NotificationRecord>;
  markNotificationRead(id: string, userId: string): Promise<boolean>;

  // ── Meal Catalog ──────────────────────────────────────────────────────────
  // requesterId undefined = anonymous catalog browsing (system meals only).
  getMeals(requesterId?: string): Promise<MealRecord[]>;
  getMealById(id: string, requesterId?: string): Promise<MealRecord | null>;
  addMeal(ownerId: string, meal: Omit<MealRecord, 'id' | 'ownerId' | 'isCustom'>): Promise<MealRecord>;
  deleteMeal(id: string, requesterId: string): Promise<boolean>;
  // Idempotent seed helper (see server/scripts/seed-meal-catalog.ts) — finds
  // an existing system meal (owner_id IS NULL) by name, or null.
  getSystemMealByName(name: string): Promise<MealRecord | null>;

  // ── Meal Plans ────────────────────────────────────────────────────────────
  getMealPlan(userId: string, weekStartDate?: string): Promise<MealPlanRecord | null>;
  saveMealPlan(plan: MealPlanSaveInput): Promise<MealPlanRecord>;

  // ── Meal-Plan History / Anti-Repeat / Starring ───────────────────────────
  // Per-meal-id usage counts across the user's saved weeks in the last
  // `weeksBack` calendar weeks strictly before `beforeWeekStartDate` — a
  // bounded, indexed window, never a full lifetime history scan.
  getMealUsageHistory(userId: string, weeksBack: number, beforeWeekStartDate: string): Promise<{ mealId: string; count: number }[]>;
  // The single most recently-saved week's meal ids (any slot), for the
  // week-similarity novelty check — null if no prior week exists.
  getPreviousWeekMealIds(userId: string, beforeWeekStartDate: string): Promise<string[] | null>;
  // Refuses to un-flag a week that isn't actually saved; returns false if
  // no matching plan exists, true on success. Starring an already-starred
  // week (or unstarring an already-unstarred one) is a safe no-op success.
  setMealPlanStarred(userId: string, weekStartDate: string, starred: boolean): Promise<boolean>;
  getStarredMealIds(userId: string): Promise<Set<string>>;
  starMeal(userId: string, mealId: string): Promise<void>;
  unstarMeal(userId: string, mealId: string): Promise<void>;
  // Short-lived per-user generation mutex (CAS-style: claim fails if
  // another live claim exists). A claim older than staleAfterMs is treated
  // as abandoned (e.g. a crashed request that never released) and may be
  // reclaimed rather than deadlocking generation forever.
  claimGenerationLock(userId: string, staleAfterMs: number): Promise<boolean>;
  releaseGenerationLock(userId: string): Promise<void>;

  // ── Shopping Lists ────────────────────────────────────────────────────────
  getShoppingList(userId: string, weekStartDate?: string): Promise<ShoppingListRecord | null>;
  saveShoppingList(list: Omit<ShoppingListRecord, 'updatedAt'> & { updatedAt?: string }): Promise<ShoppingListRecord>;
}
