import React, { useEffect, useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { api, AdminPaymentRow } from '../../services/api';
import { Card, SectionHeader, Pagination, StatusBadge, formatDate, formatKsh } from './adminUi';

const STATUS_OPTIONS = ['', 'pending', 'success', 'failed', 'cancelled', 'expired', 'rejected'];

// A pending Till submission for the "Generate New Plan" gate gets a
// dedicated Verify/Reject flow (issues a 7-day access code, not a direct
// entitlement) — every other pending row (STK-stuck, Premium Till) keeps
// using the existing generic Confirm button unchanged.
function isTillGeneration(p: AdminPaymentRow): boolean {
  return p.paymentMethod === 'till_manual' && p.planType === 'meal_plan_generation';
}

export const AdminPayments: React.FC = () => {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealedCode, setRevealedCode] = useState<{ paymentId: string; code: string; expiresAt: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<{ paymentId: string; text: string } | null>(null);

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

  const handleVerify = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      const res = await api.verifyTillPayment(id);
      setVerifyingId(null);
      if (res.code) {
        setRevealedCode({ paymentId: id, code: res.code, expiresAt: res.expiresAt });
      } else {
        setNote({ paymentId: id, text: 'Already verified — no new code issued.' });
      }
      await load(status, page);
    } catch (err: any) {
      setError(err.message || 'Failed to verify payment');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setBusyId(id);
    setError('');
    try {
      await api.rejectTillPayment(id, rejectReason.trim());
      setRejectingId(null);
      setRejectReason('');
      await load(status, page);
    } catch (err: any) {
      setError(err.message || 'Failed to reject payment');
    } finally {
      setBusyId(null);
    }
  };

  const handleResend = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      const res = await api.resendAccessCodeEmail(id);
      setNote({
        paymentId: id,
        text: res.mode === 'resent_existing' ? 'Resent the original code.' : 'Issued a new code — the old one is now inactive.',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to resend code email');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <SectionHeader
        title="Payment Support"
        subtitle="Server is authoritative for amount, status, and entitlement/access-code — this UI can only act on a payment the server already recorded as pending."
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
              <th className="py-2.5 px-3 font-bold">Method</th>
              <th className="py-2.5 px-3 font-bold">Status</th>
              <th className="py-2.5 px-3 font-bold">Date</th>
              <th className="py-2.5 px-3 font-bold">Reference</th>
              <th className="py-2.5 px-3 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EFE8]">
            {payments.length === 0 && <tr><td colSpan={8} className="py-4 px-3 text-[#66736A]">No payments found.</td></tr>}
            {payments.map((p) => (
              <React.Fragment key={p.id}>
                <tr className={`hover:bg-[#FAF8F2] transition-colors ${p.paymentMethod === 'till_manual' && p.status === 'pending' ? 'bg-amber-50/50' : ''}`}>
                  <td className="py-2.5 px-3 text-[#66736A]">{p.userEmail || p.userId}</td>
                  <td className="py-2.5 px-3 font-extrabold text-[#17201A]">{formatKsh(p.amountKsh)}</td>
                  <td className="py-2.5 px-3 capitalize">{p.planType.replace(/_/g, ' ')}</td>
                  <td className="py-2.5 px-3">
                    {p.paymentMethod === 'till_manual' ? (
                      <span className="text-[10px] font-extrabold text-[#8a6410]">TILL — needs review</span>
                    ) : (
                      <span className="text-[10px] text-[#66736A]">STK Push</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3"><StatusBadge status={p.status} /></td>
                  <td className="py-2.5 px-3 text-[#66736A]">{formatDate(p.createdAt)}</td>
                  <td className="py-2.5 px-3 font-mono text-[10px]">{p.mpesaReceipt || '—'}</td>
                  <td className="py-2.5 px-3 text-right">
                    {p.status === 'pending' && isTillGeneration(p) && (
                      rejectingId === p.id ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <input
                            autoFocus
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection…"
                            className="px-2 py-1 rounded-lg border border-[#E8E5DD] text-[10px] w-40"
                          />
                          <button
                            onClick={() => handleReject(p.id)}
                            disabled={!rejectReason.trim() || busyId === p.id}
                            className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                          >
                            Confirm Reject
                          </button>
                          <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="px-2.5 py-1 rounded-lg border border-[#E8E5DD] text-[10px] font-bold cursor-pointer">
                            Cancel
                          </button>
                        </div>
                      ) : verifyingId === p.id ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => handleVerify(p.id)} disabled={busyId === p.id} className="px-2.5 py-1 rounded-lg bg-[#14532D] text-white text-[10px] font-bold cursor-pointer disabled:opacity-50">
                            {busyId === p.id ? 'Verifying…' : 'Yes, Verify'}
                          </button>
                          <button onClick={() => setVerifyingId(null)} className="px-2.5 py-1 rounded-lg border border-[#E8E5DD] text-[10px] font-bold cursor-pointer">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => setRejectingId(p.id)} className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 text-[10px] font-bold cursor-pointer hover:bg-red-50">
                            Reject
                          </button>
                          <button onClick={() => setVerifyingId(p.id)} className="px-2.5 py-1 rounded-lg bg-[#17201A] text-white text-[10px] font-bold cursor-pointer hover:bg-black">
                            Verify
                          </button>
                        </div>
                      )
                    )}
                    {p.status === 'pending' && !isTillGeneration(p) && (
                      confirmingId === p.id ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => handleConfirm(p.id)} className="px-2.5 py-1 rounded-lg bg-[#14532D] text-white text-[10px] font-bold cursor-pointer">Yes, Confirm</button>
                          <button onClick={() => setConfirmingId(null)} className="px-2.5 py-1 rounded-lg border border-[#E8E5DD] text-[10px] font-bold cursor-pointer">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmingId(p.id)} className="px-2.5 py-1 rounded-lg bg-[#17201A] text-white text-[10px] font-bold cursor-pointer hover:bg-black">Confirm Payment</button>
                      )
                    )}
                    {p.status === 'success' && isTillGeneration(p) && (
                      <button onClick={() => handleResend(p.id)} disabled={busyId === p.id} className="px-2.5 py-1 rounded-lg border border-[#E8E5DD] text-[#17201A] text-[10px] font-bold cursor-pointer hover:bg-[#FAF8F2] disabled:opacity-50">
                        {busyId === p.id ? 'Sending…' : 'Resend Code Email'}
                      </button>
                    )}
                  </td>
                </tr>
                {revealedCode?.paymentId === p.id && (
                  <tr>
                    <td colSpan={8} className="px-3 pb-3">
                      <div className="p-3 rounded-lg bg-white border border-[#F4B942] flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] text-[#66736A] uppercase font-bold">Shown once — the code has also been notified/emailed to the user</p>
                          <p className="text-sm font-mono font-extrabold text-[#17201A]">{revealedCode.code}</p>
                          <p className="text-[10px] text-[#66736A]">Expires {formatDate(revealedCode.expiresAt)}</p>
                        </div>
                        <button
                          onClick={() => { navigator.clipboard?.writeText(revealedCode.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                          className="p-2 rounded-lg hover:bg-[#FAF8F2] cursor-pointer"
                        >
                          {copied ? <Check className="w-4 h-4 text-[#14532D]" /> : <Copy className="w-4 h-4 text-[#66736A]" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {note?.paymentId === p.id && (
                  <tr>
                    <td colSpan={8} className="px-3 pb-3">
                      <p className="text-[10px] text-[#66736A] italic">{note.text}</p>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
    </Card>
  );
};
