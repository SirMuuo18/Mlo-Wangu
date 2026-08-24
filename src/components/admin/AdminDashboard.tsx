import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Activity, Crown, KeyRound, Clock3, CheckCircle2, XCircle } from 'lucide-react';
import { api, AdminDashboardStats } from '../../services/api';
import { Card, formatDate, formatKsh, StatusBadge } from './adminUi';

const StatCard: React.FC<{ label: string; value: number | string; icon: React.ReactNode; hint?: string }> = ({ label, value, icon, hint }) => (
  <Card className="!p-5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-[#66736A] uppercase">{label}</span>
      {icon}
    </div>
    <p className="text-2xl font-black text-[#17201A] mt-2 tabular-nums">{value}</p>
    {hint && <span className="text-[10px] text-[#66736A]">{hint}</span>}
  </Card>
);

export const AdminDashboard: React.FC<{ onOpenUser?: (userId: string) => void }> = ({ onOpenUser }) => {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAdminDashboard().then(setStats).catch((err) => setError(err.message || 'Failed to load dashboard'));
  }, []);

  if (error) return <Card><p className="text-sm text-red-600">{error}</p></Card>;
  if (!stats) return <Card><p className="text-sm text-[#66736A]">Loading live dashboard data…</p></Card>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats.totalUsers} icon={<Users className="w-4 h-4 text-[#14532D]" />} />
        <StatCard label="New Users (7d)" value={stats.newUsersLast7Days} icon={<UserPlus className="w-4 h-4 text-[#14532D]" />} />
        <StatCard label="Active Users (30d)" value={stats.activeUsersLast30Days} icon={<Activity className="w-4 h-4 text-[#2563EB]" />} />
        <StatCard label="Premium Users" value={stats.premiumUsers} icon={<Crown className="w-4 h-4 text-[#D97706]" />} />
        <StatCard label="Meal-Plan Access" value={stats.usersWithActiveMealPlanAccess} icon={<KeyRound className="w-4 h-4 text-[#14532D]" />} hint="Users with unused, unexpired entitlement" />
        <StatCard label="Pending Payments" value={stats.pendingPayments} icon={<Clock3 className="w-4 h-4 text-[#8a6410]" />} />
        <StatCard label="Confirmed Payments" value={stats.confirmedPayments} icon={<CheckCircle2 className="w-4 h-4 text-[#14532D]" />} />
        <StatCard label="Active / Expired Codes" value={`${stats.activeAccessCodes} / ${stats.expiredAccessCodes}`} icon={<XCircle className="w-4 h-4 text-[#66736A]" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <h4 className="text-sm font-extrabold text-[#17201A] mb-3">Recent Registrations</h4>
          <div className="space-y-2">
            {stats.recentRegistrations.length === 0 && <p className="text-xs text-[#66736A]">No recent registrations.</p>}
            {stats.recentRegistrations.map((u) => (
              <button
                key={u.id}
                onClick={() => onOpenUser?.(u.id)}
                className="w-full text-left flex items-center justify-between p-2.5 rounded-xl hover:bg-[#FAF8F2] cursor-pointer"
              >
                <div>
                  <p className="text-xs font-bold text-[#17201A]">{u.name || 'Unnamed'}</p>
                  <p className="text-[10px] text-[#66736A]">{u.email || '—'}</p>
                </div>
                <span className="text-[10px] text-[#66736A]">{formatDate(u.created_at)}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h4 className="text-sm font-extrabold text-[#17201A] mb-3">Recent Payments</h4>
          <div className="space-y-2">
            {stats.recentPayments.length === 0 && <p className="text-xs text-[#66736A]">No recent payments.</p>}
            {stats.recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-[#17201A]">{formatKsh(p.amount_ksh)} &middot; {p.plan_type}</p>
                  <p className="text-[10px] text-[#66736A]">{formatDate(p.created_at)}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h4 className="text-sm font-extrabold text-[#17201A] mb-3">Recent Support Actions</h4>
          <div className="space-y-2">
            {stats.recentSupportActions.length === 0 && <p className="text-xs text-[#66736A]">No recent admin actions.</p>}
            {stats.recentSupportActions.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2.5 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-[#17201A]">{a.action.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-[#66736A]">{formatDate(a.created_at)}</p>
                </div>
                <StatusBadge status={a.result} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
