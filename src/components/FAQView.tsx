import React, { useState } from 'react';
import { HelpCircle, ChevronDown, Mail } from 'lucide-react';
import { FAQ_CATEGORIES, SUPPORT_MAILTO, SUPPORT_EMAIL } from '../data/supportContent';

export const FAQView: React.FC = () => {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggle = (key: string) => {
    setOpenKey((current) => (current === key ? null : key));
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">Frequently Asked Questions</h1>
            <p className="text-xs text-[#66736A] mt-0.5">Answers about your account, meal plans, shopping, budget and payments</p>
          </div>
        </div>
      </div>

      {/* FAQ Categories */}
      {FAQ_CATEGORIES.map((cat) => (
        <div key={cat.category} className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
          <h2 className="text-xs font-bold text-[#14532D] uppercase tracking-wider mb-3">{cat.category}</h2>

          <div className="divide-y divide-[#F1EFE8]">
            {cat.items.map((item, idx) => {
              const key = `${cat.category}-${idx}`;
              const isOpen = openKey === key;
              const panelId = `faq-panel-${key}`;
              const buttonId = `faq-button-${key}`;

              return (
                <div key={key} className="py-1">
                  <h3>
                    <button
                      id={buttonId}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => toggle(key)}
                      className="w-full flex items-center justify-between gap-3 py-3 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14532D] rounded-lg"
                    >
                      <span className="text-sm font-bold text-[#17201A]">{item.q}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`w-4 h-4 text-[#66736A] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </h3>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    hidden={!isOpen}
                    className="pb-3.5 -mt-1"
                  >
                    <p className="text-xs text-[#66736A] leading-relaxed">{item.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Still need help CTA */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-extrabold text-[#17201A]">Still have a question?</h2>
          <p className="text-xs text-[#66736A] mt-0.5">Our support team is happy to help.</p>
        </div>
        <a
          href={SUPPORT_MAILTO}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#14532D] text-white text-xs font-bold hover:bg-[#0f3e22] transition-all shadow-xs shrink-0"
          aria-label={`Email Mlo Wangu support at ${SUPPORT_EMAIL}`}
        >
          <Mail className="w-4 h-4" />
          Email {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
};
