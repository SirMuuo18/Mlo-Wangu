import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  UserProfile,
  Household,
  WeeklyMealPlan,
  ShoppingList,
  WaterLog,
  WaterTargetConfig,
  Meal,
  FoodItem,
  Expense,
  NotificationItem,
  OverspendingAnalysis,
  UserBudget,
  ShoppingItem,
} from '../types';
import { api } from '../services/api';
import confetti from 'canvas-confetti';

export type ActiveTab = 'home' | 'meals' | 'family' | 'shopping' | 'budget' | 'cook-ksh' | 'ai' | 'about' | 'faq' | 'contact' | 'account' | 'notifications' | 'reminders';

interface FinancialSummaryData {
  month: string;
  totalIncomeKsh: number;
  totalSpentKsh: number;
  remainingKsh: number;
  savingsRatePercent: number;
  categoryBreakdown: Record<string, { planned: number; spent: number; color: string }>;
  recentExpenses: Expense[];
  analysis: OverspendingAnalysis;
}

interface AppContextType {
  // Navigation
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // User & State
  user: UserProfile | null;
  // True until the first loadPublicData() round trip resolves (success or
  // failure). Components that display the real user's name/identity must
  // gate on this instead of falling back to a hardcoded placeholder name —
  // user is reliably null during this window even though the caller is
  // already known to be authenticated (AuthGate already confirmed that
  // before AppProvider ever mounts), so null here means "still loading",
  // never "no such user".
  isProfileLoading: boolean;
  household: Household | null;
  mealPlan: WeeklyMealPlan | null;
  starredMealIds: Set<string>;
  toggleStarMeal: (mealId: string) => Promise<void>;
  toggleStarCurrentWeek: () => Promise<void>;
  shoppingList: ShoppingList | null;
  waterLog: WaterLog | null;
  waterConfig: WaterTargetConfig | null;
  waterHistory: WaterLog[];
  foodItems: FoodItem[];
  allMeals: Meal[];
  notifications: NotificationItem[];
  unreadNotifsCount: number;

  // Modals & UI Triggers
  selectedMealForRecipe: Meal | null;
  setSelectedMealForRecipe: (meal: Meal | null) => void;
  selectedMealForSwap: { day: string; mealType: string; meal: Meal } | null;
  setSelectedMealForSwap: (data: { day: string; mealType: string; meal: Meal } | null) => void;
  isPinModalOpen: boolean;
  setIsPinModalOpen: (open: boolean) => void;
  isPinSetupModalOpen: boolean;
  setIsPinSetupModalOpen: (open: boolean) => void;
  isLogExpenseModalOpen: boolean;
  setIsLogExpenseModalOpen: (open: boolean) => void;
  isPremiumModalOpen: boolean;
  setIsPremiumModalOpen: (open: boolean) => void;
  isGeneratePlanModalOpen: boolean;
  setIsGeneratePlanModalOpen: (open: boolean) => void;

  // Budget Security & Private State
  isBudgetUnlocked: boolean;
  financialSummary: FinancialSummaryData | null;
  // Raw editable budget (categories + planned amounts) — separate from the
  // derived financialSummary.categoryBreakdown, which only ever shows a
  // category once something (an expense, or this) has given it a planned
  // amount. Needed so the category editor below has something to edit.
  budget: UserBudget | null;
  unlockBudget: (pin: string) => Promise<boolean>;
  lockBudget: () => Promise<void>;
  setupBudgetPin: (pin: string, confirmPin?: string) => Promise<boolean>;
  refreshFinancialData: () => Promise<void>;
  saveMonthlyIncome: (monthlyIncomeKsh: number, incomeType?: UserBudget['incomeType']) => Promise<void>;
  // Sets or edits one category's planned amount — creates the category if it
  // doesn't exist yet in budget.categories (real users start with none).
  saveCategoryBudget: (category: string, plannedAmountKsh: number) => Promise<void>;

