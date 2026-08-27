import React from 'react';
import { Heart, Utensils, Wallet, ShoppingBasket, Droplet, Sparkles } from 'lucide-react';
import { ABOUT_INTRO, ABOUT_SECTIONS } from '../data/supportContent';

const SECTION_ICONS = [Sparkles, Utensils, Wallet, ShoppingBasket, Droplet, Heart];

export const AboutView: React.FC = () => {
  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
            <Heart className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">About Mlo Wangu</h1>
            <p className="text-xs text-[#66736A] mt-0.5">Kenyan Family Meal & Budget Assistant</p>
          </div>
        </div>

        <p className="text-sm text-[#17201A] leading-relaxed mt-5 pt-5 border-t border-[#F1EFE8]">
          {ABOUT_INTRO}
        </p>
      </div>

      {/* Section Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ABOUT_SECTIONS.map((section, idx) => {
          const Icon = SECTION_ICONS[idx % SECTION_ICONS.length];
          return (
            <div key={section.heading} className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="p-2 rounded-xl bg-[#FAF8F2] text-[#14532D] border border-[#E8E5DD] shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-extrabold text-[#17201A]">{section.heading}</h2>
              </div>
              <p className="text-xs text-[#66736A] leading-relaxed">{section.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
