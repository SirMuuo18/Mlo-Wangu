import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Clock, Coins, Flame, ChefHat, Scale, Lightbulb, ShoppingBag, Users, Check } from 'lucide-react';
import { scaleMealIngredientsAccurately } from '../../utils/ingredientCalculator';
import { getFoodImageUrl } from '../../utils/foodImages';

export const RecipeModal: React.FC = () => {
  const { selectedMealForRecipe, setSelectedMealForRecipe, household } = useApp();
  const [customPortions, setCustomPortions] = useState<number>(household?.members?.length || 5);

  if (!selectedMealForRecipe) return null;

  const meal = selectedMealForRecipe;
  const householdCount = household?.members?.length || 5;
  const portions = Math.max(1, customPortions);

  // Scaled calculations for portions
  const scaledData = scaleMealIngredientsAccurately(meal.ingredients || [], portions);
  const dishImageUrl = getFoodImageUrl(meal.name);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#E8E5DD] relative animate-in zoom-in-95 duration-150">
        {/* Hero Photo Banner */}
        <div className="relative h-48 sm:h-56 w-full bg-neutral-900 overflow-hidden">
          <img
            src={dishImageUrl}
            alt={meal.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-90"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/30" />

          {/* Close button */}
          <button
            onClick={() => setSelectedMealForRecipe(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Category & Badge */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-[#FAF8F2]/90 text-[#14532D] backdrop-blur-xs border border-white/20">
              {meal.category}
            </span>
          </div>

          {/* Title on Hero Banner */}
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <h2 className="text-xl sm:text-2xl font-extrabold leading-tight">{meal.name}</h2>
            {meal.swahiliName && (
              <p className="text-xs text-[#F4B942] italic font-semibold mt-0.5">{meal.swahiliName}</p>
            )}
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* Interactive Portion Scaler */}
          <div className="p-4 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#14532D]" />
                <span className="text-xs font-bold text-[#17201A]">Calculating for Portions:</span>
                <span className="text-xs font-black text-[#14532D] bg-white px-2 py-0.5 rounded-md border border-[#E8E5DD] tabular-nums">
                  {portions} {portions === 1 ? 'Person' : 'People'}
                </span>
              </div>
              <p className="text-[11px] text-[#66736A] mt-0.5">
                Exact raw weights (meat in kgs, sukuma in bunches, unga in kgs) adjust automatically.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={customPortions}
                onChange={(e) => setCustomPortions(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 px-2 py-1.5 bg-white border border-[#E8E5DD] rounded-xl text-xs font-bold text-[#17201A] text-center focus:ring-2 focus:ring-[#14532D]"
              />
              <button
                onClick={() => setCustomPortions(householdCount)}
                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-gray-100 border border-[#E8E5DD] text-[11px] font-bold text-[#14532D] cursor-pointer"
              >
                Household ({householdCount})
              </button>
            </div>
          </div>

          {/* Quick Metrics Banner */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-[#66736A]">
                <Clock className="w-3.5 h-3.5" />
                <span>Prep Time</span>
              </div>
              <p className="text-sm font-extrabold text-[#17201A] mt-0.5">{meal.prepTimeMinutes} mins</p>
            </div>

            <div className="p-3 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-[#66736A]">
                <Coins className="w-3.5 h-3.5 text-[#D97706]" />
                <span>Est. Total Cost</span>
              </div>
              <p className="text-sm font-extrabold text-[#14532D] mt-0.5 tabular-nums">
                KSh {scaledData.totalEstimatedCostKsh.toLocaleString()}
              </p>
            </div>

            <div className="p-3 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-[#66736A]">
                <Scale className="w-3.5 h-3.5 text-blue-600" />
                <span>Total Food Weight</span>
              </div>
              <p className="text-sm font-extrabold text-[#17201A] mt-0.5 tabular-nums">
                ~{scaledData.totalWeightKg} kg
              </p>
            </div>
          </div>

          {/* Accurate Ingredients List with Photos & kg Weights */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-[#17201A] flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-[#14532D]" />
                Ingredients & Shopping Weights (For {portions} {portions === 1 ? 'Person' : 'People'})
              </h3>
              <span className="text-[11px] font-semibold text-[#66736A]">Scaled per serving</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {scaledData.items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#FAF8F2] hover:bg-white rounded-2xl border border-[#E8E5DD] flex items-center gap-3 transition-all shadow-2xs"
                >
                  {/* Photo thumbnail */}
                  <div className="w-12 h-12 rounded-xl bg-gray-200 overflow-hidden shrink-0 border border-[#E8E5DD]">
                    <img
                      src={item.imageUrl}
                      alt={item.rawName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-[#17201A] truncate">{item.rawName}</span>
                      <span className="text-xs font-black text-[#14532D] tabular-nums shrink-0 ml-1">
                        {item.displayQuantity}
                      </span>
                    </div>

                    <p className="text-[10px] text-[#66736A] font-medium mt-0.5">
                      Per serving: <span className="font-bold text-[#17201A]">{item.perServingText}</span>
                    </p>

                    <p className="text-[10px] text-[#92400E] font-semibold mt-0.5 truncate">
                      🛒 {item.marketBuyingGuide}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Step by Step Cooking Instructions */}
          <div>
            <h3 className="text-sm font-extrabold text-[#17201A] mb-3">Cooking Instructions</h3>
            <div className="space-y-2.5">
              {(meal.instructions || []).map((step, idx) => (
                <div key={idx} className="flex gap-3 text-xs leading-relaxed">
                  <span className="w-6 h-6 rounded-full bg-[#14532D] text-white flex items-center justify-center text-[11px] font-extrabold shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <p className="text-[#17201A] pt-0.5">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Kenyan Cooking Tips / Budget Advice */}
          {meal.kenyanCookingTips && (
            <div className="p-4 bg-[#FEF3C7]/60 rounded-2xl border border-[#FDE68A] flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-[#92400E] block">Kenyan Kitchen Tip:</span>
                <p className="text-xs text-[#78350F] mt-0.5 leading-relaxed">{meal.kenyanCookingTips}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

