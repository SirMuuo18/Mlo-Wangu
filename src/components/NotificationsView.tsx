import React from 'react';
import { Bell, Droplet, Utensils, Wallet, KeyRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { NotificationItem } from '../types';

// Full notifications page — closes the parity gap the other direction from
// Phase 3A (mobile got a dedicated screen; web only ever had the Navbar
// dropdown). Reuses the exact same state (useApp()'s notifications/
// markNotificationAsRead) the dropdown already uses — no second fetch, no
// second notion of "unread," never a parallel data model.
function iconFor(n: NotificationItem) {
  if (n.data?.accessCode) return KeyRound;
  if (n.type === 'water') return Droplet;
  if (n.type === 'meal') return Utensils;
  if (n.type === 'budget') return Wallet;
  return Bell;
}

export const NotificationsView: React.FC = () => {
  const { notifications, markNotificationAsRead } = useApp();

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200 max-w-2xl">
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">Notifications</h1>
            <p className="text-xs text-[#66736A] mt-0.5">Payment and access-code updates, plus anything else sent to your account.</p>
          </div>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl border border-[#E8E5DD] shadow-xs text-center">
          <p className="text-sm text-[#66736A]">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = iconFor(n);
            return (
              <div
                key={n.id}
                onClick={() => !n.isRead && markNotificationAsRead(n.id)}
                className={`bg-white p-4 rounded-2xl border border-[#E8E5DD] shadow-xs flex items-start gap-3 cursor-pointer transition-colors ${
                  n.isRead ? 'opacity-70' : 'bg-[#FAF8F2]'
                }`}
              >
                <div className="mt-0.5 p-2 rounded-xl bg-[#FAF8F2] border border-[#E8E5DD] text-[#14532D] shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-[#17201A]">{n.title}</p>
                    {!n.isRead && <span className="w-1.5 h-1.5 bg-[#14532D] rounded-full shrink-0" />}
                  </div>
                  <p className="text-xs text-[#66736A] mt-1 leading-relaxed">{n.message}</p>
                  {n.data?.accessCode && (
                    <div className="mt-2 p-2.5 bg-white rounded-xl border border-[#E8E5DD]">
                      <p className="text-sm font-bold text-[#14532D] font-mono">{n.data.accessCode}</p>
                      {n.data.expiresAt && (
                        <p className="text-[11px] text-[#66736A] mt-0.5">
                          Expires {new Date(n.data.expiresAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
