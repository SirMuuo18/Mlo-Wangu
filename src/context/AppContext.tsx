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
} from '../types';
import { api, setFinancialToken, getStoredFinancialToken } from '../services/api';
import confetti from 'canvas-confetti';

export type ActiveTab = 'home' | 'meals' | 'family' | 'shopping' | 'budget' | 'cook-ksh' | 'ai' | 'admin';

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
  household: Household | null;
  mealPlan: WeeklyMealPlan | null;
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

  // Budget Security & Private State
  isBudgetUnlocked: boolean;
  financialSummary: FinancialSummaryData | null;
  unlockBudget: (pin: string) => Promise<boolean>;
  lockBudget: () => Promise<void>;
  setupBudgetPin: (pin: string) => Promise<boolean>;
  refreshFinancialData: () => Promise<void>;

  // Public Actions
  logWater: (amountMl: number) => Promise<void>;
  toggleShoppingItem: (itemId: string) => Promise<void>;
  swapMeal: (day: string, mealType: string, currentMealId: string, reason?: 'cheaper' | 'faster' | 'random') => Promise<void>;
  regenerateMealPlan: (budgetAware?: boolean) => Promise<void>;
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
  const [household, setHousehold] = useState<Household | null>(null);
  const [mealPlan, setMealPlan] = useState<WeeklyMealPlan | null>(null);
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

  // Financial Security
  const [isBudgetUnlocked, setIsBudgetUnlocked] = useState<boolean>(false);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummaryData | null>(null);

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
      const [uRes, hRes, mpRes, slRes, wRes, fRes, mRes, nRes] = await Promise.all([
        api.getMe().catch(() => null),
        api.getHousehold().catch(() => null),
        api.getCurrentMealPlan().catch(() => null),
        api.getShoppingList().catch(() => null),
        api.getWaterData().catch(() => null),
        api.getFoodItems().catch(() => null),
        api.getMeals().catch(() => null),
        api.getNotifications().catch(() => null),
      ]);

      if (uRes?.user) setUser(uRes.user);
      if (hRes?.household) setHousehold(hRes.household);
      if (mpRes?.mealPlan) setMealPlan(mpRes.mealPlan);
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
    }
  }, []);

  // Check if there is an existing financial session on load
  const checkInitialFinancialStatus = useCallback(async () => {
    const existingToken = getStoredFinancialToken();
    if (existingToken) {
      try {
        const res = await api.checkFinancialStatus();
        if (res.isUnlocked) {
          setIsBudgetUnlocked(true);
          const summary = await api.getFinancialSummary();
          setFinancialSummary(summary);
        } else {
          setFinancialToken(null);
          setIsBudgetUnlocked(false);
          setFinancialSummary(null);
        }
      } catch {
        setFinancialToken(null);
        setIsBudgetUnlocked(false);
        setFinancialSummary(null);
      }
    }
  }, []);

  useEffect(() => {
    loadPublicData();
    checkInitialFinancialStatus();
  }, [loadPublicData, checkInitialFinancialStatus]);

  // Unlock Budget Method (Verifies PIN server-side, saves session token)
  const unlockBudget = async (pin: string): Promise<boolean> => {
    try {
      const res = await api.unlockBudget(pin);
      if (res.unlocked && res.financialToken) {
        setFinancialToken(res.financialToken);
        setIsBudgetUnlocked(true);
        setIsPinModalOpen(false);

        // Fetch private financial summary
        const summary = await api.getFinancialSummary();
        setFinancialSummary(summary);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('PIN verification error:', err);
      throw err;
    }
  };

  // Lock Budget Method (Purges tokens on server & client)
  const lockBudget = async () => {
    try {
      await api.lockBudget().catch(() => {});
    } finally {
      setFinancialToken(null);
      setIsBudgetUnlocked(false);
      setFinancialSummary(null);
    }
  };

  // Setup New Budget PIN
  const setupBudgetPin = async (pin: string): Promise<boolean> => {
    try {
      const res = await api.setupBudgetPin(pin);
      if (res.success && res.financialToken) {
        setFinancialToken(res.financialToken);
        setIsBudgetUnlocked(true);
        setIsPinSetupModalOpen(false);
        if (user) {
          setUser({ ...user, hasBudgetPin: true });
        }
        const summary = await api.getFinancialSummary();
        setFinancialSummary(summary);
        triggerConfetti();
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('PIN setup error:', err);
      throw err;
    }
  };

  const refreshFinancialData = async () => {
    if (!isBudgetUnlocked) return;
    try {
      const summary = await api.getFinancialSummary();
      setFinancialSummary(summary);
    } catch (err: any) {
      if (err.budgetLocked) {
        await lockBudget();
      }
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

  // Regenerate Meal Plan
  const regenerateMealPlan = async (budgetAware = false) => {
    try {
      const res = await api.generateMealPlan({ budgetAware });
      setMealPlan(res.mealPlan);
      const sRes = await api.getShoppingList();
      if (sRes?.shoppingList) setShoppingList(sRes.shoppingList);
      triggerConfetti();
    } catch (err) {
      console.error('Error generating meal plan:', err);
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
        household,
        mealPlan,
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
        isBudgetUnlocked,
        financialSummary,
        unlockBudget,
        lockBudget,
        setupBudgetPin,
        refreshFinancialData,
        logWater,
        toggleShoppingItem,
        swapMeal,
        regenerateMealPlan,
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
