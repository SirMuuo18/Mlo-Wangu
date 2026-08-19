import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { MealsView } from './components/MealsView';
import { WhatCanICookView } from './components/WhatCanICookView';
import { FamilyView } from './components/FamilyView';
import { ShoppingView } from './components/ShoppingView';
import { BudgetView } from './components/BudgetView';
import { AIAssistantView } from './components/AIAssistantView';
import { AdminView } from './components/AdminView';

// Modals
import { PinModal } from './components/modals/PinModal';
import { PinSetupModal } from './components/modals/PinSetupModal';
import { RecipeModal } from './components/modals/RecipeModal';
import { SwapMealModal } from './components/modals/SwapMealModal';
import { LogExpenseModal } from './components/modals/LogExpenseModal';
import { PremiumPaywallModal } from './components/modals/PremiumPaywallModal';

const AppContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <div className="min-h-screen bg-[#FAF8F2] flex flex-col text-[#17201A]">
      {/* Top Universal Navbar */}
      <Navbar />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Main View Area */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-5xl mx-auto w-full overflow-x-hidden">
          {activeTab === 'home' && <HomeView />}
          {activeTab === 'meals' && <MealsView />}
          {activeTab === 'cook-ksh' && <WhatCanICookView />}
          {activeTab === 'family' && <FamilyView />}
          {activeTab === 'shopping' && <ShoppingView />}
          {activeTab === 'budget' && <BudgetView />}
          {activeTab === 'ai' && <AIAssistantView />}
          {activeTab === 'admin' && <AdminView />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* Global Interactive Modals */}
      <PinModal />
      <PinSetupModal />
      <RecipeModal />
      <SwapMealModal />
      <LogExpenseModal />
      <PremiumPaywallModal />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
