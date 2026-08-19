import React from 'react';
import { useApp, ActiveTab } from '../context/AppContext';
import { Home, UtensilsCrossed, Users, ShoppingBasket, Wallet, Lock, ChefHat } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, isBudgetUnlocked } = useApp();

  const navItems: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'meals', label: 'Meals', icon: UtensilsCrossed },
    { id: 'cook-ksh', label: 'Cook', icon: ChefHat },
    { id: 'family', label: 'Family', icon: Users },
    { id: 'shopping', label: 'Shopping', icon: ShoppingBasket },
    { id: 'budget', label: 'Budget', icon: Wallet },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E8E5DD] px-2 py-1.5 safe-bottom shadow-lg">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isBudget = item.id === 'budget';

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative ${
                isActive
                  ? isBudget
                    ? isBudgetUnlocked
                      ? 'text-[#172554] bg-[#EFF6FF]'
                      : 'text-[#14532D] bg-[#FAF8F2]'
                    : 'text-[#14532D] bg-[#FAF8F2]'
                  : 'text-[#66736A] hover:text-[#17201A]'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                {isBudget && (
                  <span
                    className={`absolute -top-1 -right-2 w-2.5 h-2.5 rounded-full flex items-center justify-center ${
                      isBudgetUnlocked ? 'bg-[#2563EB]' : 'bg-[#14532D]'
                    }`}
                  >
                    {isBudgetUnlocked ? (
                      <span className="w-1.5 h-1.5 bg-white rounded-full" />
                    ) : (
                      <Lock className="w-2 h-2 text-white" />
                    )}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-1 font-semibold ${isActive ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
