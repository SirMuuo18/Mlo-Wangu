import React, { useEffect, useState, useCallback } from 'react';
import { api, AdminPaymentRow } from '../../services/api';
import { Card, SectionHeader, Pagination, StatusBadge, formatDate, formatKsh } from './adminUi';

const STATUS_OPTIONS = ['', 'pending', 'success', 'failed', 'cancelled', 'expired'];

export const AdminPayments: React.FC = () => {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async (s: string, p: number) => {
    try {
      const res = await api.getAdminPayments(s || undefined, p, 20);
      setPayments(res.payments); setTotal(res.total); setPageSize(res.pageSize);
    } catch (err: any) {
      setError(err.message || 'Failed to load payments');
    }
  }, []);

  useEffect(() => { load(status, page); }, [load, status, page]);

  const handleConfirm = async (id: string) => {
    try {
      await api.confirmAdminPayment(id);
      setConfirmingId(null);
      await load(status, page);
    } catch (err: any) {
      setError(err.message || 'Failed to confirm payment');
    }
  };

  return (
    <Card>
      <SectionHeader
        title="Payment Support"
        subtitle="Server is authoritative for amount, status, and entitlement — this UI can only confirm a payment the server already recorded as pending."
        action={
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-lg text-xs font-bold">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}</option>)}
          </select>
        }
      />
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#E8E5DD] text-[#66736A]">
              <th className="py-2.5 px-3 font-bold">User</th>
              <th className="py-2.5 px-3 font-bold">Amount</th>
              <th className="py-2.5 px-3 font-bold">Plan</th>
              <th className="py-2.5 px-3 font-bold">Status</th>
              <th className="py-2.5 px-3 font-bold">Date</th>
              <th className="py-2.5 px-3 font-bold">Reference</th>
              <th className="py-2.5 px-3 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EFE8]">
            {payments.length === 0 && <tr><td colSpan={7} className="py-4 px-3 text-[#66736A]">No payments found.</td></tr>}
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-[#FAF8F2] transition-colors">
                <td className="py-2.5 px-3 text-[#66736A]">{p.userEmail || p.userId}</td>
                <td className="py-2.5 px-3 font-extrabold text-[#17201A]">{formatKsh(p.amountKsh)}</td>
                <td className="py-2.5 px-3 capitalize">{p.planType.replace(/_/g, ' ')}</td>
                <td className="py-2.5 px-3"><StatusBadge status={p.status} /></td>
                <td className="py-2.5 px-3 text-[#66736A]">{formatDate(p.createdAt)}</td>
                <td className="py-2.5 px-3 font-mono text-[10px]">{p.mpesaReceipt || '—'}</td>
                <td className="py-2.5 px-3 text-right">
                  {p.status === 'pending' && (
                    confirmingId === p.id ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => handleConfirm(p.id)} className="px-2.5 py-1 rounded-lg bg-[#14532D] text-white text-[10px] font-bold cursor-pointer">Yes, Confirm</button>
                        <button onClick={() => setConfirmingId(null)} className="px-2.5 py-1 rounded-lg border border-[#E8E5DD] text-[10px] font-bold cursor-pointer">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmingId(p.id)} className="px-2.5 py-1 rounded-lg bg-[#17201A] text-white text-[10px] font-bold cursor-pointer hover:bg-black">Confirm Payment</button>
                    )
                  )}
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
