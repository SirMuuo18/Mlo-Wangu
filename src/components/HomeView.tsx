import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Utensils,
  Clock,
  Coins,
  Droplet,
  Users,
  Lock,
  Unlock,
  ArrowRight,
  RefreshCw,
  Eye,
  Plus,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ChefHat,
  ShoppingBag,
  Bot,
} from 'lucide-react';
import { DayOfWeek, Meal } from '../types';

export const HomeView: React.FC = () => {
  const {
    user,
    household,
    mealPlan,
    waterLog,
    waterConfig,
    logWater,
    isBudgetUnlocked,
    financialSummary,
    lockBudget,
    setIsPinModalOpen,
    setSelectedMealForRecipe,
    setSelectedMealForSwap,
    setActiveTab,
    setIsLogExpenseModalOpen,
  } = useApp();

  const [customWaterAmount, setCustomWaterAmount] = useState('');
  const [showCustomWater, setShowCustomWater] = useState(false);

  // Derive greeting by time of day
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  if (hour >= 17) greeting = 'Good evening';

  // Get today's day of week
  const dayNames: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = dayNames[new Date().getDay()];
  const effectiveDay: DayOfWeek = todayName === 'Sunday' ? 'Sunday' : todayName;

  const todayMeals = mealPlan?.days[effectiveDay] || {
    breakfast: undefined,
    lunch: undefined,
    dinner: undefined,
  };

  const glassesDrank = waterLog ? Math.floor(waterLog.totalMl / (waterConfig?.glassSizeMl || 250)) : 0;
  const totalGlassesTarget = waterConfig ? Math.floor(waterConfig.dailyTargetMl / (waterConfig?.glassSizeMl || 250)) : 8;
  const waterProgressPercent = waterConfig ? Math.min(100, Math.round(((waterLog?.totalMl || 0) / waterConfig.dailyTargetMl) * 100)) : 0;

  const handleCustomWaterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ml = Number(customWaterAmount);
    if (ml > 0) {
      logWater(ml);
      setCustomWaterAmount('');
      setShowCustomWater(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Greeting Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17201A] tracking-tight">
              {greeting}, {user?.name ? user.name.split(' ')[0] : 'Mwangi'} 👋
            </h1>
          </div>
          <p className="text-sm text-[#66736A] mt-1">
            Let's plan healthy Kenyan meals, track hydration, and protect your family budget today.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('cook-ksh')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#14532D] text-white text-xs font-bold hover:bg-[#0f3e22] transition-all shadow-xs cursor-pointer"
          >
            <ChefHat className="w-4 h-4 text-[#F4B942]" />
            What Can I Cook?
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold hover:bg-[#FDE68A] transition-all cursor-pointer"
          >
            <Bot className="w-4 h-4 text-[#D97706]" />
            AI Assistant
          </button>
        </div>
      </div>

      {/* Main Grid: Left column (Meals & Water) + Right column (Family & Budget) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Today's Meals */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's Meals Section */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#F1EFE8]">
              <div>
                <div className="flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-[#14532D]" />
                  <h2 className="text-lg font-extrabold text-[#17201A]">Today's Meals ({effectiveDay})</h2>
                </div>
                <p className="text-xs text-[#66736A] mt-0.5">
                  Nutritious Kenyan family plan scaled for {household?.members?.length || 5} members
                </p>
              </div>

              <button
                onClick={() => setActiveTab('meals')}
                className="text-xs font-bold text-[#14532D] hover:underline flex items-center gap-1 cursor-pointer"
              >
                Full Week
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
              {/* Breakfast Card */}
              <MealCardItem
                label="Breakfast"
                meal={todayMeals.breakfast}
                onViewRecipe={() => todayMeals.breakfast && setSelectedMealForRecipe(todayMeals.breakfast)}
                onSwap={() =>
                  todayMeals.breakfast &&
                  setSelectedMealForSwap({ day: effectiveDay, mealType: 'breakfast', meal: todayMeals.breakfast })
                }
              />

              {/* Lunch Card */}
              <MealCardItem
                label="Lunch"
                meal={todayMeals.lunch}
                onViewRecipe={() => todayMeals.lunch && setSelectedMealForRecipe(todayMeals.lunch)}
                onSwap={() =>
                  todayMeals.lunch &&
                  setSelectedMealForSwap({ day: effectiveDay, mealType: 'lunch', meal: todayMeals.lunch })
                }
              />

              {/* Dinner Card */}
              <MealCardItem
                label="Dinner"
                meal={todayMeals.dinner}
                onViewRecipe={() => todayMeals.dinner && setSelectedMealForRecipe(todayMeals.dinner)}
                onSwap={() =>
                  todayMeals.dinner &&
                  setSelectedMealForSwap({ day: effectiveDay, mealType: 'dinner', meal: todayMeals.dinner })
                }
              />
            </div>
          </div>

          {/* Hydration / Water Tracker Widget */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Droplet className="w-5 h-5 fill-blue-500" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#17201A]">Hydration & Water Tracker</h3>
                  <p className="text-xs text-[#66736A]">
                    {glassesDrank} / {totalGlassesTarget} glasses today ({waterLog?.totalMl || 0} /{' '}
                    {waterConfig?.dailyTargetMl || 2000} ml)
                  </p>
                </div>
              </div>

              <span className="text-sm font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-100">
                {waterProgressPercent}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mt-4 w-full bg-[#F1EFE8] h-3 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-400 to-blue-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${waterProgressPercent}%` }}
              />
            </div>

            {/* Quick Log Buttons */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => logWater(250)}
                className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all border border-blue-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                +250 ml (1 glass)
              </button>

              <button
                onClick={() => logWater(500)}
                className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all border border-blue-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                +500 ml (Bottle)
              </button>

              <button
                onClick={() => setShowCustomWater(!showCustomWater)}
                className="px-3 py-2 rounded-xl bg-[#FAF8F2] hover:bg-[#F1EFE8] text-[#17201A] text-xs font-bold border border-[#E8E5DD] cursor-pointer"
              >
                Custom
              </button>
            </div>

            {/* Custom Input */}
            {showCustomWater && (
              <form onSubmit={handleCustomWaterSubmit} className="mt-3 flex items-center gap-2 animate-in fade-in">
                <input
                  type="number"
                  placeholder="Enter ml (e.g. 350)"
                  value={customWaterAmount}
                  onChange={(e) => setCustomWaterAmount(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#FAF8F2] border border-[#E8E5DD] text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 cursor-pointer"
                >
                  Log
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right 1 Col: Family Card & Budget Privacy Card */}
        <div className="space-y-6">
          {/* Family Card */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#F1EFE8]">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#14532D]" />
                <h3 className="text-base font-extrabold text-[#17201A]">Your Family</h3>
              </div>
              <span className="text-xs bg-[#FAF8F2] border border-[#E8E5DD] px-2 py-0.5 rounded-full font-bold text-[#14532D]">
                {household?.members?.length || 5} Members
              </span>
            </div>

            <div className="mt-3">
              <p className="text-xs font-bold text-[#66736A] uppercase tracking-wider">Tonight's Family Dinner</p>
              <p className="text-sm font-extrabold text-[#17201A] mt-0.5">
                {todayMeals.dinner ? todayMeals.dinner.name : 'Ugali with Sukuma Wiki & Fried Eggs'}
              </p>
              {todayMeals.dinner?.swahiliName && (
                <p className="text-xs text-[#14532D] italic font-medium mt-0.5">
                  {todayMeals.dinner.swahiliName}
                </p>
              )}
            </div>

            {/* Members summary pills */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {household?.members?.map((m) => (
                <span
                  key={m.id}
                  className="text-[11px] bg-[#FAF8F2] border border-[#E8E5DD] px-2.5 py-1 rounded-xl text-[#17201A] font-semibold"
                >
                  {m.name.split(' ')[0]} ({m.ageGroup})
                </span>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-[#F1EFE8] flex items-center justify-between">
              <button
                onClick={() => setActiveTab('family')}
                className="w-full py-2 px-3 rounded-xl bg-[#FAF8F2] hover:bg-[#F1EFE8] text-[#14532D] text-xs font-bold text-center border border-[#E8E5DD] transition-all cursor-pointer"
              >
                View Family Plan & Preferences
              </button>
            </div>
          </div>

          {/* CRITICAL: Budget Privacy Card */}
          {/* Strict Separation: NO financial numbers leak when locked */}
          {!isBudgetUnlocked ? (
            <div className="bg-[#172554] text-white p-5 sm:p-6 rounded-3xl shadow-sm border border-[#1e3a8a] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Lock className="w-24 h-24" />
              </div>

              <div className="relative z-10">
                <div className="flex items-center gap-2 text-[#93C5FD]">
                  <Lock className="w-4 h-4" />
                  <span className="text-xs font-bold tracking-wider uppercase">Privacy Protected</span>
                </div>

                <h3 className="text-xl font-extrabold mt-2 text-white">Budget & Expenses</h3>
                <p className="text-xs text-blue-200 mt-1 leading-relaxed">
                  Your salary, monthly spending, rent and private family financial goals are securely encrypted.
                </p>

                <div className="mt-5">
                  <button
                    onClick={() => setIsPinModalOpen(true)}
                    className="w-full py-2.5 px-4 bg-[#F4B942] hover:bg-[#E5A72E] text-[#17201A] font-extrabold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Unlock className="w-4 h-4" />
                    Unlock Budget with PIN
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-5 sm:p-6 rounded-3xl border-2 border-[#BFDBFE] bg-gradient-to-b from-[#EFF6FF] to-white shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-blue-100">
                <div className="flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-[#2563EB]" />
                  <h3 className="text-sm font-extrabold text-[#172554]">Budget Active (Unlocked)</h3>
                </div>

                <button
                  onClick={lockBudget}
                  className="text-[11px] bg-[#2563EB] text-white px-2 py-0.5 rounded font-bold hover:bg-blue-700 cursor-pointer"
                >
                  Lock
                </button>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#66736A]">Total Spent:</span>
                  <span className="text-base font-extrabold text-[#17201A] tabular-nums">
                    KSh {(financialSummary?.totalSpentKsh ?? 17450).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#66736A]">Remaining:</span>
                  <span className="text-base font-extrabold text-[#2E7D32] tabular-nums">
                    KSh {(financialSummary?.remainingKsh ?? 12550).toLocaleString()}
                  </span>
                </div>

                {/* Overspending Indicator */}
                {financialSummary?.analysis && (
                  <div
                    className={`mt-2 p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                      financialSummary.analysis.isOverspending
                        ? 'bg-amber-50 text-amber-900 border border-amber-200'
                        : 'bg-green-50 text-green-900 border border-green-200'
                    }`}
                  >
                    {financialSummary.analysis.isOverspending ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-600 shrink-0" />
                    )}
                    <span className="text-[11px] leading-tight line-clamp-2">
                      {financialSummary.analysis.alertMessage}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-blue-100 flex items-center gap-2">
                <button
                  onClick={() => setIsLogExpenseModalOpen(true)}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#172554] text-white text-xs font-bold hover:bg-[#1e3a8a] text-center transition-all cursor-pointer"
                >
                  + Log Expense
                </button>
                <button
                  onClick={() => setActiveTab('budget')}
                  className="py-2 px-3 rounded-xl bg-white border border-[#BFDBFE] text-[#172554] text-xs font-bold hover:bg-blue-50 text-center cursor-pointer"
                >
                  Dashboard
                </button>
              </div>
            </div>
          )}

          {/* Quick Grocery Shortcut */}
          <div
            onClick={() => setActiveTab('shopping')}
            className="bg-white p-4 rounded-3xl border border-[#E8E5DD] hover:border-[#14532D] transition-all cursor-pointer flex items-center justify-between shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#FAF8F2] text-[#14532D] border border-[#E8E5DD]">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#17201A]">Family Shopping List</h4>
                <p className="text-[11px] text-[#66736A]">Auto-aggregated from this week's meals</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#66736A]" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Extracted Sub-Component for Meal Cards on Home
const MealCardItem: React.FC<{
  label: string;
  meal?: Meal;
  onViewRecipe: () => void;
  onSwap: () => void;
}> = ({ label, meal, onViewRecipe, onSwap }) => {
  if (!meal) {
    return (
      <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-dashed border-[#E8E5DD] text-center">
        <p className="text-xs font-bold text-[#66736A]">{label}</p>
        <p className="text-xs text-[#9CA3AF] mt-2">No meal scheduled</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD] flex flex-col justify-between hover:border-[#14532D]/40 transition-all">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold text-[#14532D] uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-[#E8E5DD]">
            {label}
          </span>
          <span className="text-[11px] text-[#66736A] flex items-center gap-1 font-medium">
            <Clock className="w-3 h-3 text-[#66736A]" />
            {meal.prepTimeMinutes}m
          </span>
        </div>

        <h4 className="text-sm font-extrabold text-[#17201A] mt-2 line-clamp-2 leading-snug">
          {meal.name}
        </h4>

        {meal.swahiliName && (
          <p className="text-[11px] text-[#14532D] italic font-medium mt-0.5 line-clamp-1">
            {meal.swahiliName}
          </p>
        )}

        <div className="mt-2 flex items-center gap-1 text-[11px] text-[#66736A] font-semibold">
          <Coins className="w-3 h-3 text-[#D97706]" />
          <span>Est. KSh {meal.estimatedCostKsh} (Family)</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[#E8E5DD] flex items-center justify-between gap-2">
        <button
          onClick={onViewRecipe}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-white border border-[#E8E5DD] text-[11px] font-bold text-[#17201A] hover:bg-[#F1EFE8] cursor-pointer"
        >
          <Eye className="w-3 h-3 text-[#14532D]" />
          Recipe
        </button>

        <button
          onClick={onSwap}
          title="Swap meal with alternative"
          className="p-1.5 rounded-lg bg-white border border-[#E8E5DD] text-[11px] font-bold text-[#66736A] hover:text-[#17201A] hover:bg-[#F1EFE8] cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
