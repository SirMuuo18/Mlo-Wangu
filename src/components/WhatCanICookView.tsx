import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ChefHat, Coins, Users, Search, Check, ArrowRight, Eye, AlertCircle, Scale, ShoppingBag } from 'lucide-react';
import { Meal } from '../types';
import { api } from '../services/api';
import { getFoodImageUrl } from '../utils/foodImages';
import { scaleMealIngredientsAccurately } from '../utils/ingredientCalculator';

export const WhatCanICookView: React.FC = () => {
  const { household, setSelectedMealForRecipe } = useApp();

  const [budgetKsh, setBudgetKsh] = useState<number>(300);
  const [householdSize, setHouseholdSize] = useState<number>(household?.members?.length || 5);
  const [selectedPantry, setSelectedPantry] = useState<string[]>(['Maize Flour (Unga)', 'Eggs', 'Sukuma Wiki']);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const staplePantryOptions = [
    'Maize Flour (Unga)',
    'Rice',
    'Wheat Flour',
    'Irish Potatoes (Waru)',
    'Sweet Potatoes (Ngwaci)',
    'Yellow Beans',
    'Ndengu (Green Grams)',
    'Eggs',
    'Sukuma Wiki',
    'Cabbage',
    'Spinach',
    'Tomatoes',
    'Onions',
    'Cooking Oil',
    'Omena',
    'Minji',
  ];

  const isNoLimit = budgetKsh === 0;

  const handleSearch = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const res = await api.whatCanICook({
        budgetKsh: isNoLimit ? 0 : budgetKsh,
        householdSize,
        ingredients: selectedPantry,
      });
      setResults(res.meals || []);
    } catch (err) {
      console.error('Error finding meals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePantry = (item: string) => {
    if (selectedPantry.includes(item)) {
      setSelectedPantry(selectedPantry.filter((i) => i !== item));
    } else {
      setSelectedPantry([...selectedPantry, item]);
    }
  };

  const budgetSliderMax = Math.max(2500, Math.ceil((budgetKsh * 1.5) / 500) * 500);
  const portionSliderMax = Math.max(30, Math.ceil(householdSize * 1.5));

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-[#14532D] text-white p-6 rounded-3xl shadow-sm border border-[#14532D]/40 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-white/10 text-[#F4B942] border border-white/10">
            Intelligent Kenyan Meal Matcher
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-2 text-white">What Can I Cook Today?</h1>
          <p className="text-xs sm:text-sm text-green-100 mt-1 leading-relaxed">
            Enter your target budget and portion count. We calculate exact ingredient weights in kg, bunches, and packets with live photo placeholders.
          </p>
        </div>
      </div>

      {/* Input Controls Card */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Target Budget Input */}
          <div className="p-4 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#17201A]">Target Budget for this Meal</label>
                <span className="text-xs font-extrabold text-[#14532D] tabular-nums bg-white px-2.5 py-0.5 rounded-lg border border-[#E8E5DD]">
                  {isNoLimit ? 'No Limit (Any Budget)' : `KSh ${budgetKsh.toLocaleString()}`}
                </span>
              </div>

              {/* Direct Numeric Input with KSh Prefix */}
              <div className="mt-2.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-[#66736A]">KSh</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter budget (or 0 for no limit)"
                    value={isNoLimit ? '' : budgetKsh}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                      setBudgetKsh(isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    className="w-full pl-11 pr-3 py-2 bg-white border border-[#E8E5DD] rounded-xl text-xs font-bold text-[#17201A] focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setBudgetKsh(0)}
                  className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    isNoLimit
                      ? 'bg-[#14532D] text-white shadow-xs'
                      : 'bg-white text-[#66736A] border border-[#E8E5DD] hover:text-[#17201A]'
                  }`}
                >
                  No Limit
                </button>
              </div>

              {/* Dynamic Range Slider */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max={budgetSliderMax}
                  step="50"
                  value={budgetKsh}
                  onChange={(e) => setBudgetKsh(Number(e.target.value))}
                  className="w-full accent-[#14532D]"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-[#E8E5DD]/70">
              <span className="text-[10px] font-bold text-[#66736A] mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => setBudgetKsh(150)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  budgetKsh === 150 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                KSh 150
              </button>
              <button
                type="button"
                onClick={() => setBudgetKsh(300)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  budgetKsh === 300 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                KSh 300
              </button>
              <button
                type="button"
                onClick={() => setBudgetKsh(500)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  budgetKsh === 500 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                KSh 500
              </button>
              <button
                type="button"
                onClick={() => setBudgetKsh(1000)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  budgetKsh === 1000 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                KSh 1,000
              </button>
              <button
                type="button"
                onClick={() => setBudgetKsh(2500)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  budgetKsh === 2500 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                KSh 2,500
              </button>
            </div>
          </div>

          {/* Household Size Selector */}
          <div className="p-4 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#17201A]">People Eating (Portions)</label>
                <span className="text-xs font-extrabold text-[#14532D] tabular-nums bg-white px-2.5 py-0.5 rounded-lg border border-[#E8E5DD]">
                  {householdSize.toLocaleString()} {householdSize === 1 ? 'Person' : 'People'}
                </span>
              </div>

              {/* Direct Numeric Input with Persons/Portions Suffix */}
              <div className="mt-2.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-[#66736A]">Qty</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter number of people"
                    value={householdSize || ''}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value) || 1);
                      setHouseholdSize(val);
                    }}
                    className="w-full pl-11 pr-3 py-2 bg-white border border-[#E8E5DD] rounded-xl text-xs font-bold text-[#17201A] focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                  />
                </div>
                <div className="px-3 py-2 rounded-xl text-xs font-bold bg-white text-[#14532D] border border-[#E8E5DD]">
                  Portions
                </div>
              </div>

              {/* Dynamic Range Slider */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max={portionSliderMax}
                  step="1"
                  value={householdSize}
                  onChange={(e) => setHouseholdSize(Number(e.target.value))}
                  className="w-full accent-[#14532D]"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-[#E8E5DD]/70">
              <span className="text-[10px] font-bold text-[#66736A] mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => setHouseholdSize(1)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  householdSize === 1 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                1 (Solo)
              </button>
              <button
                type="button"
                onClick={() => setHouseholdSize(4)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  householdSize === 4 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                4 (Family)
              </button>
              <button
                type="button"
                onClick={() => setHouseholdSize(8)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  householdSize === 8 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                8 (Gathering)
              </button>
              <button
                type="button"
                onClick={() => setHouseholdSize(12)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  householdSize === 12 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                12 (Extended)
              </button>
              <button
                type="button"
                onClick={() => setHouseholdSize(25)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  householdSize === 25 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                25 (Chama)
              </button>
              <button
                type="button"
                onClick={() => setHouseholdSize(50)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  householdSize === 50 ? 'bg-[#14532D] text-white' : 'bg-white text-[#17201A] border border-[#E8E5DD] hover:bg-gray-50'
                }`}
              >
                50+ (Feast)
              </button>
            </div>
          </div>
        </div>

        {/* Pantry Staples Multi-Select with Image Placeholders */}
        <div className="mt-5 pt-4 border-t border-[#F1EFE8]">
          <label className="text-xs font-bold text-[#17201A] block mb-2">
            Select Ingredients Already in Your Kitchen (Optional):
          </label>
          <div className="flex flex-wrap gap-2">
            {staplePantryOptions.map((item) => {
              const isSelected = selectedPantry.includes(item);
              const imgUrl = getFoodImageUrl(item);
              return (
                <button
                  key={item}
                  onClick={() => togglePantry(item)}
                  className={`pl-1.5 pr-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-[#14532D] text-white shadow-xs'
                      : 'bg-[#FAF8F2] text-[#66736A] border border-[#E8E5DD] hover:bg-[#F1EFE8]'
                  }`}
                >
                  <img
                    src={imgUrl}
                    alt={item}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-md object-cover border border-black/10"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  {isSelected && <Check className="w-3 h-3 text-[#F4B942]" />}
                  <span>{item}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Find Button */}
        <div className="mt-6">
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-[#14532D] text-white text-xs font-extrabold rounded-2xl hover:bg-[#0f3e22] transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <ChefHat className="w-4 h-4 text-[#F4B942]" />
            {isLoading
              ? 'Calculating Accurate Kenyan Recipes & Portion Weights...'
              : isNoLimit
              ? `Find All Matching Meals (${householdSize} people)`
              : `Find Meals For KSh ${budgetKsh.toLocaleString()} (${householdSize} people)`}
          </button>
        </div>
      </div>

      {/* Results Section */}
      {hasSearched && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[#17201A]">
              {isNoLimit
                ? `Matching Meals for Any Budget (${results.length} ideas found)`
                : `Matching Meals for KSh ${budgetKsh.toLocaleString()} (${results.length} ideas found)`}
            </h2>
            <span className="text-xs text-[#66736A] font-medium">Scaled for {householdSize} {householdSize === 1 ? 'person' : 'people'}</span>
          </div>

          {results.length === 0 ? (
            <div className="bg-white p-8 rounded-3xl border border-dashed border-[#E8E5DD] text-center">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <h3 className="text-sm font-bold text-[#17201A] mt-2">No exact match for this budget</h3>
              <p className="text-xs text-[#66736A] mt-1">Try raising the budget slightly or adding more pantry items.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((meal) => {
                const dishImg = getFoodImageUrl(meal.name);
                const scaled = scaleMealIngredientsAccurately(meal.ingredients || [], householdSize);

                return (
                  <div
                    key={meal.id}
                    className={`rounded-3xl border transition-all flex flex-col justify-between overflow-hidden ${
                      meal.fitsBudget
                        ? 'bg-white border-[#E8E5DD] hover:border-[#14532D] shadow-xs'
                        : 'bg-[#FAF8F2] border-amber-200'
                    }`}
                  >
                    {/* Meal Photo Header */}
                    <div className="relative h-36 w-full bg-neutral-800 overflow-hidden">
                      <img
                        src={dishImg}
                        alt={meal.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      <div className="absolute top-3 left-3">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded backdrop-blur-xs ${
                            meal.fitsBudget
                              ? 'bg-green-700/90 text-white border border-green-500/30'
                              : 'bg-amber-600/90 text-white border border-amber-400/30'
                          }`}
                        >
                          {meal.fitsBudget ? '✓ Fits Budget' : 'Stretch Budget'}
                        </span>
                      </div>

                      <div className="absolute top-3 right-3">
                        <span className="text-xs font-black text-white bg-black/60 px-2 py-0.5 rounded-lg backdrop-blur-xs border border-white/20 tabular-nums">
                          Est. KSh {meal.scaledCostKsh?.toLocaleString()}
                        </span>
                      </div>

                      <div className="absolute bottom-2.5 left-3 right-3 text-white">
                        <h3 className="text-sm font-extrabold leading-snug line-clamp-1">{meal.name}</h3>
                        {meal.swahiliName && (
                          <p className="text-[11px] text-[#F4B942] italic font-medium truncate">{meal.swahiliName}</p>
                        )}
                      </div>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      {/* Portion & Weight Breakdown */}
                      <div className="p-2.5 bg-[#FAF8F2] rounded-xl border border-[#E8E5DD] space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#66736A]">Cost per person:</span>
                          <span className="font-bold text-[#17201A] tabular-nums">
                            ~KSh {Math.round((meal.scaledCostKsh || 0) / householdSize).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#66736A] flex items-center gap-1">
                            <Scale className="w-3 h-3 text-blue-600" />
                            Total ingredients weight:
                          </span>
                          <span className="font-extrabold text-[#14532D] tabular-nums">
                            ~{scaled.totalWeightKg} kg
                          </span>
                        </div>
                      </div>

                      {/* Ingredient Shopping Summary with Mini Photo Placeholders */}
                      <div>
                        <span className="text-[10px] font-extrabold text-[#66736A] uppercase tracking-wider block mb-1.5">
                          Calculated for {householdSize} {householdSize === 1 ? 'person' : 'people'}:
                        </span>
                        <div className="space-y-1">
                          {scaled.items.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] py-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <img
                                  src={item.imageUrl}
                                  alt={item.rawName}
                                  referrerPolicy="no-referrer"
                                  className="w-4 h-4 rounded object-cover shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                                <span className="font-semibold text-[#17201A] truncate">{item.rawName}</span>
                              </div>
                              <span className="font-black text-[#14532D] shrink-0 tabular-nums ml-1">
                                {item.displayQuantity}
                              </span>
                            </div>
                          ))}
                          {scaled.items.length > 3 && (
                            <p className="text-[10px] text-[#66736A] italic">
                              + {scaled.items.length - 3} more seasonings & aromatics
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedMealForRecipe(meal)}
                        className="w-full mt-2 py-2 px-3 bg-[#14532D] text-white text-xs font-bold rounded-xl hover:bg-[#0f3e22] text-center flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Full Recipe & Instructions
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
