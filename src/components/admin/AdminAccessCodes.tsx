import React, { useEffect, useState, useCallback } from 'react';
import { api, AdminAccessCodeRow } from '../../services/api';
import { Card, SectionHeader, Pagination, StatusBadge, formatDate } from './adminUi';

const STATUS_OPTIONS = ['', 'ACTIVE', 'USED', 'EXPIRED', 'CANCELLED'];

export const AdminAccessCodes: React.FC = () => {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [codes, setCodes] = useState<AdminAccessCodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async (s: string, p: number) => {
    try {
      const res = await api.getAdminAccessCodes(s || undefined, p, 20);
      setCodes(res.codes); setTotal(res.total); setPageSize(res.pageSize);
    } catch (err: any) {
      setError(err.message || 'Failed to load access codes');
    }
  }, []);

  useEffect(() => { load(status, page); }, [load, status, page]);

  const handleCancel = async (id: string) => {
    try {
      await api.cancelAdminAccessCode(id);
      setCancellingId(null);
      await load(status, page);
    } catch (err: any) {
      setError(err.message || 'Failed to cancel access code');
    }
  };

  return (
    <Card>
      <SectionHeader
        title="Access Code Management"
        subtitle="Every code expires exactly 7 days from issuance — enforced by the database, never editable here."
        action={
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-lg text-xs font-bold">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        }
      />
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#E8E5DD] text-[#66736A]">
              <th className="py-2.5 px-3 font-bold">User</th>
              <th className="py-2.5 px-3 font-bold">Status</th>
              <th className="py-2.5 px-3 font-bold">Uses</th>
              <th className="py-2.5 px-3 font-bold">Issued</th>
              <th className="py-2.5 px-3 font-bold">Expires</th>
              <th className="py-2.5 px-3 font-bold">Note</th>
              <th className="py-2.5 px-3 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EFE8]">
            {codes.length === 0 && <tr><td colSpan={7} className="py-4 px-3 text-[#66736A]">No access codes found.</td></tr>}
            {codes.map((c) => (
              <tr key={c.id} className="hover:bg-[#FAF8F2] transition-colors">
                <td className="py-2.5 px-3 text-[#66736A]">{c.userEmail || c.userId || 'Unbound'}</td>
                <td className="py-2.5 px-3"><StatusBadge status={c.status} /></td>
                <td className="py-2.5 px-3 tabular-nums">{c.usedCount}/{c.maxUses}</td>
                <td className="py-2.5 px-3 text-[#66736A]">{formatDate(c.createdAt)}</td>
                <td className="py-2.5 px-3 text-[#66736A]">{formatDate(c.expiresAt)}</td>
                <td className="py-2.5 px-3 text-[#66736A]">{c.description || '—'}</td>
                <td className="py-2.5 px-3 text-right">
                  {c.status === 'ACTIVE' && (
                    cancellingId === c.id ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => handleCancel(c.id)} className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[10px] font-bold cursor-pointer">Yes, Cancel</button>
                        <button onClick={() => setCancellingId(null)} className="px-2.5 py-1 rounded-lg border border-[#E8E5DD] text-[10px] font-bold cursor-pointer">Back</button>
                      </div>
                    ) : (
                      <button onClick={() => setCancellingId(c.id)} className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 text-[10px] font-bold cursor-pointer hover:bg-red-50">Cancel</button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
      <p className="text-[10px] text-[#66736A] mt-3">
        Codes are issued from a user's support profile (Users → Open Profile → Issue Access Code). Code hashes are never displayed — only status, usage, and dates.
      </p>
    </Card>
  );
};
