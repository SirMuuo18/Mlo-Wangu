import React from 'react';

// Shared visual building blocks for the admin console — same tokens already
// used throughout AdminView (white cards, rounded-3xl, #E8E5DD borders,
// #14532D green / #F4B942 gold accents) so new sections look like they were
// always part of MLO Wangu, not a bolted-on second design system.

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs ${className}`}>{children}</div>
);

export const SectionHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode }> = ({ title, subtitle, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-[#F1EFE8]">
    <div>
      <h3 className="text-base font-extrabold text-[#17201A]">{title}</h3>
      {subtitle && <p className="text-xs text-[#66736A] mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-[#14532D]/10 text-[#14532D] border-[#14532D]/20',
  CONFIRMED: 'bg-[#14532D]/10 text-[#14532D] border-[#14532D]/20',
  success: 'bg-[#14532D]/10 text-[#14532D] border-[#14532D]/20',
  USED: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING: 'bg-[#F4B942]/15 text-[#8a6410] border-[#F4B942]/30',
  pending: 'bg-[#F4B942]/15 text-[#8a6410] border-[#F4B942]/30',
  EXPIRED: 'bg-gray-100 text-gray-500 border-gray-200',
  expired: 'bg-gray-100 text-gray-500 border-gray-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  failed: 'bg-red-50 text-red-600 border-red-200',
  failure: 'bg-red-50 text-red-600 border-red-200',
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase border ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
    {status}
  </span>
);

export const Pagination: React.FC<{ page: number; pageSize: number; total: number; onPage: (page: number) => void }> = ({ page, pageSize, total, onPage }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#F1EFE8] text-xs text-[#66736A]">
      <span>
        Page {page} of {totalPages} &middot; {total} total
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg border border-[#E8E5DD] font-bold disabled:opacity-40 hover:bg-[#FAF8F2] cursor-pointer disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-lg border border-[#E8E5DD] font-bold disabled:opacity-40 hover:bg-[#FAF8F2] cursor-pointer disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function formatKsh(amount: number): string {
  return `KSh ${amount.toLocaleString()}`;
}
