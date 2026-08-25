import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Wallet,
  Lock,
  Unlock,
  Shield,
  PlusCircle,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Coins,
  DollarSign,
  PieChart,
  Calendar,
  Trash2,
  Sliders,
  Check,
  Scale,
  ShoppingBag,
  Users,
  Utensils,
  Edit3,
  X,
} from 'lucide-react';
import { getFoodImageUrl } from '../utils/foodImages';
import { calculateIngredientForPortions } from '../utils/ingredientCalculator';

export const BudgetView: React.FC = () => {
  const {
    isBudgetUnlocked,
    financialSummary,
    lockBudget,
    setIsPinModalOpen,
    setIsLogExpenseModalOpen,
    setIsPinSetupModalOpen,
    deleteExpense,
    household,
    saveMonthlyIncome,
    saveCategoryBudget,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'estimator' | 'expenses' | 'planner'>('overview');
  const [calcPortions, setCalcPortions] = useState<number>(household?.members?.length || 5);
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState('');
  const [isSavingIncome, setIsSavingIncome] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryAmountInput, setCategoryAmountInput] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const ALL_CATEGORIES = ['Food', 'Rent', 'Transport', 'Bills', 'Shopping', 'Entertainment', 'Health', 'Savings', 'Debt', 'Other'];

  const handleSaveCategory = async (category: string) => {
    const amount = Number(categoryAmountInput);
    if (!Number.isFinite(amount) || amount < 0) return;
    setIsSavingCategory(true);
    try {
      await saveCategoryBudget(category, Math.round(amount));
      setEditingCategory(null);
      setNewCategoryName('');
    } catch {
      // refreshFinancialData/lockBudget inside saveCategoryBudget already
      // handles a locked/expired session; nothing extra to do here.
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSaveIncome = async () => {
    const amount = Number(incomeInput);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setIsSavingIncome(true);
    try {
      await saveMonthlyIncome(Math.round(amount));
      setIsEditingIncome(false);
    } catch {
      // refreshFinancialData/lockBudget inside saveMonthlyIncome already
      // handles a locked/expired session; nothing extra to do here.
    } finally {
      setIsSavingIncome(false);
    }
  };

  // Key Kenyan market grocery benchmark items for the interactive calculator
  const estimatorItems = [
    { name: 'Beef (Butchery)', baseKey: 'beef', defaultCategory: 'meat' },
    { name: 'Sukuma Wiki (Mama Mboga)', baseKey: 'sukuma', defaultCategory: 'greens' },
    { name: 'Maize Flour (Unga ya Ugali)', baseKey: 'unga', defaultCategory: 'flour_staple' },
    { name: 'Pishori Rice (Mchele)', baseKey: 'rice', defaultCategory: 'rice_grain' },
    { name: 'Boiled Yellow Beans', baseKey: 'beans', defaultCategory: 'legume' },
    { name: 'Irish Potatoes (Waru)', baseKey: 'potatoes', defaultCategory: 'tubers' },
    { name: 'Fresh Tomatoes & Onions', baseKey: 'tomatoes', defaultCategory: 'aromatics' },
    { name: 'Vegetable Cooking Oil', baseKey: 'cooking_oil', defaultCategory: 'oil_spices' },
  ];

  // If budget is LOCKED, display the secure privacy shield
  if (!isBudgetUnlocked) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center animate-in fade-in duration-200">
        <div className="bg-[#172554] text-white p-8 sm:p-10 rounded-3xl shadow-xl border border-[#1e3a8a] relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4 border border-white/20">
            <Lock className="w-8 h-8 text-[#F4B942]" />
          </div>

          <span className="text-xs font-bold text-[#93C5FD] uppercase tracking-wider">
            Protected Financial Records
          </span>

          <h1 className="text-2xl sm:text-3xl font-extrabold mt-2 text-white">Private Budget Locked</h1>

          <p className="text-xs sm:text-sm text-blue-200 mt-2 leading-relaxed max-w-md mx-auto">
            Your household salary, monthly income, rent, food expenses, savings targets, and overspending analysis are strictly private to you.
          </p>

          <div className="mt-8 space-y-3">
            <button
              onClick={() => setIsPinModalOpen(true)}
              className="w-full py-3.5 px-6 bg-[#F4B942] hover:bg-[#E5A72E] text-[#17201A] font-extrabold text-sm rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              Enter PIN to Unlock Budget
            </button>

            <button
              onClick={() => setIsPinSetupModalOpen(true)}
              className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Change or Reset Budget PIN
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-center gap-2 text-[11px] text-blue-300">
            <Shield className="w-4 h-4 text-[#F4B942]" />
            <span>PBKDF2 Hashed Security • Auto-Locks After 15 Minutes</span>
          </div>
        </div>
      </div>
    );
  }

  // If budget is UNLOCKED, display full dashboard
  const summary = financialSummary;
  const analysis = summary?.analysis;

  // Compute total grocery cost for the active portions in the estimator
  const calculatedItems = estimatorItems.map((item) => calculateIngredientForPortions(item.name, calcPortions));
  const totalEstimatorCostKsh = calculatedItems.reduce((acc, curr) => acc + curr.estimatedCostKsh, 0);
  const totalEstimatorKg = calculatedItems.reduce((acc, curr) => acc + (curr.totalKgEstimate || 0), 0);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Banner: Active Financial Session with 1-Click Lock */}
      <div className="bg-[#172554] text-white p-5 sm:p-6 rounded-3xl shadow-sm border border-[#1e3a8a] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-white/10 text-[#F4B942] border border-white/20">
            <Unlock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">Private Budget Dashboard</h1>
              <span className="text-[10px] bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-bold border border-green-400/30">
                Session Active
              </span>
            </div>
            <p className="text-xs text-blue-200 mt-0.5">
              Financial data visible • Auto-locks after 15 minutes of inactivity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLogExpenseModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F4B942] text-[#17201A] text-xs font-extrabold hover:bg-[#E5A72E] transition-all shadow-xs cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            + Log Expense
          </button>

          <button
            onClick={lockBudget}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition-all border border-white/20 cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            Lock Now
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-2xl border border-[#E8E5DD] shadow-xs">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeSubTab === 'overview'
              ? 'bg-[#172554] text-white shadow-xs'
              : 'text-[#66736A] hover:bg-[#FAF8F2] hover:text-[#17201A]'
          }`}
        >
          Overview & Velocity
        </button>

        <button
          onClick={() => setActiveSubTab('estimator')}
          className={`flex-1 min-w-[140px] py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'estimator'
              ? 'bg-[#14532D] text-white shadow-xs'
              : 'text-[#14532D] hover:bg-[#FAF8F2] font-black'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          Portion & Grocery Calculator
        </button>

        <button
          onClick={() => setActiveSubTab('expenses')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeSubTab === 'expenses'
              ? 'bg-[#172554] text-white shadow-xs'
              : 'text-[#66736A] hover:bg-[#FAF8F2] hover:text-[#17201A]'
          }`}
        >
          Expense Logs ({summary?.recentExpenses?.length || 0})
        </button>

        <button
          onClick={() => setActiveSubTab('planner')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeSubTab === 'planner'
              ? 'bg-[#172554] text-white shadow-xs'
              : 'text-[#66736A] hover:bg-[#FAF8F2] hover:text-[#17201A]'
          }`}
        >
          Salary Allocation
        </button>
      </div>

      {/* SUB-VIEW 1: OVERVIEW & OVERSPENDING VELOCITY */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#66736A] uppercase">Monthly Income</span>
                {!isEditingIncome && (
                  <button
                    onClick={() => { setIncomeInput(String(summary?.totalIncomeKsh || '')); setIsEditingIncome(true); }}
                    className="p-1 text-[#66736A] hover:text-[#17201A] rounded-lg hover:bg-gray-100 cursor-pointer"
                    title={summary?.totalIncomeKsh ? 'Edit monthly income' : 'Set monthly income'}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isEditingIncome ? (
                <div className="mt-1.5 space-y-2">
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    autoFocus
                    placeholder="e.g. 50000"
                    value={incomeInput}
                    onChange={(e) => setIncomeInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#FAF8F2] border border-[#E8E5DD] rounded-lg text-sm font-bold text-[#17201A] focus:outline-none focus:ring-2 focus:ring-[#14532D]/30"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleSaveIncome}
                      disabled={isSavingIncome}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#14532D] text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" /> {isSavingIncome ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setIsEditingIncome(false)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E8E5DD] text-[10px] font-bold cursor-pointer"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-2xl font-black text-[#17201A] mt-1 tabular-nums">
                    KSh {(summary?.totalIncomeKsh ?? 0).toLocaleString()}
                  </p>
                  <span className="text-[10px] text-[#2E7D32] font-semibold mt-1 block">
                    {summary?.totalIncomeKsh ? 'Active Monthly Budget' : 'Not set — click to add your salary'}
                  </span>
                </>
              )}
            </div>

            <div className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs">
              <span className="text-[11px] font-bold text-[#66736A] uppercase">Total Spent</span>
              <p className="text-2xl font-black text-[#17201A] mt-1 tabular-nums">
                KSh {(summary?.totalSpentKsh ?? 0).toLocaleString()}
              </p>
              <span className="text-[10px] text-[#66736A] mt-1 block">
                {summary?.totalIncomeKsh ? Math.round(((summary?.totalSpentKsh || 0) / summary.totalIncomeKsh) * 100) : 0}% of income used
              </span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs">
              <span className="text-[11px] font-bold text-[#66736A] uppercase">Remaining Safe Money</span>
              <p className="text-2xl font-black text-[#2E7D32] mt-1 tabular-nums">
                KSh {(summary?.remainingKsh ?? 0).toLocaleString()}
              </p>
              <span className="text-[10px] text-[#2E7D32] font-semibold mt-1 block">
                ~KSh {analysis?.dailySafeSpendingKsh || 0} / day left
              </span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs">
              <span className="text-[11px] font-bold text-[#66736A] uppercase">Savings & Goals</span>
              <p className="text-2xl font-black text-[#14532D] mt-1 tabular-nums">
                KSh {(summary?.remainingKsh && summary.remainingKsh > 0 ? summary.remainingKsh : 0).toLocaleString()}
              </p>
              <span className="text-[10px] text-[#14532D] font-bold mt-1 block">
                {summary?.totalIncomeKsh ? `${summary.savingsRatePercent}% Savings Rate` : 'No income set yet'}
              </span>
            </div>
          </div>

          {/* Overspending Analysis Card */}
          {analysis && (
            <div
              className={`p-5 sm:p-6 rounded-3xl border transition-all ${
                analysis.isOverspending
                  ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                  : 'bg-green-50/70 border-green-200 text-green-950'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2.5 rounded-2xl mt-0.5 ${
                      analysis.isOverspending ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {analysis.isOverspending ? (
                      <AlertTriangle className="w-6 h-6" />
                    ) : (
                      <TrendingDown className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold">
                      {analysis.isOverspending ? 'Spending Velocity Alert' : 'Healthy Spending Pace'}
                    </h3>
                    <p className="text-xs mt-1 leading-relaxed">{analysis.alertMessage}</p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] font-bold uppercase opacity-75">Month-End Projection</span>
                  <p className="text-base font-black tabular-nums">
                    KSh {(analysis?.projectedMonthEndSpendKsh ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {analysis.recommendations && analysis.recommendations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-current/10 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider block">
                    Recommended Action:
                  </span>
                  {analysis.recommendations.map((rec, idx) => (
                    <p key={idx} className="text-xs font-medium flex items-center gap-1.5">
                      <span>•</span>
                      <span>{rec}</span>
                    </p>
                  ))}
                </div>
              )}

              {analysis.warnings && analysis.warnings.length > 0 && (
                <div className="mt-4 pt-3 border-t border-current/10 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider block">
                    Budget Warnings:
                  </span>
                  {analysis.warnings.map((w, idx) => (
                    <p key={idx} className="text-xs font-medium flex items-center gap-1.5">
                      <span>•</span>
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Category Budget Progress with Photo Placeholders */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#F1EFE8]">
              <div>
                <h3 className="text-base font-extrabold text-[#17201A]">Budget by Category</h3>
                <p className="text-xs text-[#66736A] mt-0.5">Planned vs Actual spent with visual item badges</p>
              </div>
              <button
                onClick={() => setIsLogExpenseModalOpen(true)}
                className="text-xs font-bold text-[#172554] hover:underline cursor-pointer"
              >
                + Add Expense
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {summary?.categoryBreakdown &&
                Object.entries(summary.categoryBreakdown).map(([catKey, rawData]) => {
                  const data = rawData as { planned: number; spent: number; color: string };
                  const spent = Number(data?.spent ?? 0);
                  const planned = Number(data?.planned ?? 1);
                  const percent = Math.min(100, Math.round((spent / (planned || 1)) * 100));
                  const isOver = spent > planned;
                  const catImg = getFoodImageUrl(catKey, catKey);

                  return (
                    <div
                      key={catKey}
                      className="p-4 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] flex items-center gap-3.5"
                    >
                      {/* Visual Photo Placeholder */}
                      <div className="w-12 h-12 rounded-xl bg-gray-200 overflow-hidden shrink-0 border border-[#E8E5DD]">
                        <img
                          src={catImg}
                          alt={catKey}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-extrabold text-[#17201A] capitalize truncate">{catKey}</span>
                          {editingCategory === catKey ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <input
                                type="number"
                                min={0}
                                step={500}
                                autoFocus
                                value={categoryAmountInput}
                                onChange={(e) => setCategoryAmountInput(e.target.value)}
                                className="w-20 px-1.5 py-0.5 bg-white border border-[#E8E5DD] rounded-lg text-xs font-bold text-[#17201A] focus:outline-none focus:ring-2 focus:ring-[#14532D]/30"
                              />
                              <button onClick={() => handleSaveCategory(catKey)} disabled={isSavingCategory} className="p-1 rounded-lg bg-[#14532D] text-white cursor-pointer disabled:opacity-50">
                                <Check className="w-3 h-3" />
                              </button>
                              <button onClick={() => setEditingCategory(null)} className="p-1 rounded-lg border border-[#E8E5DD] cursor-pointer">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 shrink-0 text-right">
                              <span className="font-extrabold text-[#17201A] tabular-nums">
                                KSh {spent.toLocaleString()}
                              </span>
                              <span className="text-[#66736A] tabular-nums">/ {planned.toLocaleString()}</span>
                              <button
                                onClick={() => { setEditingCategory(catKey); setCategoryAmountInput(String(planned || '')); }}
                                className="p-1 text-[#66736A] hover:text-[#17201A] rounded-lg hover:bg-white cursor-pointer"
                                title="Edit planned amount"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="w-full bg-white h-2 rounded-full overflow-hidden border border-[#E8E5DD]">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isOver ? 'bg-[#C62828]' : percent > 85 ? 'bg-[#D97706]' : 'bg-[#14532D]'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[#66736A]">
                          <span>{percent}% allocated</span>
                          <span className={isOver ? 'text-red-700 font-bold' : ''}>
                            {isOver ? 'Over budget' : `KSh ${(planned - spent).toLocaleString()} left`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Categories with no planned amount yet — real users start with
                none, so this is the only way to give one a budget at all. */}
            {(() => {
              const existing = new Set(Object.keys(summary?.categoryBreakdown || {}));
              const missing = ALL_CATEGORIES.filter((c) => !existing.has(c));
              if (missing.length === 0) return null;
              return (
                <div className="mt-4 pt-4 border-t border-[#F1EFE8]">
                  <p className="text-xs font-bold text-[#66736A] mb-2">Set a budget for another category:</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {editingCategory && missing.includes(editingCategory) ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#17201A]">{editingCategory}</span>
                        <input
                          type="number"
                          min={0}
                          step={500}
                          autoFocus
                          placeholder="e.g. 5000"
                          value={categoryAmountInput}
                          onChange={(e) => setCategoryAmountInput(e.target.value)}
                          className="w-24 px-2 py-1 bg-[#FAF8F2] border border-[#E8E5DD] rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#14532D]/30"
                        />
                        <button onClick={() => handleSaveCategory(editingCategory)} disabled={isSavingCategory || !categoryAmountInput} className="px-2.5 py-1 rounded-lg bg-[#14532D] text-white text-[10px] font-bold cursor-pointer disabled:opacity-50">
                          {isSavingCategory ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingCategory(null); setCategoryAmountInput(''); }} className="px-2.5 py-1 rounded-lg border border-[#E8E5DD] text-[10px] font-bold cursor-pointer">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      missing.map((c) => (
                        <button
                          key={c}
                          onClick={() => { setEditingCategory(c); setCategoryAmountInput(''); }}
                          className="px-2.5 py-1.5 rounded-xl border border-dashed border-[#E8E5DD] text-[#66736A] hover:text-[#17201A] hover:border-[#14532D]/40 text-[11px] font-bold cursor-pointer"
                        >
                          + {c}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: ACCURATE PORTION & GROCERY CALCULATOR (NEW) */}
      {activeSubTab === 'estimator' && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs space-y-6">
          {/* Header & Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#F1EFE8]">
            <div>
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-[#14532D]" />
                <h3 className="text-base sm:text-lg font-extrabold text-[#17201A]">
                  Accurate Kenyan Portion & Grocery Price Calculator
                </h3>
              </div>
              <p className="text-xs text-[#66736A] mt-1">
                Multiplies per-serving consumption (e.g. 150g meat, ½ bunch sukuma wiki, 125g unga) to calculate exact kgs and cost in KSh.
              </p>
            </div>

            {/* People/Portions input */}
            <div className="p-3 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] flex items-center gap-3">
              <span className="text-xs font-bold text-[#17201A] flex items-center gap-1">
                <Users className="w-4 h-4 text-[#14532D]" />
                People:
              </span>
              <input
                type="number"
                min="1"
                value={calcPortions}
                onChange={(e) => setCalcPortions(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 px-2 py-1 bg-white border border-[#E8E5DD] rounded-xl text-xs font-extrabold text-[#17201A] text-center focus:ring-2 focus:ring-[#14532D]"
              />
              <div className="flex gap-1">
                {[1, 4, 10, 25].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setCalcPortions(preset)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      calcPortions === preset
                        ? 'bg-[#14532D] text-white'
                        : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                    }`}
                  >
                    {preset}p
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Calculated Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD] text-center">
              <span className="text-[11px] font-bold text-[#66736A] uppercase">Total Food Weight</span>
              <p className="text-xl font-black text-[#17201A] mt-0.5 tabular-nums">
                ~{totalEstimatorKg.toFixed(2)} kg
              </p>
              <span className="text-[10px] text-[#14532D] font-semibold">For {calcPortions} people</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD] text-center">
              <span className="text-[11px] font-bold text-[#66736A] uppercase">Total Estimated Spend</span>
              <p className="text-xl font-black text-[#14532D] mt-0.5 tabular-nums">
                KSh {totalEstimatorCostKsh.toLocaleString()}
              </p>
              <span className="text-[10px] text-[#66736A]">~KSh {Math.round(totalEstimatorCostKsh / calcPortions)} / person</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#14532D] text-white flex flex-col items-center justify-center text-center">
              <button
                onClick={() => setIsLogExpenseModalOpen(true)}
                className="w-full py-2 px-3 bg-[#F4B942] text-[#17201A] font-extrabold text-xs rounded-xl hover:bg-[#E5A72E] transition-all cursor-pointer shadow-xs"
              >
                + Log into Budget
              </button>
              <span className="text-[10px] text-green-100 mt-1">Record this shopping trip</span>
            </div>
          </div>

          {/* Ingredient Portion Grid with Photos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {calculatedItems.map((item, idx) => (
              <div
                key={idx}
                className="bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] overflow-hidden flex flex-col justify-between hover:border-[#14532D] transition-all shadow-2xs"
              >
                {/* Photo Placeholder */}
                <div className="relative h-28 w-full bg-neutral-800 overflow-hidden">
                  <img
                    src={item.imageUrl}
                    alt={item.rawName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white">
                    <span className="text-xs font-black truncate">{item.rawName}</span>
                    <span className="text-xs font-black text-[#F4B942] tabular-nums bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-xs">
                      {item.displayQuantity}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 space-y-2 text-xs flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[#66736A]">
                      <span>Per Serving:</span>
                      <span className="font-bold text-[#17201A]">{item.perServingText}</span>
                    </div>

                    <div className="flex items-center justify-between text-[#66736A]">
                      <span>Market Cost:</span>
                      <span className="font-extrabold text-[#14532D] tabular-nums">
                        ~KSh {item.estimatedCostKsh.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="p-2 bg-white rounded-xl border border-[#E8E5DD] text-[11px] text-[#92400E] font-semibold">
                    🛒 {item.marketBuyingGuide}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: EXPENSES LOG WITH PICTURES */}
      {activeSubTab === 'expenses' && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F1EFE8]">
            <div>
              <h3 className="text-base font-extrabold text-[#17201A]">Recent Expenses</h3>
              <p className="text-xs text-[#66736A]">Chronological list of all logged transactions with item photos</p>
            </div>
            <button
              onClick={() => setIsLogExpenseModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-[#172554] text-white text-xs font-bold hover:bg-[#1e3a8a] cursor-pointer"
            >
              + Log New Expense
            </button>
          </div>

          <div className="divide-y divide-[#F1EFE8]">
            {summary?.recentExpenses?.length === 0 ? (
              <p className="text-xs text-[#66736A] py-8 text-center">No expenses logged this month yet.</p>
            ) : (
              summary?.recentExpenses?.map((exp) => {
                const expPhoto = getFoodImageUrl(exp.description || exp.category, exp.category);

                return (
                  <div
                    key={exp.id}
                    className="py-3 px-2 flex items-center justify-between hover:bg-[#FAF8F2] rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Photo Thumbnail */}
                      <div className="w-10 h-10 rounded-xl bg-gray-200 overflow-hidden shrink-0 border border-[#E8E5DD]">
                        <img
                          src={expPhoto}
                          alt={exp.description}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>

                      <div>
                        <p className="text-xs font-bold text-[#17201A]">{exp.description}</p>
                        <p className="text-[11px] text-[#66736A] capitalize">
                          {exp.category} • {exp.date}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-extrabold text-[#17201A] tabular-nums">
                        - KSh {Number(exp?.amountKsh ?? 0).toLocaleString()}
                      </span>
                      <button
                        onClick={() => deleteExpense(exp.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        title="Delete expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: SALARY ALLOCATION PLANNER */}
      {activeSubTab === 'planner' && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-extrabold text-[#17201A]">Kenyan Realistic Salary Planner</h3>
            <p className="text-xs text-[#66736A] mt-0.5">
              {summary?.totalIncomeKsh
                ? `Suggested split of your KSh ${summary.totalIncomeKsh.toLocaleString()}/mo income, using realistic Nairobi/Kenyan household benchmarks.`
                : 'Set your monthly income in the Overview tab to see this split calculated against your real salary.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD]">
              <span className="text-xs font-bold text-[#14532D] uppercase">Needs (50-60%)</span>
              <p className="text-xs text-[#66736A] mt-1">Rent, Food (Unga, Sukuma, Meat), Matatu Transport, Electricity & Tokens.</p>
              <p className="text-sm font-black text-[#17201A] mt-3 tabular-nums">
                {summary?.totalIncomeKsh ? `~KSh ${Math.round(summary.totalIncomeKsh * 0.55).toLocaleString()} / mo` : '— set income first'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD]">
              <span className="text-xs font-bold text-[#D97706] uppercase">Wants & Family (20-25%)</span>
              <p className="text-xs text-[#66736A] mt-1">Weekend outings, airtime, clothing, family contributions (Chama/Harambee).</p>
              <p className="text-sm font-black text-[#17201A] mt-3 tabular-nums">
                {summary?.totalIncomeKsh ? `~KSh ${Math.round(summary.totalIncomeKsh * 0.225).toLocaleString()} / mo` : '— set income first'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD]">
              <span className="text-xs font-bold text-[#2E7D32] uppercase">Savings & Emergency (15-20%)</span>
              <p className="text-xs text-[#66736A] mt-1">Sacco deposits, emergency M-Shwari fund, school fees buffer.</p>
              <p className="text-sm font-black text-[#17201A] mt-3 tabular-nums">
                {summary?.totalIncomeKsh ? `~KSh ${Math.round(summary.totalIncomeKsh * 0.175).toLocaleString()} / mo` : '— set income first'}
              </p>
            </div>
          </div>

          {!summary?.totalIncomeKsh && (
            <button
              onClick={() => setActiveSubTab('overview')}
              className="text-xs font-bold text-[#172554] hover:underline cursor-pointer"
            >
              Go to Overview to set your monthly income →
            </button>
          )}
        </div>
      )}
    </div>
  );
};
