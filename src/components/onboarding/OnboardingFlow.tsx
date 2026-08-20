import React, { useState } from 'react';
import {
  UtensilsCrossed, Home, Users, Heart, Wallet,
  ChevronRight, ChevronLeft, Check,
} from 'lucide-react';

export interface OnboardingData {
  householdType: 'single' | 'couple' | 'family' | 'shared';
  preferences: string[];
  allergies: string[];
  memberCount: number;
  hasBudget: boolean;
  monthlyIncomeKsh: number;
}

const FOOD_PREFERENCES = [
  'Ugali', 'Sukuma Wiki', 'Nyama Choma', 'Fish', 'Pilau', 'Githeri',
  'Mukimo', 'Chapati', 'Mandazi', 'Matoke', 'Vegetarian', 'High Protein',
];

const COMMON_ALLERGIES = ['Gluten', 'Dairy', 'Nuts', 'Shellfish', 'Eggs', 'Soy'];

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
}

const Step1Welcome: React.FC = () => (
  <div className="text-center py-4">
    <div className="w-20 h-20 rounded-3xl bg-[#F4B942] flex items-center justify-center mx-auto mb-5 shadow-xl">
      <UtensilsCrossed className="w-11 h-11 text-[#17201A]" />
    </div>
    <h2 className="text-2xl font-extrabold text-white mb-3">Karibu Mlo Wangu!</h2>
    <p className="text-blue-200 text-sm leading-relaxed">
      Your personal Kenyan meal planner and household budget tracker. Let's set up
      your household profile so we can suggest meals and budgets that fit your life.
    </p>
    <div className="mt-6 grid grid-cols-3 gap-3 text-center">
      {[
        { icon: '🍲', label: 'Smart Meal Plans' },
        { icon: '💰', label: 'Budget Tracking' },
        { icon: '🛒', label: 'Shopping Lists' },
      ].map((f) => (
        <div key={f.label} className="bg-white/10 rounded-2xl p-3">
          <div className="text-2xl mb-1">{f.icon}</div>
          <div className="text-[11px] text-blue-200 font-semibold">{f.label}</div>
        </div>
      ))}
    </div>
  </div>
);

