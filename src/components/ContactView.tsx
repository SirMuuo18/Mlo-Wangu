import React from 'react';
import { Mail, LifeBuoy, CheckCircle2 } from 'lucide-react';
import { SUPPORT_EMAIL, SUPPORT_MAILTO, CONTACT_REASONS } from '../data/supportContent';

export const ContactView: React.FC = () => {
  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
            <LifeBuoy className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">Contact & Support</h1>
            <p className="text-xs text-[#66736A] mt-0.5">We're happy to help with your Mlo Wangu account</p>
          </div>
        </div>

        {/* Support email — the primary call to action on this page */}
        <a
          href={SUPPORT_MAILTO}
          className="mt-5 flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD] hover:bg-[#F1EFE8] hover:border-[#14532D]/30 transition-all group"
          aria-label={`Email Mlo Wangu support at ${SUPPORT_EMAIL}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white border border-[#E8E5DD] text-[#14532D] shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#66736A] uppercase tracking-wide">Email Support</p>
              <p className="text-sm font-extrabold text-[#17201A] group-hover:text-[#14532D] transition-colors">
                {SUPPORT_EMAIL}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-[#14532D] bg-white border border-[#14532D]/20 px-3 py-1.5 rounded-lg shrink-0">
            Open Email
          </span>
        </a>
      </div>

      {/* What support can help with */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <h2 className="text-sm font-extrabold text-[#17201A] mb-1">What we can help with</h2>
        <p className="text-xs text-[#66736A] mb-4">
          Email us any time and let us know which of these applies — it helps us respond faster.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CONTACT_REASONS.map((reason) => (
            <div
              key={reason.label}
              className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD]"
            >
              <CheckCircle2 className="w-4 h-4 text-[#14532D] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-[#17201A]">{reason.label}</p>
                <p className="text-[11px] text-[#66736A] mt-0.5 leading-relaxed">{reason.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
