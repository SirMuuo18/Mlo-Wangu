import React, { useEffect, useState, useCallback } from 'react';
import { Search, Crown, KeyRound } from 'lucide-react';
import { api, AdminUserSummary } from '../../services/api';
import { Card, SectionHeader, Pagination, formatDate } from './adminUi';
import { AdminUserDetail } from './AdminUserDetail';

export const AdminUsers: React.FC<{ initialUserId?: string | null; onConsumedInitialUserId?: () => void }> = ({ initialUserId, onConsumedInitialUserId }) => {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId ?? null);

  useEffect(() => {
    if (initialUserId) {
      setSelectedUserId(initialUserId);
      onConsumedInitialUserId?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserId]);

  const load = useCallback(async (q: string, p: number) => {
    try {
      const res = await api.searchAdminUsers(q, p, 20);
      setUsers(res.users); setTotal(res.total); setPageSize(res.pageSize);
    } catch (err: any) {
      setError(err.message || 'Failed to search users');
    }
  }, []);

  useEffect(() => { load(query, page); }, [load, query, page]);

  if (selectedUserId) {
    return <AdminUserDetail userId={selectedUserId} onBack={() => setSelectedUserId(null)} />;
  }

  return (
    <Card>
      <SectionHeader title="Users" subtitle="Search by name, email, or user ID — server-side, paginated." />
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#66736A]" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          placeholder="elisha@example.com"
          className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14532D]/30"
        />
      </div>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#E8E5DD] text-[#66736A]">
              <th className="py-2.5 px-3 font-bold">Name</th>
              <th className="py-2.5 px-3 font-bold">Email</th>
              <th className="py-2.5 px-3 font-bold">Created</th>
              <th className="py-2.5 px-3 font-bold">Status</th>
              <th className="py-2.5 px-3 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EFE8]">
            {users.length === 0 && (
              <tr><td colSpan={5} className="py-4 px-3 text-[#66736A]">No users found.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[#FAF8F2] transition-colors">
                <td className="py-2.5 px-3 font-extrabold text-[#17201A]">{u.name || 'Unnamed'}</td>
                <td className="py-2.5 px-3 text-[#66736A]">{u.email || '—'}</td>
                <td className="py-2.5 px-3 text-[#66736A]">{formatDate(u.createdAt)}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    {u.premiumActive && <span title="Premium"><Crown className="w-3.5 h-3.5 text-[#D97706]" /></span>}
                    {u.hasActiveMealPlanAccess && <span title="Active meal-plan access"><KeyRound className="w-3.5 h-3.5 text-[#14532D]" /></span>}
                    {u.role === 'admin' && <span className="text-[10px] font-extrabold text-[#14532D]">ADMIN</span>}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <button onClick={() => setSelectedUserId(u.id)} className="px-3 py-1.5 rounded-lg bg-[#17201A] text-white text-[10px] font-bold cursor-pointer hover:bg-black">
                    Open Profile
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
    </Card>
  );
};