const Step2HouseholdType: React.FC<StepProps> = ({ data, setData }) => {
  const types: { value: OnboardingData['householdType']; label: string; desc: string; icon: string }[] = [
    { value: 'single', label: 'Just Me', desc: 'Solo household', icon: '🧑' },
    { value: 'couple', label: 'Couple', desc: 'Two adults', icon: '👫' },
    { value: 'family', label: 'Family', desc: 'Adults & children', icon: '👨‍👩‍👧‍👦' },
    { value: 'shared', label: 'Shared House', desc: 'Housemates or relatives', icon: '🏠' },
  ];
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Home className="w-5 h-5 text-[#F4B942]" />
        <h2 className="text-xl font-extrabold text-white">Your Household</h2>
      </div>
      <p className="text-blue-200 text-xs mb-5">Who are you cooking for?</p>
      <div className="grid grid-cols-2 gap-3">
        {types.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setData((d) => ({ ...d, householdType: t.value }))}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              data.householdType === t.value
                ? 'bg-[#F4B942]/20 border-[#F4B942] shadow'
                : 'bg-white/10 border-white/20 hover:bg-white/15'
            }`}
          >
            <div className="text-2xl mb-1">{t.icon}</div>
            <div className="text-sm font-extrabold text-white">{t.label}</div>
            <div className="text-[11px] text-blue-200">{t.desc}</div>
          </button>
        ))}
      </div>
      {(data.householdType === 'family' || data.householdType === 'shared') && (
        <div className="mt-4">
          <label className="text-xs font-bold text-blue-200 block mb-1">How many people?</label>
          <input
            type="number"
            min={2}
            max={12}
            value={data.memberCount}
            onChange={(e) => setData((d) => ({ ...d, memberCount: Math.max(2, Number(e.target.value)) }))}
            className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-2xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
          />
        </div>
      )}
    </div>
  );
};

const Step3Preferences: React.FC<StepProps> = ({ data, setData }) => {
  const toggle = (list: 'preferences' | 'allergies', val: string) => {
    setData((d) => ({
      ...d,
      [list]: d[list].includes(val) ? d[list].filter((v) => v !== val) : [...d[list], val],
    }));
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Heart className="w-5 h-5 text-[#F4B942]" />
        <h2 className="text-xl font-extrabold text-white">Food Preferences</h2>
      </div>
      <p className="text-blue-200 text-xs mb-4">We'll use this to personalise your meal plans.</p>

      <p className="text-xs font-bold text-blue-200 mb-2">Favourite foods (pick any)</p>
      <div className="flex flex-wrap gap-2 mb-5">
        {FOOD_PREFERENCES.map((pref) => (
          <button
            key={pref}
            type="button"
            onClick={() => toggle('preferences', pref)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              data.preferences.includes(pref)
                ? 'bg-[#F4B942] border-[#F4B942] text-[#17201A]'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            }`}
          >
            {pref}
          </button>
        ))}
      </div>

      <p className="text-xs font-bold text-blue-200 mb-2">Allergies / avoid (optional)</p>
      <div className="flex flex-wrap gap-2">
        {COMMON_ALLERGIES.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => toggle('allergies', a)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              data.allergies.includes(a)
                ? 'bg-red-500/30 border-red-400 text-red-200'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            }`}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
};

const Step4Family: React.FC<StepProps> = ({ data, setData }) => (
  <div>
    <div className="flex items-center gap-2 mb-1">
      <Users className="w-5 h-5 text-[#F4B942]" />
      <h2 className="text-xl font-extrabold text-white">Family Setup</h2>
    </div>
    <p className="text-blue-200 text-xs mb-5">
      You can add individual family members with their own preferences and allergies from the
      <strong className="text-white"> Family</strong> tab after setup. For now, confirm how many
      people you're planning for.
    </p>
    <div className="bg-white/10 rounded-2xl p-4">
      <label className="text-xs font-bold text-blue-200 block mb-1">Household size</label>
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={() => setData((d) => ({ ...d, memberCount: Math.max(1, d.memberCount - 1) }))}
          className="w-10 h-10 rounded-xl bg-white/10 text-white text-lg font-extrabold hover:bg-white/20 cursor-pointer"
        >
          −
        </button>
        <span className="text-3xl font-extrabold text-[#F4B942] w-8 text-center">{data.memberCount}</span>
        <button
          type="button"
          onClick={() => setData((d) => ({ ...d, memberCount: Math.min(12, d.memberCount + 1) }))}
          className="w-10 h-10 rounded-xl bg-white/10 text-white text-lg font-extrabold hover:bg-white/20 cursor-pointer"
        >
          +
        </button>
        <span className="text-sm text-blue-200">{data.memberCount === 1 ? 'person' : 'people'}</span>
      </div>
    </div>
    <p className="text-[11px] text-blue-300/60 mt-3">
      Meal plans and shopping lists will be scaled for {data.memberCount} {data.memberCount === 1 ? 'person' : 'people'}.
    </p>
  </div>
);

const Step5Budget: React.FC<StepProps> = ({ data, setData }) => (
  <div>
    <div className="flex items-center gap-2 mb-1">
      <Wallet className="w-5 h-5 text-[#F4B942]" />
      <h2 className="text-xl font-extrabold text-white">Budget (Optional)</h2>
    </div>
    <p className="text-blue-200 text-xs mb-5">
      Add an approximate monthly income to get budget suggestions. You can skip this and set it
      privately later using your Budget PIN.
    </p>
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setData((d) => ({ ...d, hasBudget: false }))}
        className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer ${
          !data.hasBudget
            ? 'bg-[#F4B942]/20 border-[#F4B942]'
            : 'bg-white/10 border-white/20 hover:bg-white/15'
        }`}
      >
        <div className="text-sm font-extrabold text-white">Skip for now</div>
        <div className="text-[11px] text-blue-200">Set up budget privately in the Budget tab</div>
      </button>
      <button
        type="button"
        onClick={() => setData((d) => ({ ...d, hasBudget: true }))}
        className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer ${
          data.hasBudget
            ? 'bg-[#F4B942]/20 border-[#F4B942]'
            : 'bg-white/10 border-white/20 hover:bg-white/15'
        }`}
      >
        <div className="text-sm font-extrabold text-white">Enter approximate income</div>
        <div className="text-[11px] text-blue-200">Get personalised budget suggestions</div>
      </button>
    </div>
    {data.hasBudget && (
      <div className="mt-4">
        <label className="text-xs font-bold text-blue-200 block mb-1">Monthly Income (KSh)</label>
        <input
          type="number"
          min={0}
          step={1000}
          placeholder="e.g. 50000"
          value={data.monthlyIncomeKsh || ''}
          onChange={(e) => setData((d) => ({ ...d, monthlyIncomeKsh: Number(e.target.value) }))}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
        />
        <p className="text-[11px] text-blue-300/60 mt-1">
          This is stored privately and protected by your Budget PIN.
        </p>
      </div>
    )}
  </div>
);

const STEPS = [
  { label: 'Welcome', component: Step1Welcome },
  { label: 'Household', component: Step2HouseholdType },
  { label: 'Preferences', component: Step3Preferences },
  { label: 'Family', component: Step4Family },
  { label: 'Budget', component: Step5Budget },
];

interface Props {
  onComplete: (data: OnboardingData) => void;
}

export const OnboardingFlow: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    householdType: 'family',
    preferences: [],
    allergies: [],
    memberCount: 2,
    hasBudget: false,
    monthlyIncomeKsh: 0,
  });

  const isLast = step === STEPS.length - 1;
  const StepComponent = STEPS[step].component as React.FC<StepProps | Record<string, never>>;

  const handleNext = () => {
    if (isLast) {
      onComplete(data);
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1e2b] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#172554] rounded-3xl shadow-2xl border border-[#1e3a8a] p-7">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div
              key={s.label}
              className={`transition-all rounded-full ${
                i === step
                  ? 'w-6 h-2.5 bg-[#F4B942]'
                  : i < step
                  ? 'w-2.5 h-2.5 bg-[#F4B942]/60'
                  : 'w-2.5 h-2.5 bg-white/20'
              }`}
            />
          ))}
        </div>

        <StepComponent data={data} setData={setData} />

        <div className="flex items-center gap-3 mt-7">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1 px-4 py-2.5 rounded-2xl bg-white/10 text-blue-200 text-xs font-semibold hover:bg-white/20 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#F4B942] hover:bg-[#E5A72E] text-[#17201A] font-extrabold text-sm transition-all cursor-pointer shadow-md"
          >
            {isLast ? (
              <>
                <Check className="w-4 h-4" />
                Finish Setup
              </>
            ) : (
              <>
                {step === 0 ? 'Get Started' : 'Continue'}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
