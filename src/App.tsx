import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthView } from './components/auth/AuthView';
import { OnboardingFlow, OnboardingData } from './components/onboarding/OnboardingFlow';
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
import { AdminGate } from './components/admin/AdminGate';

// Modals
import { PinModal } from './components/modals/PinModal';
import { PinSetupModal } from './components/modals/PinSetupModal';
import { RecipeModal } from './components/modals/RecipeModal';
import { SwapMealModal } from './components/modals/SwapMealModal';
import { LogExpenseModal } from './components/modals/LogExpenseModal';
import { PremiumPaywallModal } from './components/modals/PremiumPaywallModal';
import { GeneratePlanModal } from './components/modals/GeneratePlanModal';

const AppContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <div className="min-h-screen bg-[#FAF8F2] flex flex-col text-[#17201A]">
      <Navbar />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar />
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-5xl mx-auto w-full overflow-x-hidden">
          {activeTab === 'home' && <HomeView />}
          {activeTab === 'meals' && <MealsView />}
          {activeTab === 'cook-ksh' && <WhatCanICookView />}
          {activeTab === 'family' && <FamilyView />}
          {activeTab === 'shopping' && <ShoppingView />}
          {activeTab === 'budget' && <BudgetView />}
          {activeTab === 'ai' && <AIAssistantView />}
        </main>
      </div>

      <BottomNav />

      <PinModal />
      <PinSetupModal />
      <RecipeModal />
      <SwapMealModal />
      <LogExpenseModal />
      <PremiumPaywallModal />
      <GeneratePlanModal />
    </div>
  );
};

const AuthGate: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState(() => {
    return localStorage.getItem('mlo_onboarding_done') === 'true';
  });

  const handleOnboardingComplete = async (data: OnboardingData) => {
    localStorage.setItem('mlo_onboarding_done', 'true');
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          householdType: data.householdType,
          preferences: data.preferences,
          allergies: data.allergies,
          memberCount: data.memberCount,
          hasBudget: data.hasBudget,
          monthlyIncomeKsh: data.hasBudget ? data.monthlyIncomeKsh : undefined,
        }),
      });
    } catch { /* non-critical */ }
    setOnboardingDone(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f1e2b] flex items-center justify-center">
        <div className="text-[#F4B942] text-lg font-extrabold animate-pulse">Mlo Wangu…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthView />;
  }

  if (!onboardingDone) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

// The `admin=true` query parameter is only a route selector — it picks which
// tree renders on this page load and is never treated as proof of admin
// identity. Real authorization happens exclusively server-side inside
// AdminGate, which independently re-verifies the authenticated session and
// the account's admin role on every admin API call. Consumers never render
// (or fetch data for) any part of the admin tree, and the admin tree never
// mounts the consumer app shell — the two are fully separate component trees
// sharing only the underlying auth session.
function isAdminEntryPoint(): boolean {
  return new URLSearchParams(window.location.search).get('admin') === 'true';
}

export default function App() {
  if (isAdminEntryPoint()) {
    return (
      <AuthProvider>
        <AdminGate />
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
