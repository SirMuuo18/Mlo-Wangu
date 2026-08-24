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

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'expired';

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
  resultDesc: string | null;
  createdAt: string;
  verifiedAt: string | null;
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
  createPendingTillPayment(userId: string, data: { amountKsh: number; phoneNumber: string; planType: PaymentPlanType; mpesaCode: string }): Promise<PaymentRecord | null>;
  setPaymentCheckoutIds(paymentId: string, data: { checkoutRequestId: string; merchantRequestId: string }): Promise<void>;
  getPaymentById(paymentId: string): Promise<PaymentRecord | null>;
  getPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<PaymentRecord | null>;
  getRecentPendingPayment(userId: string, withinMs: number): Promise<PaymentRecord | null>;
  // Guarded transition: only succeeds if the payment's current status still
  // equals expectedStatus. Returns null if it doesn't (already processed by
  // a concurrent/duplicate callback) — this IS the idempotency mechanism.
  transitionPayment(paymentId: string, expectedStatus: PaymentStatus, patch: Partial<Pick<PaymentRecord, 'status' | 'mpesaReceipt' | 'resultDesc' | 'verifiedAt'>> & { rawCallback?: unknown }): Promise<PaymentRecord | null>;
  getLatestSubscription(userId: string): Promise<SubscriptionRecord | null>;
  createOrExtendSubscription(userId: string, data: { planType: 'weekly' | 'monthly'; priceKsh: number; durationDays: number; mpesaReceipt: string; paymentId: string }): Promise<SubscriptionRecord>;
  countActiveSubscriptions(): Promise<number>;
}
