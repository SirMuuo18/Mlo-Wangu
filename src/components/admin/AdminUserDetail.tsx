import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Mail, KeyRound, ShieldCheck, Home, CreditCard, StickyNote, AlertTriangle, Copy, Check } from 'lucide-react';
import { api, AdminUserDetail as AdminUserDetailType, SupportNote } from '../../services/api';
import { Card, SectionHeader, StatusBadge, formatDate, formatKsh } from './adminUi';

export const AdminUserDetail: React.FC<{ userId: string; onBack: () => void }> = ({ userId, onBack }) => {
  const [detail, setDetail] = useState<AdminUserDetailType | null>(null);
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [issuedCode, setIssuedCode] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const [issueDescription, setIssueDescription] = useState('');
  const [issueBusy, setIssueBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [noteIssue, setNoteIssue] = useState('');
  const [noteAction, setNoteAction] = useState('');
  const [noteResolution, setNoteResolution] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, n] = await Promise.all([api.getAdminUserDetail(userId), api.getSupportNotes(userId)]);
      setDetail(d);
      setNotes(n.notes);
    } catch (err: any) {
      setError(err.message || 'Failed to load user');
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleSendReset = async () => {
    setResetBusy(true);
    try {
      await api.sendAdminPasswordReset(userId);
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email');
    } finally {
      setResetBusy(false);
      setConfirmingReset(false);
    }
  };

  const handleIssueCode = async () => {
    setIssueBusy(true);
    try {
      const res = await api.issueAdminAccessCode(userId, issueDescription || undefined);
      setIssuedCode({ code: res.code, expiresAt: res.expiresAt });
      setIssueDescription('');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to issue access code');
    } finally {
      setIssueBusy(false);
    }
  };

  const handleConfirmPayment = async (paymentId: string) => {
    try {
      await api.confirmAdminPayment(paymentId);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to confirm payment');
    }
  };

  const handleAddNote = async () => {
    if (!noteIssue.trim()) return;
    setNoteBusy(true);
    try {
      await api.createSupportNote({ userId, issue: noteIssue, actionTaken: noteAction || undefined, resolution: noteResolution || undefined, resolved: !!noteResolution });
      setNoteIssue(''); setNoteAction(''); setNoteResolution('');
      const n = await api.getSupportNotes(userId);
      setNotes(n.notes);
    } catch (err: any) {
      setError(err.message || 'Failed to save note');
    } finally {
      setNoteBusy(false);
    }
  };

  const handleResolveNote = async (noteId: string) => {
    try {
      await api.resolveSupportNote(noteId);
      const n = await api.getSupportNotes(userId);
      setNotes(n.notes);
    } catch (err: any) {
      setError(err.message || 'Failed to resolve note');
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-[#66736A] hover:text-[#17201A] cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Users
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {!detail ? (
        <Card><p className="text-sm text-[#66736A]">Loading user…</p></Card>
      ) : (
        <>
          <Card>
            <SectionHeader
              title={detail.account.name || 'Unnamed User'}
              subtitle={detail.account.email || 'No email on file'}
              action={<StatusBadge status={detail.account.role === 'admin' ? 'ACTIVE' : detail.account.status} />}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div><span className="text-[#66736A] block">Created</span><span className="font-bold text-[#17201A]">{formatDate(detail.account.createdAt)}</span></div>
              <div><span className="text-[#66736A] block">Role</span><span className="font-bold text-[#17201A] capitalize">{detail.account.role}</span></div>
              <div><span className="text-[#66736A] block">Onboarding</span><span className="font-bold text-[#17201A]">{detail.account.onboardingComplete ? 'Complete' : 'Incomplete'}</span></div>
            </div>

            <div className="mt-4 pt-4 border-t border-[#F1EFE8]">
              {!confirmingReset ? (
                <button
                  onClick={() => setConfirmingReset(true)}
                  disabled={!detail.account.email}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#17201A] text-white text-xs font-extrabold hover:bg-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Mail className="w-3.5 h-3.5 text-[#F4B942]" /> Send Password Reset
                </button>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#FAF8F2] border border-[#E8E5DD]">
                  <p className="text-xs font-bold text-[#17201A] mb-2">Send password reset email to {detail.account.email}?</p>
                  <div className="flex gap-2">
                    <button onClick={handleSendReset} disabled={resetBusy} className="px-3 py-1.5 rounded-lg bg-[#14532D] text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                      {resetBusy ? 'Sending…' : 'Confirm'}
                    </button>
                    <button onClick={() => setConfirmingReset(false)} className="px-3 py-1.5 rounded-lg border border-[#E8E5DD] text-xs font-bold cursor-pointer">Cancel</button>
                  </div>
                </div>
              )}
              {resetSent && <p className="text-xs text-[#14532D] font-bold mt-2">Password reset email sent.</p>}
            </div>
          </Card>

          <Card>
            <SectionHeader
              title="Meal Plan & Access"
              subtitle={detail.mealPlan.hasActiveMealPlanAccess ? 'Has active, unused generation access' : 'No active generation access'}
              action={<KeyRound className="w-5 h-5 text-[#14532D]" />}
            />

            <div className="mb-4 p-3.5 rounded-xl bg-[#FAF8F2] border border-[#E8E5DD]">
              <p className="text-xs font-bold text-[#17201A] mb-2">Issue Access Code (manual support action)</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="Reason (e.g. verified Paybill payment REF123)"
                  className="flex-1 px-3 py-2 bg-white border border-[#E8E5DD] rounded-lg text-xs"
                />
                <button onClick={handleIssueCode} disabled={issueBusy} className="px-3.5 py-2 rounded-lg bg-[#14532D] text-white text-xs font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap">
                  {issueBusy ? 'Issuing…' : 'Issue Code'}
                </button>
              </div>
              {issuedCode && (
                <div className="mt-3 p-3 rounded-lg bg-white border border-[#F4B942] flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] text-[#66736A] uppercase font-bold">Shown once — relay to the user now</p>
                    <p className="text-sm font-mono font-extrabold text-[#17201A]">{issuedCode.code}</p>
                    <p className="text-[10px] text-[#66736A]">Expires {formatDate(issuedCode.expiresAt)}</p>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(issuedCode.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="p-2 rounded-lg hover:bg-[#FAF8F2] cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-[#14532D]" /> : <Copy className="w-4 h-4 text-[#66736A]" />}
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E8E5DD] text-[#66736A]">
                    <th className="py-2 px-2 font-bold">Code Status</th>
                    <th className="py-2 px-2 font-bold">Uses</th>
                    <th className="py-2 px-2 font-bold">Issued</th>
                    <th className="py-2 px-2 font-bold">Expires</th>
                    <th className="py-2 px-2 font-bold">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1EFE8]">
                  {detail.mealPlan.accessCodes.length === 0 && (
                    <tr><td colSpan={5} className="py-3 px-2 text-[#66736A]">No access codes issued to this user.</td></tr>
                  )}
                  {detail.mealPlan.accessCodes.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 px-2"><StatusBadge status={c.status} /></td>
                      <td className="py-2 px-2 tabular-nums">{c.usedCount}/{c.maxUses}</td>
                      <td className="py-2 px-2">{formatDate(c.createdAt)}</td>
                      <td className="py-2 px-2">{formatDate(c.expiresAt)}</td>
                      <td className="py-2 px-2 text-[#66736A]">{c.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionHeader title="Payments" action={<CreditCard className="w-5 h-5 text-[#14532D]" />} />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E8E5DD] text-[#66736A]">
                    <th className="py-2 px-2 font-bold">Amount</th>
                    <th className="py-2 px-2 font-bold">Plan</th>
                    <th className="py-2 px-2 font-bold">Method</th>
                    <th className="py-2 px-2 font-bold">Status</th>
                    <th className="py-2 px-2 font-bold">Date</th>
                    <th className="py-2 px-2 font-bold">Reference</th>
                    <th className="py-2 px-2 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1EFE8]">
                  {detail.payments.length === 0 && (
                    <tr><td colSpan={7} className="py-3 px-2 text-[#66736A]">No payments on record.</td></tr>
                  )}
                  {detail.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 px-2 font-bold">{formatKsh(p.amountKsh)}</td>
                      <td className="py-2 px-2 capitalize">{p.planType.replace(/_/g, ' ')}</td>
                      <td className="py-2 px-2 text-[10px]">{p.paymentMethod === 'till_manual' ? 'Till' : 'STK Push'}</td>
                      <td className="py-2 px-2"><StatusBadge status={p.status} /></td>
                      <td className="py-2 px-2">{formatDate(p.createdAt)}</td>
                      <td className="py-2 px-2 font-mono text-[10px]">{p.mpesaReceipt || '—'}</td>
                      <td className="py-2 px-2 text-right">
                        {p.status === 'pending' && (
                          <button onClick={() => handleConfirmPayment(p.id)} className="px-2.5 py-1 rounded-lg bg-[#14532D] text-white text-[10px] font-bold cursor-pointer">
                            Confirm Payment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <SectionHeader title="Subscription" action={<ShieldCheck className="w-5 h-5 text-[#14532D]" />} />
              {detail.subscription ? (
                <div className="space-y-1.5 text-xs">
                  <p><span className="text-[#66736A]">Plan:</span> <span className="font-bold capitalize">{detail.subscription.planType}</span></p>
                  <p><span className="text-[#66736A]">Status:</span> <StatusBadge status={detail.subscription.status} /></p>
                  <p><span className="text-[#66736A]">Start:</span> {formatDate(detail.subscription.startDate)}</p>
                  <p><span className="text-[#66736A]">End:</span> {formatDate(detail.subscription.endDate)}</p>
                </div>
              ) : (
                <p className="text-xs text-[#66736A]">No subscription on record.</p>
              )}
            </Card>
            <Card>
              <SectionHeader title="Household" action={<Home className="w-5 h-5 text-[#14532D]" />} />
              {detail.household ? (
                <div className="space-y-1.5 text-xs">
                  <p><span className="text-[#66736A]">Name:</span> <span className="font-bold">{detail.household.name}</span></p>
                  <p><span className="text-[#66736A]">Members:</span> <span className="font-bold">{detail.household.memberCount}</span></p>
                </div>
              ) : (
                <p className="text-xs text-[#66736A]">No household on record.</p>
              )}
              <p className="text-[10px] text-[#66736A] mt-3 italic">
                Income, rent, savings, expenses, and Budget PIN are private and are never shown here.
              </p>
            </Card>
          </div>

          <Card>
            <SectionHeader title="Support Notes" action={<StickyNote className="w-5 h-5 text-[#14532D]" />} />
            <div className="p-3.5 rounded-xl bg-[#FAF8F2] border border-[#E8E5DD] mb-4 space-y-2">
              <textarea value={noteIssue} onChange={(e) => setNoteIssue(e.target.value)} placeholder="Issue (e.g. User could not log in.)" rows={2} className="w-full px-3 py-2 bg-white border border-[#E8E5DD] rounded-lg text-xs" />
              <textarea value={noteAction} onChange={(e) => setNoteAction(e.target.value)} placeholder="Action taken (e.g. Sent password reset email.)" rows={2} className="w-full px-3 py-2 bg-white border border-[#E8E5DD] rounded-lg text-xs" />
              <textarea value={noteResolution} onChange={(e) => setNoteResolution(e.target.value)} placeholder="Resolution, if resolved (e.g. Resolved.)" rows={1} className="w-full px-3 py-2 bg-white border border-[#E8E5DD] rounded-lg text-xs" />
              <button onClick={handleAddNote} disabled={noteBusy || !noteIssue.trim()} className="px-3.5 py-2 rounded-lg bg-[#14532D] text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                {noteBusy ? 'Saving…' : 'Add Note'}
              </button>
            </div>
            <div className="space-y-2">
              {notes.length === 0 && <p className="text-xs text-[#66736A]">No support notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} className="p-3 rounded-xl border border-[#E8E5DD]">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={n.resolved ? 'ACTIVE' : 'PENDING'} />
                    <span className="text-[10px] text-[#66736A]">{formatDate(n.created_at)}</span>
                  </div>
                  <p className="text-xs text-[#17201A] mt-1.5"><span className="font-bold">Issue:</span> {n.issue}</p>
                  {n.action_taken && <p className="text-xs text-[#17201A] mt-1"><span className="font-bold">Action:</span> {n.action_taken}</p>}
                  {n.resolution && <p className="text-xs text-[#17201A] mt-1"><span className="font-bold">Resolution:</span> {n.resolution}</p>}
                  {!n.resolved && (
                    <button onClick={() => handleResolveNote(n.id)} className="mt-2 text-[10px] font-bold text-[#14532D] hover:underline cursor-pointer">
                      Mark Resolved
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
