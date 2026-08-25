import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Lock, Unlock, Bell, ShieldCheck, User, X, Check, Droplet, Utensils, Bot, KeyRound } from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isBudgetUnlocked,
    lockBudget,
    setIsPinModalOpen,
    setIsPremiumModalOpen,
    household,
    user,
    notifications,
    unreadNotifsCount,
    markNotificationAsRead,
  } = useApp();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E8E5DD] px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('home')}>
          <img src="/logo-icon-192.png" alt="Mlo Wangu" className="w-10 h-10 rounded-xl shadow-sm object-cover" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight text-[#14532D]">Mlo Wangu</span>
              {user?.isPremium && (
                <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border border-[#FDE68A] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#D97706]" />
                  Premium
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#66736A] font-medium hidden sm:block">
              Kenyan Family Meal & Budget Assistant
            </p>
          </div>
        </div>

        {/* Middle: Desktop Quick Shortcuts */}
        <div className="hidden md:flex items-center gap-1 bg-[#FAF8F2] p-1 rounded-xl border border-[#E8E5DD]">
          <button
            onClick={() => setActiveTab('home')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'home' ? 'bg-white text-[#14532D] shadow-xs' : 'text-[#66736A] hover:text-[#17201A]'
            }`}
          >
            Home
          </button>
          <button
            onClick={() => setActiveTab('meals')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'meals' ? 'bg-white text-[#14532D] shadow-xs' : 'text-[#66736A] hover:text-[#17201A]'
            }`}
          >
            Weekly Meals
          </button>
          <button
            onClick={() => setActiveTab('cook-ksh')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'cook-ksh' ? 'bg-white text-[#14532D] shadow-xs' : 'text-[#66736A] hover:text-[#17201A]'
            }`}
          >
            What Can I Cook?
          </button>
          <button
            onClick={() => setActiveTab('family')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'family' ? 'bg-white text-[#14532D] shadow-xs' : 'text-[#66736A] hover:text-[#17201A]'
            }`}
          >
            Family ({household?.members?.length || 5})
          </button>
          <button
            onClick={() => setActiveTab('shopping')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'shopping' ? 'bg-white text-[#14532D] shadow-xs' : 'text-[#66736A] hover:text-[#17201A]'
            }`}
          >
            Shopping
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'ai' ? 'bg-white text-[#14532D] shadow-xs' : 'text-[#66736A] hover:text-[#17201A]'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-[#14532D]" />
            Assistant
          </button>
        </div>

        {/* Right: Privacy Lock Status + Notifications + Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Privacy Budget Indicator Pill */}
          {isBudgetUnlocked ? (
            <button
              onClick={lockBudget}
              title="Click to lock budget now"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#EFF6FF] text-[#172554] border border-[#BFDBFE] hover:bg-[#DBEAFE] transition-all cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="hidden sm:inline">Budget Unlocked</span>
              <span className="sm:hidden">Unlocked</span>
              <span className="text-[10px] bg-[#2563EB] text-white px-1.5 py-0.2 rounded font-mono">Lock</span>
            </button>
          ) : (
            <button
              onClick={() => setIsPinModalOpen(true)}
              title="Budget is protected. Click to enter PIN"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#FAF8F2] text-[#66736A] border border-[#E8E5DD] hover:bg-[#F1EFE8] transition-all cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[#14532D]" />
              <span className="hidden sm:inline">Budget Protected</span>
              <span className="sm:hidden">Protected</span>
            </button>
          )}

          {/* Premium Upgrade CTA if not active */}
          {!user?.isPremium && (
            <button
              onClick={() => setIsPremiumModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#14532D] text-white hover:bg-[#0f3e22] transition-all shadow-xs cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#F4B942]" />
              Upgrade (KSh 50)
            </button>
          )}

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="p-2 rounded-xl text-[#66736A] hover:text-[#17201A] hover:bg-[#FAF8F2] relative transition-colors cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#C62828] rounded-full ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* Notification Dropdown */}
            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-[#E8E5DD] p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-[#F1EFE8]">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#14532D]" />
                    <h4 className="font-bold text-sm text-[#17201A]">Notifications & Reminders</h4>
                  </div>
                  <button
                    onClick={() => setIsNotifOpen(false)}
                    className="text-[#66736A] hover:text-[#17201A] p-1 rounded-lg hover:bg-gray-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-[#F1EFE8] py-1">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-[#66736A] py-6 text-center">No notifications right now.</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markNotificationAsRead(n.id)}
                        className={`py-2.5 px-2 rounded-xl transition-colors cursor-pointer flex items-start gap-3 ${
                          n.isRead ? 'opacity-70 hover:bg-[#FAF8F2]' : 'bg-[#FAF8F2] hover:bg-[#F4F1E6]'
                        }`}
                      >
                        <div className="mt-0.5 p-1.5 rounded-lg bg-white border border-[#E8E5DD] text-[#14532D]">
                          {n.data?.accessCode ? (
                            <KeyRound className="w-4 h-4 text-[#F4B942]" />
                          ) : n.type === 'water' ? (
                            <Droplet className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Utensils className="w-4 h-4 text-[#14532D]" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-[#17201A]">{n.title}</p>
                            {!n.isRead && <span className="w-1.5 h-1.5 bg-[#14532D] rounded-full" />}
                          </div>
                          <p className="text-xs text-[#66736A] mt-0.5 leading-relaxed">{n.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile Avatar / Menu */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-9 h-9 rounded-xl bg-[#14532D]/10 hover:bg-[#14532D]/20 text-[#14532D] flex items-center justify-center font-bold text-sm border border-[#14532D]/20 transition-all cursor-pointer"
            >
              {user?.name ? user.name.charAt(0) : 'M'}
            </button>

            {/* Profile Dropdown */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[#E8E5DD] p-3 z-50">
                <div className="p-2 border-b border-[#F1EFE8]">
                  <p className="font-bold text-sm text-[#17201A]">{user?.name || 'Mwangi Njoroge'}</p>
                  <p className="text-xs text-[#66736A]">{user?.email || 'mwangi@example.com'}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-[#14532D] font-semibold">Household Owner</span>
                    <span className="text-[10px] bg-[#14532D]/10 text-[#14532D] px-2 py-0.5 rounded-full font-bold">
                      {household?.name || 'Mwangi Family'}
                    </span>
                  </div>
                </div>

                <div className="py-2 space-y-1">
                  <button
                    onClick={() => {
                      setActiveTab('family');
                      setIsProfileOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#17201A] hover:bg-[#FAF8F2] rounded-xl flex items-center gap-2"
                  >
                    <User className="w-4 h-4 text-[#66736A]" />
                    Family Household Settings
                  </button>

                  <button
                    onClick={() => {
                      setIsPremiumModalOpen(true);
                      setIsProfileOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#17201A] hover:bg-[#FAF8F2] rounded-xl flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#14532D]" />
                    Mlo Wangu Premium Membership
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
