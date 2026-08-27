// Type-only re-exports of the web app's own domain types (src/types.ts) —
// erased at compile time, so Metro never bundles across the project
// boundary (see types/auth.ts for the same pattern/reasoning). This is the
// single place Phase 2 screens import these types from.
export type {
  Meal,
  MealCategory,
  MealIngredient,
  WeeklyMealPlan,
  DayOfWeek,
  FoodItem,
  FoodCategory,
  Household,
  HouseholdMember,
  AgeGroup,
  ShoppingList,
  ShoppingItem,
  WaterLog,
  WaterTargetConfig,
  UserBudget,
  BudgetCategoryAllocation,
  Expense,
  ExpenseCategory,
  OverspendingAnalysis,
  NotificationItem,
} from '../../src/types';
