import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Utensils,
  Calendar,
  Clock,
  Coins,
  RefreshCw,
  Eye,
  Search,
  CheckCircle2,
  ChefHat,
  Filter,
  Leaf,
  Flame,
  Plus,
} from 'lucide-react';
import { DayOfWeek, MealCategory, FoodCategory, Meal, FoodItem } from '../types';
import { getFoodImageUrl } from '../utils/foodImages';

export const MealsView: React.FC = () => {
  const {
    mealPlan,
    allMeals,
    foodItems,
    household,
    setSelectedMealForRecipe,
    setSelectedMealForSwap,
    attemptGeneratePlan,
    setActiveTab,
  } = useApp();

  const [activeTabSub, setActiveTabSub] = useState<'planner' | 'catalog' | 'food_db'>('planner');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Monday');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedCostFilter, setSelectedCostFilter] = useState<string>('all');
  const [selectedFoodCategory, setSelectedFoodCategory] = useState<string>('all');
  const [isGenerating, setIsGenerating] = useState(false);

  const daysList: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Generating a NEW plan is gated behind a KSh 50 payment or access code —
  // viewing the existing plan above is always free. This only checks
  // entitlement and either generates or opens the payment modal; the actual
  // authorization is enforced server-side regardless.
  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    try {
      await attemptGeneratePlan();
    } finally {
      setIsGenerating(false);
    }
  };

  // Filter meals catalog
  const filteredMeals = allMeals.filter((m) => {
    const q = (searchQuery || '').toLowerCase().trim();
    const name = (m?.name || '').toLowerCase();
    const swahili = (m?.swahiliName || '').toLowerCase();
    const tags = Array.isArray(m?.tags) ? m.tags : [];

    const matchesSearch =
      !q ||
      name.includes(q) ||
      swahili.includes(q) ||
      tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(q));

    const matchesCategory = selectedCategoryFilter === 'all' || m.category === selectedCategoryFilter;
    const matchesCost = selectedCostFilter === 'all' || m.costLevel === selectedCostFilter;

    return matchesSearch && matchesCategory && matchesCost;
  });

  // Filter food items database
  const filteredFoodItems = foodItems.filter((f) => {
    const q = (searchQuery || '').toLowerCase().trim();
    const name = (f?.name || '').toLowerCase();
    const swahili = (f?.swahiliName || '').toLowerCase();
    const region = (f?.region || '').toLowerCase();

    const matchesSearch =
      !q ||
      name.includes(q) ||
      swahili.includes(q) ||
      region.includes(q);

    const matchesCategory = selectedFoodCategory === 'all' || f.category === selectedFoodCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Header & Sub-Tab Switcher */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Utensils className="w-6 h-6 text-[#14532D]" />
              <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">Kenyan Family Meal Planner</h1>
            </div>
            <p className="text-xs text-[#66736A] mt-1">
              Customized for {household?.name || 'The Mwangi Family'} ({household?.members?.length || 5} members) with authentic Kenyan ingredients.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleGeneratePlan()}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#14532D] text-white text-xs font-bold hover:bg-[#0f3e22] transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Checking...' : 'Generate New Plan'}</span>
            </button>
          </div>
        </div>

        {/* Sub Navigation */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-[#F1EFE8] overflow-x-auto">
          <button
            onClick={() => setActiveTabSub('planner')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTabSub === 'planner'
                ? 'bg-[#14532D] text-white shadow-xs'
                : 'text-[#66736A] hover:bg-[#FAF8F2] hover:text-[#17201A]'
            }`}
          >
            Weekly Schedule
          </button>
          <button
            onClick={() => setActiveTabSub('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTabSub === 'catalog'
                ? 'bg-[#14532D] text-white shadow-xs'
                : 'text-[#66736A] hover:bg-[#FAF8F2] hover:text-[#17201A]'
            }`}
          >
            Recipe Catalog ({allMeals.length})
          </button>
          <button
            onClick={() => setActiveTabSub('food_db')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTabSub === 'food_db'
                ? 'bg-[#14532D] text-white shadow-xs'
                : 'text-[#66736A] hover:bg-[#FAF8F2] hover:text-[#17201A]'
            }`}
          >
            Kenyan Ingredient Prices ({foodItems.length})
          </button>
        </div>
      </div>

      {/* SUB-VIEW 1: WEEKLY SCHEDULE */}
      {activeTabSub === 'planner' && (
        <div className="space-y-6">
          {/* Day of Week Selector Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
            {daysList.map((day) => {
              const isSelected = selectedDay === day;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#14532D] text-white shadow-sm ring-2 ring-[#14532D]/20'
                      : 'bg-white text-[#66736A] border border-[#E8E5DD] hover:bg-[#FAF8F2] hover:text-[#17201A]'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Meals for Selected Day */}
          {mealPlan && mealPlan.days[selectedDay] ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as MealCategory[]).map((cat) => {
                const meal = (mealPlan.days[selectedDay] as any)[cat] as Meal | undefined;
                return (
                  <MealPlanSlotCard
                    key={cat}
                    category={cat}
                    day={selectedDay}
                    meal={meal}
                    onViewRecipe={() => meal && setSelectedMealForRecipe(meal)}
                    onSwap={() =>
                      meal && setSelectedMealForSwap({ day: selectedDay, mealType: cat, meal })
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="bg-white p-10 rounded-3xl border border-dashed border-[#E8E5DD] text-center">
              <Calendar className="w-12 h-12 text-[#66736A] mx-auto opacity-50" />
              <h3 className="text-base font-bold text-[#17201A] mt-3">Your week is waiting</h3>
              <p className="text-xs text-[#66736A] mt-1 max-w-md mx-auto">
                Create a healthy, budget-friendly Kenyan meal plan for your household.
              </p>
              <button
                onClick={() => handleGeneratePlan()}
                disabled={isGenerating}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#14532D] text-white text-xs font-bold hover:bg-[#0f3e22] disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? 'Checking...' : 'Create Meal Plan'}
              </button>
            </div>
          )}

          {/* Weekly Summary Overview Table */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
            <h3 className="text-sm font-extrabold text-[#17201A] mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#14532D]" />
              Full Week At A Glance
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E8E5DD] text-[#66736A]">
                    <th className="py-2.5 px-3 font-bold">Day</th>
                    <th className="py-2.5 px-3 font-bold">Breakfast</th>
                    <th className="py-2.5 px-3 font-bold">Lunch</th>
                    <th className="py-2.5 px-3 font-bold">Dinner</th>
                    <th className="py-2.5 px-3 font-bold">Snack</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1EFE8]">
                  {daysList.map((day) => {
                    const dayPlan = mealPlan?.days[day];
                    return (
                      <tr key={day} className="hover:bg-[#FAF8F2] transition-colors">
                        <td className="py-3 px-3 font-extrabold text-[#14532D] whitespace-nowrap">{day}</td>
                        <td className="py-3 px-3 text-[#17201A] font-medium">{dayPlan?.breakfast?.name || '-'}</td>
                        <td className="py-3 px-3 text-[#17201A] font-medium">{dayPlan?.lunch?.name || '-'}</td>
                        <td className="py-3 px-3 text-[#17201A] font-bold">{dayPlan?.dinner?.name || '-'}</td>
                        <td className="py-3 px-3 text-[#66736A]">{dayPlan?.snack?.name || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: RECIPE CATALOG */}
      {activeTabSub === 'catalog' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-[#E8E5DD] flex flex-col md:flex-row gap-3 items-center justify-between shadow-xs">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-[#66736A] absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search meal, swahili name, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14532D]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Meal Times</option>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>

              <select
                value={selectedCostFilter}
                onChange={(e) => setSelectedCostFilter(e.target.value)}
                className="px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Cost Tiers</option>
                <option value="budget">Budget Friendly (under KSh 200)</option>
                <option value="moderate">Moderate (KSh 200 - 500)</option>
                <option value="feast">Feast / Celebration (KSh 500+)</option>
              </select>
            </div>
          </div>

          {/* Meals Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMeals.map((meal) => {
              const dishImg = getFoodImageUrl(meal.name);
              return (
                <div
                  key={meal.id}
                  className="bg-white rounded-3xl border border-[#E8E5DD] shadow-xs flex flex-col justify-between hover:border-[#14532D] transition-all overflow-hidden"
                >
                  {/* Photo Thumbnail */}
                  <div className="relative h-32 w-full bg-neutral-800 overflow-hidden">
                    <img
                      src={dishImg}
                      alt={meal.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    <div className="absolute top-2.5 left-2.5">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs border border-white/20">
                        {meal.category}
                      </span>
                    </div>

                    <div className="absolute top-2.5 right-2.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          meal.costLevel === 'budget'
                            ? 'bg-green-600 text-white'
                            : meal.costLevel === 'moderate'
                            ? 'bg-amber-600 text-white'
                            : 'bg-purple-600 text-white'
                        }`}
                      >
                        {meal.costLevel === 'budget' ? 'Budget' : meal.costLevel === 'moderate' ? 'Moderate' : 'Feast'}
                      </span>
                    </div>

                    <div className="absolute bottom-2 left-2.5 right-2.5 text-white">
                      <h3 className="text-sm font-extrabold line-clamp-1">{meal.name}</h3>
                      {meal.swahiliName && (
                        <p className="text-[11px] text-[#F4B942] italic font-medium truncate">{meal.swahiliName}</p>
                      )}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <p className="text-xs text-[#66736A] line-clamp-2 leading-relaxed">{meal.description}</p>

                    {/* Nutrition & Time Badges */}
                    <div className="flex flex-wrap gap-2 text-[11px] text-[#66736A]">
                      <span className="flex items-center gap-1 font-semibold">
                        <Clock className="w-3 h-3 text-[#66736A]" />
                        {meal.prepTimeMinutes}m
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-[#D97706]">
                        <Coins className="w-3 h-3" />
                        Est. KSh {meal.estimatedCostKsh}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span>~{meal.nutrition.approxCalories} kcal</span>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1">
                      {meal.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[10px] bg-[#FAF8F2] px-2 py-0.5 rounded-md text-[#66736A]">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <button
                      onClick={() => setSelectedMealForRecipe(meal)}
                      className="w-full py-2 px-3 rounded-xl bg-[#14532D] text-white text-xs font-bold hover:bg-[#0f3e22] text-center transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Ingredients & Recipe
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: KENYAN FOOD & INGREDIENT DATABASE */}
      {activeTabSub === 'food_db' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-[#E8E5DD] flex flex-col sm:flex-row gap-3 items-center justify-between shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#66736A] absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search food item (e.g. Sukuma, Unga, Waru)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14532D]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              {['all', 'carbohydrates', 'proteins', 'vegetables', 'fruits', 'dairy', 'spices_pantry'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedFoodCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                    selectedFoodCategory === cat
                      ? 'bg-[#14532D] text-white'
                      : 'bg-[#FAF8F2] text-[#66736A] hover:bg-[#F1EFE8]'
                  }`}
                >
                  {cat.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredFoodItems.map((item) => {
              const itemImg = getFoodImageUrl(item.name, item.category);
              return (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-2xl border border-[#E8E5DD] shadow-xs flex flex-col justify-between hover:border-[#14532D] transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-[#14532D] uppercase bg-[#FAF8F2] px-2 py-0.5 rounded border border-[#E8E5DD]">
                        {item.category.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-mono font-bold">
                        Estimated
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-200 overflow-hidden shrink-0 border border-[#E8E5DD]">
                        <img
                          src={itemImg}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs font-extrabold text-[#17201A] truncate">{item.name}</h4>
                        {item.swahiliName && (
                          <p className="text-[11px] text-[#14532D] italic font-medium truncate">{item.swahiliName}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 p-2.5 bg-[#FAF8F2] rounded-xl border border-[#E8E5DD]">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-[#66736A] font-medium">{item.defaultUnit}</span>
                        <span className="text-sm font-extrabold text-[#14532D] tabular-nums">
                          KSh {item.estimatedPriceKsh}
                        </span>
                      </div>
                      {item.region && (
                        <p className="text-[10px] text-[#66736A] mt-1 truncate">Source: {item.region}</p>
                      )}
                    </div>
                  </div>

                  {item.proteinG !== undefined && (
                    <div className="mt-3 pt-2 border-t border-[#F1EFE8] flex items-center justify-between text-[10px] text-[#66736A]">
                      <span>Protein: {item.proteinG}g</span>
                      <span>Carbs: {item.carbsG}g</span>
                      <span>~{item.caloriesPerUnit} kcal</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const MealPlanSlotCard: React.FC<{
  category: MealCategory;
  day: DayOfWeek;
  meal?: Meal;
  onViewRecipe: () => void;
  onSwap: () => void;
}> = ({ category, day, meal, onViewRecipe, onSwap }) => {
  if (!meal) {
    return (
      <div className="bg-white p-5 rounded-3xl border border-dashed border-[#E8E5DD] flex flex-col justify-center items-center text-center min-h-[220px]">
        <span className="text-xs font-extrabold text-[#66736A] uppercase">{category}</span>
        <p className="text-xs text-[#9CA3AF] mt-2">No meal scheduled</p>
        <button
          onClick={onSwap}
          className="mt-3 px-3 py-1.5 bg-[#FAF8F2] hover:bg-[#F1EFE8] rounded-xl text-xs font-bold text-[#14532D]"
        >
          + Add Meal
        </button>
      </div>
    );
  }

  const mealImg = getFoodImageUrl(meal.name);

  return (
    <div className="bg-white rounded-3xl border border-[#E8E5DD] shadow-xs flex flex-col justify-between hover:border-[#14532D] transition-all min-h-[240px] overflow-hidden">
      {/* Thumbnail Header */}
      <div className="relative h-24 w-full bg-neutral-800 overflow-hidden">
        <img
          src={mealImg}
          alt={meal.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        <div className="absolute top-2 left-2">
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs border border-white/20">
            {category}
          </span>
        </div>

        <div className="absolute bottom-2 left-2 right-2 text-white">
          <h4 className="text-xs font-extrabold line-clamp-1 leading-snug">{meal.name}</h4>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
        {meal.swahiliName && (
          <p className="text-[11px] text-[#14532D] italic font-medium line-clamp-1">{meal.swahiliName}</p>
        )}

        <div className="flex items-center justify-between text-xs text-[#66736A]">
          <span className="flex items-center gap-1 font-medium">
            <Clock className="w-3 h-3" />
            {meal.prepTimeMinutes}m
          </span>
          <span className="flex items-center gap-1 font-bold text-[#D97706] tabular-nums">
            <Coins className="w-3 h-3" />
            KSh {meal.estimatedCostKsh}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {meal.nutrition.proteinRich && (
            <span className="text-[9px] bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
              Protein
            </span>
          )}
          {meal.nutrition.veggieRich && (
            <span className="text-[9px] bg-green-50 text-green-800 px-1.5 py-0.5 rounded font-bold">
              Greens
            </span>
          )}
          {meal.nutrition.carbRich && (
            <span className="text-[9px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded font-bold">
              Energy
            </span>
          )}
        </div>

        <div className="pt-2 border-t border-[#F1EFE8] flex items-center justify-between gap-2">
          <button
            onClick={onViewRecipe}
            className="flex-1 py-1.5 px-2 bg-[#FAF8F2] hover:bg-[#F1EFE8] text-[#17201A] rounded-xl text-xs font-bold text-center border border-[#E8E5DD] flex items-center justify-center gap-1 cursor-pointer"
          >
            <Eye className="w-3 h-3 text-[#14532D]" />
            Recipe
          </button>

          <button
            onClick={onSwap}
            title="Swap meal with intelligent Kenyan recommendations"
            className="py-1.5 px-2.5 bg-[#FAF8F2] hover:bg-[#F1EFE8] text-[#66736A] hover:text-[#17201A] rounded-xl text-xs font-bold border border-[#E8E5DD] flex items-center justify-center cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
