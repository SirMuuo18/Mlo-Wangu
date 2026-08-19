import React from 'react';
import { useApp, ActiveTab } from '../context/AppContext';
import {
  Home,
  UtensilsCrossed,
  Users,
  ShoppingBasket,
  Wallet,
  Droplet,
  Bot,
  ChefHat,
  Shield,
  ShieldCheck,
  Lock,
  Unlock,
  PlusCircle,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isBudgetUnlocked,
    lockBudget,
    setIsPinModalOpen,
    setIsLogExpenseModalOpen,
    household,
    user,
    setIsPremiumModalOpen,
  } = useApp();

  const navItems: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }>; badge?: string; privateSection?: boolean }[] = [
    { id: 'home', label: 'Assistant Home', icon: Home },
    { id: 'meals', label: 'Weekly Meal Plan', icon: UtensilsCrossed },
    { id: 'cook-ksh', label: 'What Can I Cook?', icon: ChefHat, badge: 'Smart' },
    { id: 'family', label: 'Family Household', icon: Users },
    { id: 'shopping', label: 'Smart Shopping List', icon: ShoppingBasket },
    { id: 'ai', label: 'Mlo Wangu Nutritionist', icon: Bot },
    { id: 'budget', label: 'Private Budget & Goals', icon: Wallet, privateSection: true },
    { id: 'admin', label: 'Price Admin & Audit', icon: Shield },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-[#E8E5DD] min-h-[calc(100vh-65px)] p-4 justify-between">
      <div className="space-y-6">
        {/* Household Overview Widget */}
        <div className="p-3.5 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#14532D] uppercase tracking-wider">Active Household</span>
            <span className="text-[10px] bg-white border border-[#E8E5DD] px-2 py-0.5 rounded-full font-bold text-[#66736A]">
              {household?.members?.length || 5} Members
            </span>
          </div>
          <p className="text-sm font-extrabold text-[#17201A] mt-1 truncate">
            {household?.name || 'The Mwangi Family'}
          </p>
          <p className="text-xs text-[#66736A] mt-0.5">Family Meals Shared • Money Private</p>
        </div>

        {/* Primary Navigation Menu */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isBudget = item.id === 'budget';

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? item.privateSection && isBudgetUnlocked
                      ? 'bg-[#EFF6FF] text-[#172554] shadow-xs'
                      : 'bg-[#14532D] text-white shadow-xs'
                    : 'text-[#66736A] hover:bg-[#FAF8F2] hover:text-[#17201A]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className="text-[10px] bg-[#F4B942] text-[#17201A] px-1.5 py-0.5 rounded-md font-extrabold">
                    {item.badge}
                  </span>
                )}

                {item.privateSection && (
                  <span className="flex items-center gap-1">
                    {isBudgetUnlocked ? (
                      <Unlock className="w-3 h-3 text-[#2563EB]" />
                    ) : (
                      <Lock className="w-3 h-3 text-[#9CA3AF]" />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick Action Button for Budget if Unlocked */}
        {isBudgetUnlocked && (
          <div className="pt-2">
            <button
              onClick={() => setIsLogExpenseModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#172554] text-white text-xs font-bold hover:bg-[#1e3a8a] transition-all shadow-xs cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-[#F4B942]" />
              + Log Expense
            </button>
          </div>
        )}
      </div>

      {/* Bottom Privacy & Premium Card */}
      <div className="space-y-3 pt-4 border-t border-[#E8E5DD]">
        {/* Security status card */}
        <div
          className={`p-3 rounded-2xl border transition-all ${
            isBudgetUnlocked
              ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#172554]'
              : 'bg-[#FAF8F2] border-[#E8E5DD] text-[#17201A]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isBudgetUnlocked ? (
                <Unlock className="w-4 h-4 text-[#2563EB]" />
              ) : (
                <Lock className="w-4 h-4 text-[#14532D]" />
              )}
              <span className="text-xs font-bold">
                {isBudgetUnlocked ? 'Budget Unlocked' : 'Budget Protected'}
              </span>
            </div>
            {isBudgetUnlocked ? (
              <button
                onClick={lockBudget}
                className="text-[11px] bg-[#2563EB] text-white px-2 py-0.5 rounded font-bold hover:bg-blue-700"
              >
                Lock
              </button>
            ) : (
              <button
                onClick={() => setIsPinModalOpen(true)}
                className="text-[11px] bg-[#14532D] text-white px-2 py-0.5 rounded font-bold hover:bg-[#0f3e22]"
              >
                Unlock
              </button>
            )}
          </div>
          <p className="text-[11px] text-[#66736A] mt-1 leading-tight">
            {isBudgetUnlocked
              ? 'Financial records are visible. Auto-locks after 15m.'
              : 'Salary and personal financial details are protected.'}
          </p>
        </div>

        {/* Premium Badge */}
        {!user?.isPremium && (
          <div
            onClick={() => setIsPremiumModalOpen(true)}
            className="p-3 bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A] rounded-2xl border border-[#FCD34D] cursor-pointer hover:shadow-xs transition-all"
          >
            <div className="flex items-center gap-1.5 text-[#92400E]">
              <ShieldCheck className="w-4 h-4 text-[#D97706]" />
              <span className="text-xs font-extrabold">Mlo Wangu Premium</span>
            </div>
            <p className="text-[11px] text-[#78350F] mt-1 font-medium">
              Smart budget-aware meals & AI assistant for KSh 50/week.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