  // Public Actions
  logWater: (amountMl: number) => Promise<void>;
  toggleShoppingItem: (itemId: string) => Promise<void>;
  addManualShoppingItem: (name: string, quantity: number, unit: string, estimatedPriceKsh: number, category?: ShoppingItem['category']) => Promise<void>;
  removeManualShoppingItem: (itemId: string) => Promise<void>;
  swapMeal: (day: string, mealType: string, currentMealId: string, reason?: 'cheaper' | 'faster' | 'random') => Promise<void>;
  regenerateMealPlan: (budgetAware?: boolean) => Promise<boolean>;
  // Gate entry point for the "Generate New Plan" button: checks the server
  // for an existing entitlement and either generates immediately or opens
  // the payment/access-code modal. The actual authorization is enforced
  // server-side regardless of what this reports.
  attemptGeneratePlan: () => Promise<void>;
  updateHousehold: (updated: Household) => Promise<void>;
  refreshAll: () => Promise<void>;
  logExpense: (data: { amountKsh: number; category: string; description: string; date?: string }) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  triggerConfetti: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [household, setHousehold] = useState<Household | null>(null);
  const [mealPlan, setMealPlan] = useState<WeeklyMealPlan | null>(null);
  const [starredMealIds, setStarredMealIds] = useState<Set<string>>(new Set());
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [waterLog, setWaterLog] = useState<WaterLog | null>(null);
  const [waterConfig, setWaterConfig] = useState<WaterTargetConfig | null>(null);
  const [waterHistory, setWaterHistory] = useState<WaterLog[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Modals
  const [selectedMealForRecipe, setSelectedMealForRecipe] = useState<Meal | null>(null);
  const [selectedMealForSwap, setSelectedMealForSwap] = useState<{ day: string; mealType: string; meal: Meal } | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isPinSetupModalOpen, setIsPinSetupModalOpen] = useState(false);
  const [isLogExpenseModalOpen, setIsLogExpenseModalOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isGeneratePlanModalOpen, setIsGeneratePlanModalOpen] = useState(false);

