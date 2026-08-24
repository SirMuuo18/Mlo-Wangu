import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../services/api';
import { Card, SectionHeader, Pagination, StatusBadge, formatDate } from './adminUi';

export const AdminSupport: React.FC<{ onOpenUser?: (userId: string) => void }> = ({ onOpenUser }) => {
  const [showResolved, setShowResolved] = useState(false);
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState('');

  const load = useCallback(async (resolved: boolean, p: number) => {
    try {
      const res = await api.getAllSupportNotes(resolved ? undefined : false, p, 20);
      setNotes(res.notes); setTotal(res.total); setPageSize(res.pageSize);
    } catch (err: any) {
      setError(err.message || 'Failed to load support queue');
    }
  }, []);

  useEffect(() => { load(showResolved, page); }, [load, showResolved, page]);

  return (
    <Card>
      <SectionHeader
        title="Support Queue"
        subtitle={showResolved ? 'All support notes, most recent first.' : 'Open (unresolved) support issues across all users.'}
        action={
          <button
            onClick={() => { setShowResolved((v) => !v); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-[#E8E5DD] text-xs font-bold hover:bg-[#FAF8F2] cursor-pointer"
          >
            {showResolved ? 'Show open only' : 'Show all'}
          </button>
        }
      />
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="space-y-2">
        {notes.length === 0 && <p className="text-xs text-[#66736A]">Nothing here — the queue is clear.</p>}
        {notes.map((n) => (
          <div key={n.id} className="p-3 rounded-xl border border-[#E8E5DD] hover:bg-[#FAF8F2] transition-colors">
            <div className="flex items-center justify-between">
              <button onClick={() => onOpenUser?.(n.user_id)} className="text-xs font-extrabold text-[#17201A] hover:underline cursor-pointer">
                {n.userLabel}
              </button>
              <div className="flex items-center gap-2">
                <StatusBadge status={n.resolved ? 'ACTIVE' : 'PENDING'} />
                <span className="text-[10px] text-[#66736A]">{formatDate(n.created_at)}</span>
              </div>
            </div>
            <p className="text-xs text-[#17201A] mt-1.5"><span className="font-bold">Issue:</span> {n.issue}</p>
            {n.action_taken && <p className="text-xs text-[#17201A] mt-1"><span className="font-bold">Action:</span> {n.action_taken}</p>}
          </div>
        ))}
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
    </Card>
  );
};
