import React, { useEffect, useState, useCallback } from 'react';
import { api, AdminAuditLogEntry } from '../../services/api';
import { Card, SectionHeader, Pagination, StatusBadge, formatDate } from './adminUi';

export const AdminAuditLog: React.FC = () => {
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<AdminAuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState('');

  const load = useCallback(async (p: number) => {
    try {
      const res = await api.getAdminAuditLog(undefined, p, 20);
      setEntries(res.entries); setTotal(res.total); setPageSize(res.pageSize);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit log');
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  return (
    <Card>
      <SectionHeader title="Admin Action Audit Log" subtitle="Every support/admin action that changes state is recorded here — admin, action, target, timestamp, and result." />
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#E8E5DD] text-[#66736A]">
              <th className="py-2.5 px-3 font-bold">Action</th>
              <th className="py-2.5 px-3 font-bold">Admin</th>
              <th className="py-2.5 px-3 font-bold">Target User</th>
              <th className="py-2.5 px-3 font-bold">Result</th>
              <th className="py-2.5 px-3 font-bold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EFE8]">
            {entries.length === 0 && <tr><td colSpan={5} className="py-4 px-3 text-[#66736A]">No audit entries yet.</td></tr>}
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-[#FAF8F2] transition-colors">
                <td className="py-2.5 px-3 font-extrabold text-[#17201A]">{e.action.replace(/_/g, ' ')}</td>
                <td className="py-2.5 px-3 font-mono text-[10px] text-[#66736A]">{e.admin_id.slice(0, 8)}…</td>
                <td className="py-2.5 px-3 font-mono text-[10px] text-[#66736A]">{e.target_user_id ? `${e.target_user_id.slice(0, 8)}…` : '—'}</td>
                <td className="py-2.5 px-3"><StatusBadge status={e.result} /></td>
                <td className="py-2.5 px-3 text-[#66736A]">{formatDate(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
    </Card>
  );
};