  // Financial Security
  const [isBudgetUnlocked, setIsBudgetUnlocked] = useState<boolean>(false);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummaryData | null>(null);
  const [budget, setBudget] = useState<UserBudget | null>(null);

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#14532D', '#F4B942', '#2E7D32', '#FAF8F2'],
      });
    } catch {
      // safe fallback
    }
  };

  // Load Public / Shareable Application Data
  const loadPublicData = useCallback(async () => {
    try {
      const [uRes, hRes, mpRes, slRes, wRes, fRes, mRes, nRes, starredRes] = await Promise.all([
        api.getMe().catch(() => null),
        api.getHousehold().catch(() => null),
        api.getCurrentMealPlan().catch(() => null),
        api.getShoppingList().catch(() => null),
        api.getWaterData().catch(() => null),
        api.getFoodItems().catch(() => null),
        api.getMeals().catch(() => null),
        api.getNotifications().catch(() => null),
        api.getStarredMeals().catch(() => null),
      ]);

      if (uRes?.user) setUser(uRes.user);
      if (hRes?.household) setHousehold(hRes.household);
      if (mpRes?.mealPlan) setMealPlan(mpRes.mealPlan);
      if (starredRes?.mealIds) setStarredMealIds(new Set(starredRes.mealIds));
      if (slRes?.shoppingList) setShoppingList(slRes.shoppingList);
      if (wRes) {
        setWaterLog(wRes.waterLog);
        setWaterConfig(wRes.config);
        setWaterHistory(wRes.history);
      }
      if (fRes?.items) setFoodItems(fRes.items);
      if (mRes?.meals) setAllMeals(mRes.meals);
      if (nRes?.notifications) setNotifications(nRes.notifications);
    } catch (err) {
      console.error('Error loading MLO initial data:', err);
    } finally {
      // Set regardless of success/failure — a failed profile fetch must
      // stop showing a "loading" placeholder too, not hang forever.
      setIsProfileLoading(false);
    }
  }, []);

  // On mount, check whether the server-side HttpOnly session cookie is still valid.
  // The cookie is sent automatically by the browser — no token management needed here.
  const checkInitialFinancialStatus = useCallback(async () => {
    try {
      const res = await api.checkFinancialStatus();
      if (res.isUnlocked) {
        setIsBudgetUnlocked(true);
        const summary = await api.getFinancialSummary();
        setFinancialSummary(summary);
        const { budget: b } = await api.getBudget().catch(() => ({ budget: null }));
        setBudget(b);
      }
    } catch {
      setIsBudgetUnlocked(false);
      setFinancialSummary(null);
      setBudget(null);
    }
  }, []);

  useEffect(() => {
    loadPublicData();
    checkInitialFinancialStatus();
  }, [loadPublicData, checkInitialFinancialStatus]);

  // Unlock Budget — PIN is verified server-side; the server sets the HttpOnly cookie.
  const unlockBudget = async (pin: string): Promise<boolean> => {
    try {
      const res = await api.unlockBudget(pin);
      if (res.unlocked) {
        setIsBudgetUnlocked(true);
        setIsPinModalOpen(false);
        const summary = await api.getFinancialSummary();
        setFinancialSummary(summary);
        const { budget: b } = await api.getBudget().catch(() => ({ budget: null }));
        setBudget(b);
        return true;
      }
      return false;
    } catch (err: any) {
      throw err;
    }
  };

  // Lock Budget — server clears the HttpOnly cookie; frontend drops cached data.
  const lockBudget = async () => {
    try {
      await api.lockBudget().catch(() => {});
    } finally {
      setIsBudgetUnlocked(false);
      setFinancialSummary(null);
      setBudget(null);
    }
  };

  // Create / change Budget PIN — server sets cookie immediately after setup.
  const setupBudgetPin = async (pin: string, confirmPin?: string): Promise<boolean> => {
    try {
      const res = await api.setupBudgetPin(pin, confirmPin);
      if (res.success) {
        setIsBudgetUnlocked(true);
        setIsPinSetupModalOpen(false);
        if (user) setUser({ ...user, hasBudgetPin: true });
        const summary = await api.getFinancialSummary();
        setFinancialSummary(summary);
        const { budget: b } = await api.getBudget().catch(() => ({ budget: null }));
        setBudget(b);
        triggerConfetti();
        return true;
      }
      return false;
    } catch (err: any) {
      throw err;
    }
  };

  const refreshFinancialData = async () => {
    if (!isBudgetUnlocked) return;
    try {
      const summary = await api.getFinancialSummary();
      setFinancialSummary(summary);
      const { budget: b } = await api.getBudget().catch(() => ({ budget: null }));
      setBudget(b);
    } catch (err: any) {
      if (err.budgetLocked) {
        await lockBudget();
      }
    }
  };

  // Sets/edits the monthly income for the current budget month. Only
  // callable while the Budget is unlocked (requireFinancialSession on the
  // server) — preserves any existing category allocations by fetching the
  // current budget first rather than overwriting it wholesale.
  const saveMonthlyIncome = async (monthlyIncomeKsh: number, incomeType?: UserBudget['incomeType']) => {
    if (!isBudgetUnlocked) return;
    try {
      const { budget: current } = await api.getBudget();
      const currentMonth = new Date().toISOString().slice(0, 7);
      await api.updateBudget({
        ...(current || { id: '', userId: '', month: currentMonth, categories: [], updatedAt: '' }),
        monthlyIncomeKsh,
        incomeType: incomeType || current?.incomeType || 'monthly',
      });
      await refreshFinancialData();
    } catch (err: any) {
      if (err.budgetLocked) await lockBudget();
      throw err;
    }
  };

  // Fixed palette matching server/db.ts's demo-data categories, extended
  // with the three ExpenseCategory values that had no assigned color yet
  // (Shopping/Entertainment/Health) — used only when a category is being
  // created here for the first time; an existing category keeps its stored color.
  const CATEGORY_COLORS: Record<string, string> = {
    Food: '#14532D', Rent: '#3B82F6', Transport: '#F59E0B', Bills: '#8B5CF6',
    Shopping: '#EC4899', Entertainment: '#06B6D4', Health: '#DC2626',
    Savings: '#10B981', Debt: '#EF4444', Other: '#6B7280',
  };

  // Sets or edits one category's planned amount. Real (non-demo) users start
  // with an empty categories array — this is the only place that ever
  // creates a new category, appending it if it doesn't exist yet rather than
  // requiring it to already be there.
  const saveCategoryBudget = async (category: string, plannedAmountKsh: number) => {
    if (!isBudgetUnlocked) return;
    try {
      const { budget: current } = await api.getBudget();
      const currentMonth = new Date().toISOString().slice(0, 7);
      const base = current || { id: '', userId: '', month: currentMonth, monthlyIncomeKsh: 0, incomeType: 'monthly' as const, categories: [], updatedAt: '' };
      const existingIdx = base.categories.findIndex((c) => c.category === category);
      const categories = existingIdx >= 0
        ? base.categories.map((c, i) => (i === existingIdx ? { ...c, plannedAmountKsh } : c))
        : [...base.categories, { category: category as any, plannedAmountKsh, color: CATEGORY_COLORS[category] || '#6B7280' }];
      await api.updateBudget({ ...base, categories });
      await refreshFinancialData();
    } catch (err: any) {
      if (err.budgetLocked) await lockBudget();
      throw err;
    }
  };

  // Water Log Handler
  const logWater = async (amountMl: number) => {
    try {
      const res = await api.logWater(amountMl);
      setWaterLog(res.waterLog);
      // If target reached, celebrate!
      if (waterConfig && res.waterLog.totalMl >= waterConfig.dailyTargetMl && (waterLog?.totalMl || 0) < waterConfig.dailyTargetMl) {
        triggerConfetti();
      }
    } catch (err) {
      console.error('Error logging water:', err);
    }
  };

  // Toggle Shopping Item
  const toggleShoppingItem = async (itemId: string) => {
    if (!shoppingList) return;
    const updatedItems = shoppingList.items.map((item) =>
      item.id === itemId ? { ...item, isPurchased: !item.isPurchased } : item
    );
    const updatedList = { ...shoppingList, items: updatedItems };
    setShoppingList(updatedList);
    await api.updateShoppingList(updatedList).catch(() => {});
  };

  // Manual shopping items (Phase 3B, item 10) — uses the same whole-list PUT
  // contract every other shopping-list write already uses; the server marks
  // it source:'generated' unless told otherwise, so this is the one call
  // site that explicitly sets source:'manual', which is what makes it
  // survive the next meal-plan regeneration (secureDb.saveMealPlan
  // preserves manual rows, replaces generated ones).
  const addManualShoppingItem = async (
    name: string, quantity: number, unit: string, estimatedPriceKsh: number, category?: ShoppingItem['category']
  ) => {
    const base: ShoppingList = shoppingList ?? {
      id: `sl_${Date.now()}`, userId: user?.id || '', weekStartDate: new Date().toISOString().slice(0, 10),
      items: [], updatedAt: new Date().toISOString(),
    };
    const newItem = {
      // Empty string (not 'other') when category is omitted — the user
      // picked "Food" in the add form, so an empty/falsy category here lets
      // the server infer the specific food subcategory from the name
      // instead of dumping it under "Other". See mergeShoppingItems'
      // category fallback in server/shoppingCanonicalization.ts.
      id: `manual_${Date.now()}`, category: (category || '') as ShoppingItem['category'], name, quantity, unit,
      estimatedPriceKsh, isPurchased: false, frequency: 'weekly' as const, source: 'manual' as const,
    };
    const updatedList = { ...base, items: [...base.items, newItem] };
    setShoppingList(updatedList);
    await api.updateShoppingList(updatedList).catch(() => {});
    const fresh = await api.getShoppingList().catch(() => null);
    if (fresh?.shoppingList) setShoppingList(fresh.shoppingList);
  };

  const removeManualShoppingItem = async (itemId: string) => {
    if (!shoppingList) return;
    const updatedList = { ...shoppingList, items: shoppingList.items.filter((i) => i.id !== itemId) };
    setShoppingList(updatedList);
    await api.updateShoppingList(updatedList).catch(() => {});
  };

  // Swap Meal
  const swapMeal = async (day: string, mealType: string, currentMealId: string, reason?: 'cheaper' | 'faster' | 'random') => {
    try {
      const res = await api.swapMeal({ day, mealType, currentMealId, reason });
      setMealPlan(res.mealPlan);
      // Refresh shopping list since ingredients changed
      const sRes = await api.getShoppingList();
      if (sRes?.shoppingList) setShoppingList(sRes.shoppingList);
      setSelectedMealForSwap(null);
    } catch (err) {
      console.error('Error swapping meal:', err);
    }
  };

  // Meal starring (Meal-Variety Engine v1) — "I liked this meal/week."
  // Starring a meal softens its cross-week repetition penalty in future
  // generations; starring the current week protects it from being
  // overwritten by a future regenerate/swap (the server rejects those with
  // a 409 for a starred week — surfaced here as a thrown error the caller
  // can catch and show).
  const toggleStarMeal = async (mealId: string) => {
    const alreadyStarred = starredMealIds.has(mealId);
    if (alreadyStarred) await api.unstarMeal(mealId); else await api.starMeal(mealId);
    setStarredMealIds((prev) => {
      const next = new Set(prev);
      if (alreadyStarred) next.delete(mealId); else next.add(mealId);
      return next;
    });
  };

  const toggleStarCurrentWeek = async () => {
    if (!mealPlan) return;
    if (mealPlan.isStarred) {
      await api.unstarMealPlanWeek(mealPlan.weekStartDate);
      setMealPlan({ ...mealPlan, isStarred: false });
    } else {
      await api.starMealPlanWeek(mealPlan.weekStartDate);
      setMealPlan({ ...mealPlan, isStarred: true });
    }
  };

  // Regenerate Meal Plan. Does not check entitlement itself — the server's
  // POST /api/meal-plans/generate is the sole authority and returns 402
  // PAYMENT_REQUIRED if the caller has none; callers that want the
  // check-then-generate-or-pay flow should go through attemptGeneratePlan
  // below instead of calling this directly. Rethrows on failure so a caller
  // can distinguish PAYMENT_REQUIRED (err.code) from any other error.
  const regenerateMealPlan = async (budgetAware = false): Promise<boolean> => {
    const res = await api.generateMealPlan({ budgetAware });
    setMealPlan(res.mealPlan);
    const sRes = await api.getShoppingList();
    if (sRes?.shoppingList) setShoppingList(sRes.shoppingList);
    triggerConfetti();
    return true;
  };

  // Entry point for the "Generate New Plan" button. Asks the server whether
  // an entitlement already exists; if so, generates immediately, otherwise
  // opens the payment/access-code modal instead of attempting generation.
  const attemptGeneratePlan = async () => {
    try {
      const { hasEntitlement } = await api.getGenerationEntitlementStatus();
      if (hasEntitlement) {
        await regenerateMealPlan(false);
      } else {
        setIsGeneratePlanModalOpen(true);
      }
    } catch (err: any) {
      if (err?.code === 'PAYMENT_REQUIRED') {
        // Rare race: entitlement-status said yes but generate() itself
        // (the real authority) said no by the time it ran — fall back to
        // the modal rather than silently failing.
        setIsGeneratePlanModalOpen(true);
      } else {
        console.error('Error checking meal-plan generation entitlement:', err);
      }
    }
  };

  // Update Household
  const updateHousehold = async (updated: Household) => {
    try {
      const res = await api.updateHousehold(updated);
      setHousehold(res.household);
    } catch (err) {
      console.error('Error updating household:', err);
    }
  };

  // Log Expense
  const logExpense = async (data: { amountKsh: number; category: string; description: string; date?: string }) => {
    try {
      await api.addExpense(data);
      await refreshFinancialData();
      setIsLogExpenseModalOpen(false);
    } catch (err) {
      console.error('Error logging expense:', err);
      throw err;
    }
  };

  // Delete Expense
  const deleteExpense = async (id: string) => {
    try {
      await api.deleteExpense(id);
      await refreshFinancialData();
    } catch (err) {
      console.error('Error deleting expense:', err);
    }
  };

  // Notifications
  const markNotificationAsRead = async (id: string) => {
    await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const unreadNotifsCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        user,
        isProfileLoading,
        household,
        mealPlan,
        starredMealIds,
        toggleStarMeal,
        toggleStarCurrentWeek,
        shoppingList,
        waterLog,
        waterConfig,
        waterHistory,
        foodItems,
        allMeals,
        notifications,
        unreadNotifsCount,
        selectedMealForRecipe,
        setSelectedMealForRecipe,
        selectedMealForSwap,
        setSelectedMealForSwap,
        isPinModalOpen,
        setIsPinModalOpen,
        isPinSetupModalOpen,
        setIsPinSetupModalOpen,
        isLogExpenseModalOpen,
        setIsLogExpenseModalOpen,
        isPremiumModalOpen,
        setIsPremiumModalOpen,
        isGeneratePlanModalOpen,
        setIsGeneratePlanModalOpen,
        isBudgetUnlocked,
        financialSummary,
        budget,
        unlockBudget,
        lockBudget,
        setupBudgetPin,
        refreshFinancialData,
        saveMonthlyIncome,
        saveCategoryBudget,
        logWater,
        toggleShoppingItem,
        addManualShoppingItem,
        removeManualShoppingItem,
        swapMeal,
        regenerateMealPlan,
        attemptGeneratePlan,
        updateHousehold,
        refreshAll: loadPublicData,
        logExpense,
        deleteExpense,
        markNotificationAsRead,
        triggerConfetti,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
