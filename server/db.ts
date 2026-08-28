import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
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
} from '../src/types.js';
import { KENYAN_FOOD_ITEMS, KENYAN_MEALS, SAMPLE_HOUSEHOLD_MEMBERS } from '../src/data/kenyanFoodData.js';

// Vercel's function filesystem is read-only except /tmp — persisting there
// still doesn't survive across cold starts/invocations, but avoids a hard
// crash on every request. This JSON store only ever covers meal plans,
// shopping lists, and notifications (see server/secure-db.ts's header
// comment); privacy-critical data always goes through Supabase regardless.
const DB_FILE = process.env.VERCEL
  ? path.join('/tmp', 'mlo_database.json')
  : path.join(process.cwd(), 'data', 'mlo_database.json');

// Interface for persistent store
export interface DatabaseSchema {
  users: (UserProfile & {
    passwordHash?: string;
    pinHash?: string;
    pinSalt?: string;
    pinFailedAttempts?: number;
    pinLockedUntil?: number | null;
  })[];
  households: Household[];
  foodItems: FoodItem[];
  meals: Meal[];
  mealPlans: WeeklyMealPlan[];
  shoppingLists: ShoppingList[];
  waterConfigs: Record<string, WaterTargetConfig>;
  waterLogs: WaterLog[];
  budgets: UserBudget[];
  expenses: Expense[];
  financialSessions: { token: string; userId: string; expiresAt: number }[];
  subscriptions: Subscription[];
  notifications: NotificationItem[];
  payments: any[];
}

