import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, RefreshCw, Shuffle, Coins, Clock, Check } from 'lucide-react';
import { Meal } from '../../types';

export const SwapMealModal: React.FC = () => {
  const { selectedMealForSwap, setSelectedMealForSwap, allMeals, swapMeal } = useApp();
  const [isSwapping, setIsSwapping] = useState(false);

  if (!selectedMealForSwap) return null;

  const { day, mealType, meal } = selectedMealForSwap;

  // Filter possible alternatives of same category
  const alternatives = allMeals
    .filter((m) => m.category === meal.category && m.id !== meal.id)
    .slice(0, 6);

  const handleSelectMeal = async (newMealId: string) => {
    setIsSwapping(true);
    try {
      await swapMeal(day, mealType, meal.id, 'random');
    } finally {
      setIsSwapping(false);
    }
  };

  const handleQuickReasonSwap = async (reason: 'cheaper' | 'faster' | 'random') => {
    setIsSwapping(true);
    try {
      await swapMeal(day, mealType, meal.id, reason);
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#E8E5DD] relative animate-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto">
        <button
          onClick={() => setSelectedMealForSwap(null)}
          className="absolute top-4 right-4 p-2 text-[#66736A] hover:text-[#17201A] rounded-full hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#FAF8F2] text-[#14532D] border border-[#E8E5DD]">
            Swap {day} {mealType}
          </span>
          <h3 className="text-xl font-extrabold text-[#17201A] mt-2">Replace "{meal.name}"</h3>
          <p className="text-xs text-[#66736A] mt-0.5">
            Choose an intelligent alternative tailored for Kenyan families.
          </p>
        </div>

        {/* Quick Goal Buttons */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button
            onClick={() => handleQuickReasonSwap('cheaper')}
            disabled={isSwapping}
            className="p-2.5 rounded-xl bg-[#FAF8F2] hover:bg-[#F1EFE8] border border-[#E8E5DD] text-center text-xs font-bold text-[#14532D] flex flex-col items-center gap-1 cursor-pointer"
          >
            <Coins className="w-4 h-4 text-[#D97706]" />
            <span>Cheaper Meal</span>
          </button>

          <button
            onClick={() => handleQuickReasonSwap('faster')}
            disabled={isSwapping}
            className="p-2.5 rounded-xl bg-[#FAF8F2] hover:bg-[#F1EFE8] border border-[#E8E5DD] text-center text-xs font-bold text-[#14532D] flex flex-col items-center gap-1 cursor-pointer"
          >
            <Clock className="w-4 h-4 text-blue-600" />
            <span>Faster Prep</span>
          </button>

          <button
            onClick={() => handleQuickReasonSwap('random')}
            disabled={isSwapping}
            className="p-2.5 rounded-xl bg-[#FAF8F2] hover:bg-[#F1EFE8] border border-[#E8E5DD] text-center text-xs font-bold text-[#14532D] flex flex-col items-center gap-1 cursor-pointer"
          >
            <Shuffle className="w-4 h-4 text-[#14532D]" />
            <span>Surprise Me</span>
          </button>
        </div>

        {/* Alternatives List */}
        <div className="mt-5 space-y-2">
          <h4 className="text-xs font-extrabold text-[#17201A] uppercase tracking-wider">
            Or Pick from Recommended Kenyan Recipes:
          </h4>

          {alternatives.map((alt) => (
            <div
              key={alt.id}
              onClick={() => handleSelectMeal(alt.id)}
              className="p-3 bg-[#FAF8F2] hover:bg-white border border-[#E8E5DD] hover:border-[#14532D] rounded-2xl transition-all cursor-pointer flex items-center justify-between shadow-2xs"
            >
              <div>
                <p className="text-xs font-extrabold text-[#17201A]">{alt.name}</p>
                {alt.swahiliName && (
                  <p className="text-[10px] text-[#14532D] italic font-medium">{alt.swahiliName}</p>
                )}
                <div className="mt-1 flex items-center gap-2 text-[10px] text-[#66736A]">
                  <span>{alt.prepTimeMinutes} mins</span>
                  <span>•</span>
                  <span className="text-[#D97706] font-semibold">Est. KSh {alt.estimatedCostKsh}</span>
                </div>
              </div>

              <button className="px-3 py-1.5 bg-white border border-[#E8E5DD] rounded-xl text-xs font-bold text-[#14532D] hover:bg-[#14532D] hover:text-white transition-all">
                Select
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
