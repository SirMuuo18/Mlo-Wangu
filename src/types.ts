export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodCategory = 'carbohydrates' | 'proteins' | 'vegetables' | 'fruits' | 'dairy' | 'spices_pantry';
export type AgeGroup = 'adult' | 'teen' | 'child' | 'infant';
export type ExpenseCategory = 'Food' | 'Rent' | 'Transport' | 'Bills' | 'Shopping' | 'Entertainment' | 'Debt' | 'Savings' | 'Health' | 'Other';

export interface FoodItem {
  id: string;
  name: string;
  swahiliName?: string;
  category: FoodCategory;
  defaultUnit: string;
  estimatedPriceKsh: number;
  region?: string;
  lastUpdated?: string;
  caloriesPerUnit?: number;
  proteinG?: number;
  carbsG?: number;
  fiberG?: number;
  isPantryStaple?: boolean;
}

export interface MealIngredient {
  foodItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  estimatedCostKsh: number;
}

export interface Meal {
  id: string;
  name: string;
  swahiliName?: string;
  category: MealCategory;
  prepTimeMinutes: number;
  estimatedCostKsh: number; // Cost for typical family of 4
  costLevel: 'budget' | 'moderate' | 'feast'; // budget: < 200, moderate: 200-500, feast: 500+
  ingredients: MealIngredient[];
  instructions: string[];
  nutrition: {
    proteinRich: boolean;
    carbRich: boolean;
    veggieRich: boolean;
    fruitIncluded: boolean;
    approxCalories: number;
  };
  tags: string[];
  description: string;
  imageUrl?: string;
  servings: number;
  kenyanCookingTips?: string;
  isCustom?: boolean;
}

export interface HouseholdMember {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  preferences: string[];
  allergies: string[];
  dislikes: string[];
  nutritionGoals?: string;
}

export interface Household {
  id: string;
  name: string;
  members: HouseholdMember[];
  ownerId: string;
  createdAt: string;
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface MealPlanDay {
  day: DayOfWeek;
  breakfast?: Meal;
  lunch?: Meal;
  dinner?: Meal;
  snack?: Meal;
}

export interface WeeklyMealPlan {
  id: string;
  userId: string;
  householdId: string;
  weekStartDate: string;
  days: Record<DayOfWeek, {
    breakfast: Meal;
    lunch: Meal;
    dinner: Meal;
    snack?: Meal;
  }>;
  createdAt: string;
}

export interface ShoppingItem {
  id: string;
  category: FoodCategory | 'other';
  name: string;
  quantity: number;
  unit: string;
  estimatedPriceKsh: number;
  actualPriceKsh?: number;
  isPurchased: boolean;
  mealRef?: string;
}

export interface ShoppingList {
  id: string;
  userId: string;
  weekStartDate: string;
  items: ShoppingItem[];
  updatedAt: string;
}

export interface WaterLog {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  totalMl: number;
  targetMl: number;
  logs: { time: string; amountMl: number }[];
}

export interface WaterTargetConfig {
  dailyTargetMl: number;
  glassSizeMl: number;
  reminderFrequencyMinutes: number;
  remindersEnabled: boolean;
  schedule: string[]; // e.g. ["08:00", "10:30", "13:00", "15:30", "18:00"]
}

// Financial Types (Private)
export interface BudgetCategoryAllocation {
  category: ExpenseCategory;
  plannedAmountKsh: number;
  color: string;
}

export interface UserBudget {
  id: string;
  userId: string;
  month: string; // YYYY-MM
  monthlyIncomeKsh: number;
  incomeType: 'monthly' | 'weekly' | 'biweekly' | 'irregular';
  categories: BudgetCategoryAllocation[];
  notes?: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  userId: string;
  amountKsh: number;
  category: ExpenseCategory;
  description: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export interface OverspendingAnalysis {
  foodBudgetPlannedKsh: number;
  foodBudgetSpentKsh: number;
  foodBudgetRemainingKsh: number;
  daysRemainingInMonth: number;
  recommendedDailyAllowanceKsh: number;
  spendingVelocityPercent: number; // e.g. 120% = spending 20% faster than expected
  projectedMonthEndSpendingKsh: number;
  isOverspending: boolean;
  alertType: 'danger' | 'warning' | 'positive' | 'savings';
  alertMessage: string;
  suggestedAction?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  hasBudgetPin: boolean;
  isPremium: boolean;
  premiumExpiry?: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planType: 'weekly' | 'monthly';
  priceKsh: number;
  status: 'active' | 'expired' | 'pending';
  startDate: string;
  endDate: string;
  mpesaReceipt?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'water' | 'meal' | 'grocery' | 'budget' | 'system';
  isRead: boolean;
  createdAt: string;
}