// Initial Database State
function getInitialData(): DatabaseSchema {
  const defaultUserId = 'usr_mwangi_demo';
  const defaultHouseholdId = 'hh_mwangi_family';

  const defaultUser: DatabaseSchema['users'][0] = {
    id: defaultUserId,
    name: 'Mwangi Njoroge',
    email: 'bstringrecords@gmail.com',
    role: 'user',
    hasBudgetPin: false,   // No default PIN — user must create their own 6-digit PIN
    isPremium: true,
    premiumExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    pinFailedAttempts: 0,
    pinLockedUntil: null,
  };

  const defaultHousehold: Household = {
    id: defaultHouseholdId,
    name: 'The Mwangi Family',
    ownerId: defaultUserId,
    members: SAMPLE_HOUSEHOLD_MEMBERS,
    createdAt: new Date().toISOString(),
  };

  // Generate initial meal plan for the week
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
  const initialDaysPlan: any = {};
  
  const sampleMealsPool = [...KENYAN_MEALS];
  days.forEach((day, index) => {
    initialDaysPlan[day] = {
      breakfast: sampleMealsPool[(index * 3) % sampleMealsPool.length],
      lunch: sampleMealsPool[(index * 3 + 1) % sampleMealsPool.length],
      dinner: sampleMealsPool[(index * 3 + 2) % sampleMealsPool.length],
      snack: sampleMealsPool[(index * 3 + 23) % sampleMealsPool.length],
    };
  });

  const defaultMealPlan: WeeklyMealPlan = {
    id: 'mp_current_week',
    userId: defaultUserId,
    householdId: defaultHouseholdId,
    weekStartDate: getMondayOfCurrentWeek(),
    days: initialDaysPlan,
    createdAt: new Date().toISOString(),
  };

  const defaultBudget: UserBudget = {
    id: 'bgt_mwangi_current',
    userId: defaultUserId,
    month: getCurrentYearMonth(),
    monthlyIncomeKsh: 30000,
    incomeType: 'monthly',
    categories: [
      { category: 'Rent', plannedAmountKsh: 9000, color: '#3B82F6' },
      { category: 'Food', plannedAmountKsh: 7000, color: '#14532D' },
      { category: 'Transport', plannedAmountKsh: 4000, color: '#F59E0B' },
      { category: 'Bills', plannedAmountKsh: 2500, color: '#8B5CF6' },
      { category: 'Savings', plannedAmountKsh: 4000, color: '#10B981' },
      { category: 'Debt', plannedAmountKsh: 1500, color: '#EF4444' },
      { category: 'Other', plannedAmountKsh: 2000, color: '#6B7280' },
    ],
    notes: 'Family monthly budget. Target: maintain KSh 4,000 emergency savings.',
    updatedAt: new Date().toISOString(),
  };

  const today = getTodayDate();
  const sampleExpenses: Expense[] = [
    { id: 'exp_1', userId: defaultUserId, amountKsh: 450, category: 'Food', description: 'Groceries: Sukuma, Onions, Eggs, Unga', date: today, createdAt: new Date().toISOString() },
    { id: 'exp_2', userId: defaultUserId, amountKsh: 250, category: 'Transport', description: 'Matatu fare to CBD and back', date: today, createdAt: new Date().toISOString() },
    { id: 'exp_3', userId: defaultUserId, amountKsh: 9000, category: 'Rent', description: 'Monthly House Rent (2-Bedroom)', date: `${today.substring(0, 7)}-02`, createdAt: new Date().toISOString() },
    { id: 'exp_4', userId: defaultUserId, amountKsh: 1200, category: 'Bills', description: 'KPLC Electricity Tokens', date: `${today.substring(0, 7)}-05`, createdAt: new Date().toISOString() },
    { id: 'exp_5', userId: defaultUserId, amountKsh: 3200, category: 'Food', description: 'Supermarket bulk pantry shopping (Rice, Flour, Cooking Oil, Beans)', date: `${today.substring(0, 7)}-06`, createdAt: new Date().toISOString() },
    { id: 'exp_6', userId: defaultUserId, amountKsh: 1800, category: 'Food', description: 'Weekly fresh vegetable & fish market (Marikiti)', date: `${today.substring(0, 7)}-12`, createdAt: new Date().toISOString() },
    { id: 'exp_7', userId: defaultUserId, amountKsh: 2000, category: 'Savings', description: 'M-Shwari Lock Deposit Account', date: `${today.substring(0, 7)}-03`, createdAt: new Date().toISOString() },
  ];

  const defaultWaterLog: WaterLog = {
    id: `wl_${defaultUserId}_${today}`,
    userId: defaultUserId,
    date: today,
    totalMl: 1250,
    targetMl: 2000,
    logs: [
      { time: '08:15', amountMl: 250 },
      { time: '10:45', amountMl: 500 },
      { time: '13:30', amountMl: 500 },
    ],
  };

  const defaultWaterConfig: WaterTargetConfig = {
    dailyTargetMl: 2000,
    glassSizeMl: 250,
    reminderFrequencyMinutes: 120,
    remindersEnabled: true,
    schedule: ['08:00', '10:30', '13:00', '15:30', '18:00', '20:00'],
  };

  // Generate initial shopping list from the meal plan
  const shoppingItems = generateShoppingItemsFromMealPlan(defaultMealPlan);

  const defaultShoppingList: ShoppingList = {
    id: 'sl_current_week',
    userId: defaultUserId,
    weekStartDate: defaultMealPlan.weekStartDate,
    items: shoppingItems,
    updatedAt: new Date().toISOString(),
  };

  const defaultNotifications: NotificationItem[] = [
    {
      id: 'notif_1',
      userId: defaultUserId,
      title: '💧 Hydration Check',
      message: 'Time for an afternoon glass of water! You are at 5 / 8 glasses today.',
      type: 'water',
      isRead: false,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'notif_2',
      userId: defaultUserId,
      title: '🍲 Dinner Preparation',
      message: 'Tonight\'s Family Dinner: Ugali with Sukuma Wiki & Fried Eggs (25 mins).',
      type: 'meal',
      isRead: false,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ];

  return {
    users: [defaultUser],
    households: [defaultHousehold],
    foodItems: KENYAN_FOOD_ITEMS,
    meals: KENYAN_MEALS,
    mealPlans: [defaultMealPlan],
    shoppingLists: [defaultShoppingList],
    waterConfigs: { [defaultUserId]: defaultWaterConfig },
    waterLogs: [defaultWaterLog],
    budgets: [defaultBudget],
    expenses: sampleExpenses,
    financialSessions: [],
    subscriptions: [
      {
        id: 'sub_demo_active',
        userId: defaultUserId,
        planType: 'monthly',
        priceKsh: 150,
        status: 'active',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        mpesaReceipt: 'QGH789KLMN',
      }
    ],
    notifications: defaultNotifications,
    payments: [],
  };
}

// Weekly vs monthly is assigned per FOOD CATEGORY, not per individual
// ingredient — a reasonable household-shopping approximation (perishables
// weekly, bulk-bought pantry staples monthly), not a claim of per-item
// accuracy. This is the one place the value is decided; the client only
// ever displays it. See migrations/0010_shopping_item_frequency.sql.
const FREQUENCY_BY_CATEGORY: Record<string, 'weekly' | 'monthly'> = {
  carbohydrates: 'monthly', // flour, rice, maize — typically bulk-bought
  proteins: 'weekly',       // fresh meat, fish, eggs
  vegetables: 'weekly',
  fruits: 'weekly',
  dairy: 'weekly',
  spices_pantry: 'monthly', // oil, salt, sugar, spices
};

export function generateShoppingItemsFromMealPlan(mealPlan: WeeklyMealPlan): ShoppingList['items'] {
  const itemMap: Record<string, { category: any; quantity: number; unit: string; estimatedPriceKsh: number }> = {};

  Object.values(mealPlan.days).forEach((dayPlan) => {
    const mealsToProcess = [dayPlan.breakfast, dayPlan.lunch, dayPlan.dinner, dayPlan.snack].filter(Boolean) as Meal[];
    mealsToProcess.forEach((meal) => {
      meal.ingredients.forEach((ing) => {
        const key = ing.name.toLowerCase().trim();
        if (itemMap[key]) {
          itemMap[key].quantity += ing.quantity;
          itemMap[key].estimatedPriceKsh += ing.estimatedCostKsh;
        } else {
          // Categorize ingredient
          let category: any = 'vegetables';
          const lower = key.toLowerCase();
          if (lower.includes('flour') || lower.includes('rice') || lower.includes('potato') || lower.includes('matoke') || lower.includes('githeri') || lower.includes('oats') || lower.includes('bread') || lower.includes('nduma')) {
            category = 'carbohydrates';
          } else if (lower.includes('bean') || lower.includes('beef') || lower.includes('chicken') || lower.includes('egg') || lower.includes('omena') || lower.includes('tilapia') || lower.includes('ndengu') || lower.includes('kamande') || lower.includes('fish') || lower.includes('meat')) {
            category = 'proteins';
          } else if (lower.includes('banana') || lower.includes('mango') || lower.includes('avocado') || lower.includes('watermelon') || lower.includes('pawpaw') || lower.includes('pineapple') || lower.includes('orange')) {
            category = 'fruits';
          } else if (lower.includes('milk') || lower.includes('mala') || lower.includes('yoghurt')) {
            category = 'dairy';
          } else if (lower.includes('oil') || lower.includes('salt') || lower.includes('royco') || lower.includes('spice') || lower.includes('curry') || lower.includes('tea')) {
            category = 'spices_pantry';
          }

          itemMap[key] = {
            category,
            quantity: ing.quantity,
            unit: ing.unit,
            estimatedPriceKsh: ing.estimatedCostKsh,
          };
        }
      });
    });
  });

  return Object.entries(itemMap).map(([name, data], idx) => ({
    id: `shop_item_${idx}_${Date.now()}`,
    name: capitalize(name),
    category: data.category,
    quantity: Math.round(data.quantity * 10) / 10,
    unit: data.unit,
    estimatedPriceKsh: Math.round(data.estimatedPriceKsh),
    isPurchased: false,
    frequency: FREQUENCY_BY_CATEGORY[data.category] || 'weekly',
    source: 'generated',
  }));
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getMondayOfCurrentWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function getCurrentYearMonth(): string {
  return new Date().toISOString().substring(0, 7);
}

// Database Manager Class
class DatabaseManager {
  private data: DatabaseSchema;
  // Dev-mode-only, in-memory, not persisted to the JSON file: starred
  // individual meals and short-lived generation locks. JSON mode is a
  // single-process local dev convenience, not the production path
  // (USE_JSON_DB=false in production), so these don't need file durability
  // or real cross-process locking the way the Supabase-backed equivalents do.
  private starredMeals = new Map<string, Set<string>>();
  private generationLocks = new Map<string, number>();

  constructor() {
    this.ensureDataDirectory();
    this.data = this.loadData();
  }

  private ensureDataDirectory() {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      // Read-only filesystem (e.g. an unwritable path) — degrade to
      // in-memory-only for this process rather than crashing module load;
      // saveData()'s own try/catch already tolerates this on every write.
      console.error('Could not create data directory, continuing in-memory only:', err);
    }
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Error reading database file, initializing fresh store:', err);
    }
    const initial = getInitialData();
    this.saveData(initial);
    return initial;
  }

  public saveData(dataToSave?: DatabaseSchema) {
    if (dataToSave) {
      this.data = dataToSave;
    }
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error persisting database to disk:', err);
    }
  }

  public getRawData(): DatabaseSchema {
    return this.data;
  }

  // Users
  public getUser(userId: string) {
    return this.data.users.find((u) => u.id === userId);
  }

  public getUserByEmail(email: string) {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public updateUser(userId: string, updates: Partial<UserProfile>) {
    const idx = this.data.users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      this.data.users[idx] = { ...this.data.users[idx], ...updates };
      this.saveData();
      return this.data.users[idx];
    }
    return null;
  }

  // PIN Hashing & Financial Sessions
  public setBudgetPin(userId: string, pin: string) {
    const user = this.getUser(userId);
    if (!user) return false;

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(pin, salt, 10000, 64, 'sha256').toString('hex');

    user.pinSalt = salt;
    user.pinHash = hash;
    user.hasBudgetPin = true;
    this.saveData();
    return true;
  }

  public verifyBudgetPin(userId: string, pin: string): boolean {
    const user = this.getUser(userId);
    if (!user || !user.pinHash || !user.pinSalt) return false;

    const verifyHash = crypto.pbkdf2Sync(pin, user.pinSalt, 10000, 64, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(user.pinHash, 'hex'), Buffer.from(verifyHash, 'hex'));
  }

  // PIN lockout management (progressive: 5+ failures → 5 min, 10+ → 30 min)
  public checkPinLockout(userId: string): { locked: boolean; secondsRemaining: number } {
    const user = this.getUser(userId);
    if (!user || !user.pinLockedUntil) return { locked: false, secondsRemaining: 0 };
    if (user.pinLockedUntil > Date.now()) {
      return { locked: true, secondsRemaining: Math.ceil((user.pinLockedUntil - Date.now()) / 1000) };
    }
    // Lockout expired — clear it
    user.pinLockedUntil = null;
    this.saveData();
    return { locked: false, secondsRemaining: 0 };
  }

  public recordPinFailure(userId: string) {
    const user = this.getUser(userId);
    if (!user) return;
    user.pinFailedAttempts = (user.pinFailedAttempts || 0) + 1;
    const attempts = user.pinFailedAttempts;
    if (attempts >= 10) {
      user.pinLockedUntil = Date.now() + 30 * 60 * 1000; // 30 min
    } else if (attempts >= 5) {
      user.pinLockedUntil = Date.now() + 5 * 60 * 1000;  // 5 min
    }
    this.saveData();
  }

  public resetPinAttempts(userId: string) {
    const user = this.getUser(userId);
    if (!user) return;
    user.pinFailedAttempts = 0;
    user.pinLockedUntil = null;
    this.saveData();
  }

  // Look up a financial session by token (returns the full session record)
  public getFinancialSession(token: string): { token: string; userId: string; expiresAt: number } | undefined {
    return this.data.financialSessions.find((s) => s.token === token);
  }

  public createFinancialSession(userId: string, durationMinutes = 15): string {
    // Invalidate old sessions for this user
    this.data.financialSessions = this.data.financialSessions.filter((s) => s.userId !== userId && s.expiresAt > Date.now());

    const token = `fin_${crypto.randomBytes(32).toString('hex')}`;
    const expiresAt = Date.now() + durationMinutes * 60 * 1000;

    this.data.financialSessions.push({ token, userId, expiresAt });
    this.saveData();
    return token;
  }

  public verifyFinancialSession(userId: string, token?: string): boolean {
    if (!token) return false;
    const session = this.data.financialSessions.find((s) => s.token === token && s.userId === userId);
    if (!session) return false;
    if (session.expiresAt < Date.now()) {
      // Expired
      this.invalidateFinancialSession(token);
      return false;
    }
    return true;
  }

  public invalidateFinancialSession(token: string) {
    this.data.financialSessions = this.data.financialSessions.filter((s) => s.token !== token);
    this.saveData();
  }

  public invalidateAllFinancialSessionsForUser(userId: string) {
    this.data.financialSessions = this.data.financialSessions.filter((s) => s.userId !== userId);
    this.saveData();
  }

  // Budgets & Expenses
  public getBudget(userId: string, month: string = getCurrentYearMonth()): UserBudget | undefined {
    return this.data.budgets.find((b) => b.userId === userId && b.month === month);
  }

  public saveBudget(budget: UserBudget) {
    const idx = this.data.budgets.findIndex((b) => b.userId === budget.userId && b.month === budget.month);
    if (idx !== -1) {
      this.data.budgets[idx] = budget;
    } else {
      this.data.budgets.push(budget);
    }
    this.saveData();
    return budget;
  }

  public getExpenses(userId: string, month: string = getCurrentYearMonth()): Expense[] {
    return this.data.expenses
      .filter((e) => e.userId === userId && e.date.startsWith(month))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public addExpense(expense: Expense): Expense {
    this.data.expenses.push(expense);
    this.saveData();
    return expense;
  }

  public deleteExpense(userId: string, expenseId: string): boolean {
    const idx = this.data.expenses.findIndex((e) => e.id === expenseId && e.userId === userId);
    if (idx !== -1) {
      this.data.expenses.splice(idx, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // Overspending Engine Calculation
  public calculateOverspendingAnalysis(userId: string, month: string = getCurrentYearMonth()): OverspendingAnalysis {
    const budget = this.getBudget(userId, month);
    const expenses = this.getExpenses(userId, month);

    const foodCategory = budget?.categories.find((c) => c.category === 'Food');
    const foodPlanned = foodCategory ? foodCategory.plannedAmountKsh : 7000;

    const foodExpenses = expenses.filter((e) => e.category === 'Food');
    const foodSpent = foodExpenses.reduce((acc, curr) => acc + curr.amountKsh, 0);
    const foodRemaining = foodPlanned - foodSpent;

    // Calculate days
    const now = new Date();
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);

    const dailyAllowance = Math.max(0, Math.round(foodRemaining / daysRemaining));

    // Expected spent by today if linear: (currentDay / daysInMonth) * foodPlanned
    const expectedSpentToDate = (currentDay / daysInMonth) * foodPlanned;
    const velocityPercent = expectedSpentToDate > 0 ? Math.round((foodSpent / expectedSpentToDate) * 100) : 100;
    const projectedMonthEnd = Math.round((foodSpent / Math.max(1, currentDay)) * daysInMonth);

    let alertType: OverspendingAnalysis['alertType'] = 'positive';
    let alertMessage = `You're doing great! You have KSh ${foodRemaining.toLocaleString()} left for the month (KSh ${dailyAllowance}/day).`;
    let isOverspending = false;
    let suggestedAction = undefined;

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

    const warnings: string[] = [];
    for (const cat of budget?.categories || []) {
      if (!cat.plannedAmountKsh) continue;
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
      dailySafeSpendingKsh: dailyAllowance,
      projectedMonthEndSpendKsh: projectedMonthEnd,
      recommendations: suggestedAction ? [suggestedAction] : [],
      warnings,
    };
  }

  // Meals & Food Items
  public getFoodItems() {
    return this.data.foodItems;
  }

  public updateFoodItemPrice(id: string, priceKsh: number, region?: string) {
    const item = this.data.foodItems.find((f) => f.id === id);
    if (item) {
      item.estimatedPriceKsh = priceKsh;
      if (region) item.region = region;
      item.lastUpdated = new Date().toISOString().substring(0, 7);
      this.saveData();
      return item;
    }
    return null;
  }

  // System meals (no ownerId) are visible to everyone. Custom meals are visible
  // only to their owner. requesterId is the server-verified authenticated user
  // (or undefined for anonymous catalog browsing, which sees system meals only).
  public getMeals(requesterId?: string) {
    return this.data.meals.filter((m) => !m.ownerId || m.ownerId === requesterId);
  }

  public getMealById(id: string, requesterId?: string) {
    const meal = this.data.meals.find((m) => m.id === id);
    if (!meal) return undefined;
    if (meal.ownerId && meal.ownerId !== requesterId) return undefined;
    return meal;
  }

  public addMeal(meal: Meal): Meal {
    const existingIndex = this.data.meals.findIndex((m) => m.id === meal.id);
    if (existingIndex !== -1) {
      this.data.meals[existingIndex] = meal;
    } else {
      this.data.meals.unshift(meal); // Put new custom meals at the top
    }
    this.saveData();
    return meal;
  }

  // Only the meal's owner may delete it; system meals (no ownerId) can never be
  // deleted through this path.
  public deleteMeal(id: string, requesterId: string): boolean {
    const idx = this.data.meals.findIndex((m) => m.id === id && m.ownerId === requesterId);
    if (idx !== -1) {
      this.data.meals.splice(idx, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // Meal Plans
  // NOTE: previously fell back to `mealPlans[0]` (the first record in the whole
  // store) when the requesting user had none yet. That's a cross-user leak once
  // real, distinct authenticated user IDs are in play — removed. `undefined`
  // means "no plan for this user this week yet", which the frontend already
  // treats as a valid empty state.
  public getMealPlan(userId: string, weekStartDate = getMondayOfCurrentWeek()): WeeklyMealPlan | undefined {
    return this.data.mealPlans.find((p) => p.userId === userId && p.weekStartDate === weekStartDate);
  }

  public saveMealPlan(plan: WeeklyMealPlan) {
    const idx = this.data.mealPlans.findIndex((p) => p.id === plan.id || (p.userId === plan.userId && p.weekStartDate === plan.weekStartDate));
    if (idx !== -1) {
      if (this.data.mealPlans[idx].isStarred) throw new Error('STARRED_WEEK_PROTECTED');
      this.data.mealPlans[idx] = plan;
    } else {
      this.data.mealPlans.push(plan);
    }
    // Update shopping list automatically
    const shoppingItems = generateShoppingItemsFromMealPlan(plan);
    this.saveShoppingList({
      id: `sl_${plan.id}`,
      userId: plan.userId,
      weekStartDate: plan.weekStartDate,
      items: shoppingItems,
      updatedAt: new Date().toISOString(),
    });
    this.saveData();
    return plan;
  }

  // ── Meal-Plan History / Anti-Repeat / Starring (JSON dev-mode parity) ────
  public getMealUsageHistory(userId: string, weeksBack: number, beforeWeekStartDate: string): { mealId: string; count: number }[] {
    const before = new Date(`${beforeWeekStartDate}T00:00:00Z`).getTime();
    const cutoff = before - weeksBack * 7 * 24 * 60 * 60 * 1000;
    const counts = new Map<string, number>();
    for (const p of this.data.mealPlans) {
      if (p.userId !== userId) continue;
      const t = new Date(`${p.weekStartDate}T00:00:00Z`).getTime();
      if (t < cutoff || t >= before) continue;
      for (const day of Object.values(p.days)) {
        for (const meal of [day.breakfast, day.lunch, day.dinner, day.snack]) {
          if (meal) counts.set(meal.id, (counts.get(meal.id) || 0) + 1);
        }
      }
    }
    return [...counts.entries()].map(([mealId, count]) => ({ mealId, count }));
  }

  public getPreviousWeekMealIds(userId: string, beforeWeekStartDate: string): string[] | null {
    const prior = this.data.mealPlans
      .filter((p) => p.userId === userId && p.weekStartDate < beforeWeekStartDate)
      .sort((a, b) => (a.weekStartDate < b.weekStartDate ? 1 : -1))[0];
    if (!prior) return null;
    const ids: string[] = [];
    for (const day of Object.values(prior.days)) {
      for (const meal of [day.breakfast, day.lunch, day.dinner, day.snack]) {
        if (meal) ids.push(meal.id);
      }
    }
    return ids;
  }

  public setMealPlanStarred(userId: string, weekStartDate: string, starred: boolean): boolean {
    const plan = this.data.mealPlans.find((p) => p.userId === userId && p.weekStartDate === weekStartDate);
    if (!plan) return false;
    plan.isStarred = starred;
    this.saveData();
    return true;
  }

  public getStarredMealIds(userId: string): Set<string> {
    return new Set(this.starredMeals.get(userId) ?? []);
  }

  public starMeal(userId: string, mealId: string): void {
    if (!this.starredMeals.has(userId)) this.starredMeals.set(userId, new Set());
    this.starredMeals.get(userId)!.add(mealId);
  }

  public unstarMeal(userId: string, mealId: string): void {
    this.starredMeals.get(userId)?.delete(mealId);
  }

  public claimGenerationLock(userId: string, staleAfterMs: number): boolean {
    const existing = this.generationLocks.get(userId);
    if (existing !== undefined && Date.now() - existing < staleAfterMs) return false;
    this.generationLocks.set(userId, Date.now());
    return true;
  }

  public releaseGenerationLock(userId: string): void {
    this.generationLocks.delete(userId);
  }

  // Household — see getMealPlan note above: no cross-user fallback.
  public getHousehold(userId: string): Household | undefined {
    return this.data.households.find((h) => h.ownerId === userId);
  }

  public updateHousehold(household: Household) {
    const idx = this.data.households.findIndex((h) => h.id === household.id);
    if (idx !== -1) {
      this.data.households[idx] = household;
    } else {
      this.data.households.push(household);
    }
    this.saveData();
    return household;
  }

  // Shopping List — see getMealPlan note above: no cross-user fallback.
  public getShoppingList(userId: string, weekStartDate = getMondayOfCurrentWeek()): ShoppingList | undefined {
    return this.data.shoppingLists.find((s) => s.userId === userId && s.weekStartDate === weekStartDate);
  }

  public saveShoppingList(list: ShoppingList) {
    const idx = this.data.shoppingLists.findIndex((s) => s.id === list.id || (s.userId === list.userId && s.weekStartDate === list.weekStartDate));
    if (idx !== -1) {
      this.data.shoppingLists[idx] = list;
    } else {
      this.data.shoppingLists.push(list);
    }
    this.saveData();
    return list;
  }

  // Water
  public getWaterLog(userId: string, date: string = getTodayDate()): WaterLog {
    let log = this.data.waterLogs.find((w) => w.userId === userId && w.date === date);
    if (!log) {
      const config = this.getWaterConfig(userId);
      log = {
        id: `wl_${userId}_${date}`,
        userId,
        date,
        totalMl: 0,
        targetMl: config.dailyTargetMl,
        logs: [],
      };
      this.data.waterLogs.push(log);
      this.saveData();
    }
    return log;
  }

  public addWater(userId: string, amountMl: number, date: string = getTodayDate()): WaterLog {
    const log = this.getWaterLog(userId, date);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    log.totalMl += amountMl;
    log.logs.push({ time: nowTime, amountMl });
    this.saveData();
    return log;
  }

  public getWaterConfig(userId: string): WaterTargetConfig {
    return this.data.waterConfigs[userId] || {
      dailyTargetMl: 2000,
      glassSizeMl: 250,
      reminderFrequencyMinutes: 120,
      remindersEnabled: true,
      schedule: ['08:00', '10:30', '13:00', '15:30', '18:00', '20:00'],
    };
  }

  public updateWaterConfig(userId: string, config: WaterTargetConfig) {
    this.data.waterConfigs[userId] = config;
    this.saveData();
    return config;
  }

  public getWaterHistory7Days(userId: string): WaterLog[] {
    const logs: WaterLog[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      logs.push(this.getWaterLog(userId, dateStr));
    }
    return logs;
  }

  // Subscriptions & Payments
  public getSubscription(userId: string): Subscription | undefined {
    return this.data.subscriptions.find((s) => s.userId === userId && s.status === 'active');
  }

  public recordPayment(userId: string, amountKsh: number, phoneNumber: string, planType: 'weekly' | 'monthly'): Subscription {
    const durationDays = planType === 'weekly' ? 7 : 30;
    const mpesaReceipt = `MLO${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const sub: Subscription = {
      id: `sub_${Date.now()}`,
      userId,
      planType,
      priceKsh: amountKsh,
      status: 'active',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
      mpesaReceipt,
    };

    this.data.subscriptions.push(sub);
    this.data.payments.push({
      id: `pay_${Date.now()}`,
      userId,
      amountKsh,
      phoneNumber,
      mpesaReceipt,
      status: 'completed',
      createdAt: new Date().toISOString(),
    });

    const user = this.getUser(userId);
    if (user) {
      user.isPremium = true;
      user.premiumExpiry = sub.endDate;
    }

    this.saveData();
    return sub;
  }

  // Notifications — strict ownership. A notification with no userId is never
  // returned to anyone; there is no "global" notification concept.
  public getNotifications(userId: string): NotificationItem[] {
    return this.data.notifications.filter((n) => n.userId === userId);
  }

  // Only the owner of a notification may mark it read.
  public markNotificationRead(id: string, userId: string): boolean {
    const notif = this.data.notifications.find((n) => n.id === id);
    if (!notif) return false;
    if (notif.userId !== userId) return false;
    notif.isRead = true;
    this.saveData();
    return true;
  }

  // userId is required — a notification can never be created without an
  // explicit owner (see NotificationItem.userId in src/types.ts).
  public addNotification(notif: Omit<NotificationItem, 'id' | 'createdAt' | 'isRead'> & { userId: string }) {
    if (!notif.userId) {
      throw new Error('addNotification requires an explicit userId');
    }
    const newNotif: NotificationItem = {
      id: `notif_${Date.now()}`,
      ...notif,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    this.data.notifications.unshift(newNotif);
    this.saveData();
    return newNotif;
  }
}

export const db = new DatabaseManager();
