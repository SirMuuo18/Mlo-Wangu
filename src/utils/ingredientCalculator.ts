import { getFoodImageUrl } from './foodImages';

export interface ScaledIngredientDetail {
  rawName: string;
  normalizedName: string;
  category: 'meat' | 'greens' | 'flour_staple' | 'rice_grain' | 'legume' | 'tubers' | 'aromatics' | 'dairy_eggs' | 'oil_spices' | 'other';
  baseQuantityPerPerson: number; // in standard unit (kg, bunch, piece, litre)
  baseUnit: string;
  totalQuantity: number;
  displayQuantity: string;
  totalKgEstimate?: number;
  perServingText: string;
  marketBuyingGuide: string;
  estimatedCostKsh: number;
  imageUrl: string;
}

/**
 * Standard Kenyan per-person raw ingredient consumption benchmarks
 */
const KENYAN_PER_PERSON_PORTIONS: Record<string, {
  category: ScaledIngredientDetail['category'];
  qtyPerPerson: number;
  unit: string;
  kgPerUnit: number;
  pricePerUnitKsh: number;
  perServingLabel: string;
  buyingGuideTemplate: (total: number, kg?: number) => string;
}> = {
  beef: {
    category: 'meat',
    qtyPerPerson: 0.15, // 150g raw meat per adult
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 600, // ~KSh 600/kg
    perServingLabel: '150g per person',
    buyingGuideTemplate: (total) => `Buy ${total >= 1 ? `${total.toFixed(2)} kg` : `${Math.round(total * 1000)}g`} Beef at butchery`,
  },
  goat: {
    category: 'meat',
    qtyPerPerson: 0.16,
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 750,
    perServingLabel: '160g per person',
    buyingGuideTemplate: (total) => `Buy ${total.toFixed(2)} kg Goat (Mbuzi) at butchery`,
  },
  chicken: {
    category: 'meat',
    qtyPerPerson: 0.2,
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 650,
    perServingLabel: '200g per person',
    buyingGuideTemplate: (total) => `Buy ${total.toFixed(2)} kg Chicken (${Math.ceil(total / 1.2)} whole kuku)`,
  },
  omena: {
    category: 'meat',
    qtyPerPerson: 0.08,
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 450,
    perServingLabel: '80g per person',
    buyingGuideTemplate: (total) => `Buy ${Math.round(total * 1000)}g / ${Math.ceil(total * 4)} kasuku cups of Omena`,
  },
  fish: {
    category: 'meat',
    qtyPerPerson: 0.25,
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 500,
    perServingLabel: '1 piece (~250g) per person',
    buyingGuideTemplate: (total) => `Buy ${Math.ceil(total / 0.25)} fresh medium fish`,
  },
  sukuma: {
    category: 'greens',
    qtyPerPerson: 0.5, // Half a mama mboga bunch (~150g) per person
    unit: 'bunches',
    kgPerUnit: 0.3,
    pricePerUnitKsh: 20, // KSh 20 per fresh bunch
    perServingLabel: '½ bunch (~150g) per person',
    buyingGuideTemplate: (total, kg) => `Buy ${Math.ceil(total)} bunches Sukuma Wiki (~${kg?.toFixed(1)} kg)`,
  },
  spinach: {
    category: 'greens',
    qtyPerPerson: 0.5,
    unit: 'bunches',
    kgPerUnit: 0.3,
    pricePerUnitKsh: 20,
    perServingLabel: '½ bunch per person',
    buyingGuideTemplate: (total, kg) => `Buy ${Math.ceil(total)} bunches Spinach (~${kg?.toFixed(1)} kg)`,
  },
  cabbage: {
    category: 'greens',
    qtyPerPerson: 0.15,
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 60,
    perServingLabel: '150g shredded per person',
    buyingGuideTemplate: (total) => `Buy ${Math.max(1, Math.ceil(total / 1.2))} medium head(s) Cabbage (~${total.toFixed(2)} kg)`,
  },
  unga: {
    category: 'flour_staple',
    qtyPerPerson: 0.125, // 125g flour produces ~350g cooked ugali
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 70, // 2kg packet is ~KSh 140
    perServingLabel: '125g flour per person',
    buyingGuideTemplate: (total) => {
      const packets2kg = (total / 2).toFixed(1);
      return `Buy ${total.toFixed(2)} kg Maize Flour (~${packets2kg} of 2kg packet)`;
    },
  },
  wheat_flour: {
    category: 'flour_staple',
    qtyPerPerson: 0.12,
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 80,
    perServingLabel: '120g flour (2 chapatis) per person',
    buyingGuideTemplate: (total) => `Buy ${total.toFixed(2)} kg Unga ya Ngano`,
  },
  rice: {
    category: 'rice_grain',
    qtyPerPerson: 0.1, // 100g dry rice per person
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 180, // ~KSh 180-210/kg
    perServingLabel: '100g dry rice per person',
    buyingGuideTemplate: (total) => `Buy ${total.toFixed(2)} kg Rice (Mchele)`,
  },
  beans: {
    category: 'legume',
    qtyPerPerson: 0.125,
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 160,
    perServingLabel: '125g beans per person',
    buyingGuideTemplate: (total) => `Buy ${total.toFixed(2)} kg Beans (or ${Math.ceil(total / 0.5)} cups pre-boiled)`,
  },
  ndengu: {
    category: 'legume',
    qtyPerPerson: 0.11,
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 180,
    perServingLabel: '110g green grams per person',
    buyingGuideTemplate: (total) => `Buy ${total.toFixed(2)} kg Ndengu`,
  },
  potatoes: {
    category: 'tubers',
    qtyPerPerson: 0.2, // 200g potatoes per person
    unit: 'kg',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 90,
    perServingLabel: '200g (2 potatoes) per person',
    buyingGuideTemplate: (total) => `Buy ${total.toFixed(2)} kg Waru (Potatoes)`,
  },
  tomatoes: {
    category: 'aromatics',
    qtyPerPerson: 0.75, // 0.75 medium tomato per person
    unit: 'pieces',
    kgPerUnit: 0.08,
    pricePerUnitKsh: 12,
    perServingLabel: '¾ tomato (~60g) per person',
    buyingGuideTemplate: (total, kg) => `Buy ${Math.ceil(total)} fresh tomatoes (~${kg?.toFixed(2)} kg)`,
  },
  onions: {
    category: 'aromatics',
    qtyPerPerson: 0.5, // 0.5 onion per person
    unit: 'pieces',
    kgPerUnit: 0.09,
    pricePerUnitKsh: 10,
    perServingLabel: '½ onion per person',
    buyingGuideTemplate: (total) => `Buy ${Math.ceil(total)} red onions`,
  },
  eggs: {
    category: 'dairy_eggs',
    qtyPerPerson: 1.0,
    unit: 'eggs',
    kgPerUnit: 0.05,
    pricePerUnitKsh: 18,
    perServingLabel: '1 egg per person',
    buyingGuideTemplate: (total) => `Buy ${Math.ceil(total)} eggs`,
  },
  milk: {
    category: 'dairy_eggs',
    qtyPerPerson: 0.2, // 200ml per person
    unit: 'litres',
    kgPerUnit: 1.0,
    pricePerUnitKsh: 110,
    perServingLabel: '200ml per person',
    buyingGuideTemplate: (total) => `Buy ${total.toFixed(2)}L Milk (${Math.ceil(total / 0.5)} × 500ml packets)`,
  },
  cooking_oil: {
    category: 'oil_spices',
    qtyPerPerson: 0.02, // 20ml per person
    unit: 'litres',
    kgPerUnit: 0.9,
    pricePerUnitKsh: 280,
    perServingLabel: '20ml per person',
    buyingGuideTemplate: (total) => `Use ~${Math.round(total * 1000)}ml Cooking Oil`,
  },
};

/**
 * Calculates exact ingredient quantity and weight in kg based on portion count
 */
export function calculateIngredientForPortions(
  ingredientName: string,
  portions: number = 4,
  baseQuantity?: number,
  baseUnit?: string
): ScaledIngredientDetail {
  const count = Math.max(1, portions);
  const nameLower = (ingredientName || '').toLowerCase().trim();

  // Find matching profile
  let profileKey = 'unga';
  if (nameLower.includes('beef') || nameLower.includes('nyama') || (nameLower.includes('meat') && !nameLower.includes('wheat'))) profileKey = 'beef';
  else if (nameLower.includes('goat') || nameLower.includes('mbuzi')) profileKey = 'goat';
  else if (nameLower.includes('chicken') || nameLower.includes('kuku')) profileKey = 'chicken';
  else if (nameLower.includes('omena')) profileKey = 'omena';
  else if (nameLower.includes('fish') || nameLower.includes('tilapia')) profileKey = 'fish';
  else if (nameLower.includes('sukuma') || nameLower.includes('collard')) profileKey = 'sukuma';
  else if (nameLower.includes('spinach')) profileKey = 'spinach';
  else if (nameLower.includes('cabbage')) profileKey = 'cabbage';
  else if (nameLower.includes('wheat') || nameLower.includes('ngano') || nameLower.includes('chapati')) profileKey = 'wheat_flour';
  else if (nameLower.includes('unga') || nameLower.includes('ugali') || nameLower.includes('maize flour')) profileKey = 'unga';
  else if (nameLower.includes('rice') || nameLower.includes('mchele') || nameLower.includes('pilau')) profileKey = 'rice';
  else if (nameLower.includes('bean') || nameLower.includes('maharage') || nameLower.includes('githeri')) profileKey = 'beans';
  else if (nameLower.includes('ndengu') || nameLower.includes('gram')) profileKey = 'ndengu';
  else if (nameLower.includes('potato') || nameLower.includes('waru') || nameLower.includes('viazi')) profileKey = 'potatoes';
  else if (nameLower.includes('tomato') || nameLower.includes('nyanya')) profileKey = 'tomatoes';
  else if (nameLower.includes('onion') || nameLower.includes('kitunguu')) profileKey = 'onions';
  else if (nameLower.includes('egg') || nameLower.includes('mayai')) profileKey = 'eggs';
  else if (nameLower.includes('milk') || nameLower.includes('maziwa') || nameLower.includes('chai')) profileKey = 'milk';
  else if (nameLower.includes('oil') || nameLower.includes('mafuta')) profileKey = 'cooking_oil';

  const profile = KENYAN_PER_PERSON_PORTIONS[profileKey];

  if (profile) {
    const totalQty = profile.qtyPerPerson * count;
    const totalKg = totalQty * profile.kgPerUnit;
    const cost = Math.round(totalQty * profile.pricePerUnitKsh);
    const imageUrl = getFoodImageUrl(ingredientName);

    let displayQty = '';
    if (profile.unit === 'kg') {
      displayQty = totalQty >= 1 ? `${totalQty.toFixed(2)} kg` : `${Math.round(totalQty * 1000)} g`;
    } else if (profile.unit === 'bunches' || profile.unit === 'pieces' || profile.unit === 'eggs') {
      displayQty = `${Math.ceil(totalQty)} ${profile.unit}`;
    } else if (profile.unit === 'litres') {
      displayQty = totalQty >= 1 ? `${totalQty.toFixed(2)} L` : `${Math.round(totalQty * 1000)} ml`;
    } else {
      displayQty = `${totalQty.toFixed(2)} ${profile.unit}`;
    }

    return {
      rawName: ingredientName,
      normalizedName: ingredientName,
      category: profile.category,
      baseQuantityPerPerson: profile.qtyPerPerson,
      baseUnit: profile.unit,
      totalQuantity: totalQty,
      displayQuantity: displayQty,
      totalKgEstimate: totalKg,
      perServingText: profile.perServingLabel,
      marketBuyingGuide: profile.buyingGuideTemplate(totalQty, totalKg),
      estimatedCostKsh: cost,
      imageUrl,
    };
  }

  // Fallback linear scaling
  const baseQ = baseQuantity || 1;
  const scaledQty = (baseQ / 4) * count;
  return {
    rawName: ingredientName,
    normalizedName: ingredientName,
    category: 'other',
    baseQuantityPerPerson: baseQ / 4,
    baseUnit: baseUnit || 'portion',
    totalQuantity: scaledQty,
    displayQuantity: `${scaledQty.toFixed(1)} ${baseUnit || 'portion'}`,
    totalKgEstimate: undefined,
    perServingText: `${(baseQ / 4).toFixed(2)} per person`,
    marketBuyingGuide: `Buy ${scaledQty.toFixed(1)} ${baseUnit || 'portions'} for ${count} people`,
    estimatedCostKsh: Math.round(scaledQty * 25),
    imageUrl: getFoodImageUrl(ingredientName),
  };
}

/**
 * Calculates a full breakdown of all meal ingredients with accurate kg weights & portion multipliers
 */
export function scaleMealIngredientsAccurately(
  ingredients: { name?: string; foodItemName?: string; quantity?: number; unit?: string; estimatedCostKsh?: number }[],
  portions: number = 4
): {
  items: ScaledIngredientDetail[];
  totalEstimatedCostKsh: number;
  totalWeightKg: number;
  meatWeightKg: number;
  greensWeightKg: number;
  staplesWeightKg: number;
} {
  let totalCost = 0;
  let totalWeight = 0;
  let meatWeight = 0;
  let greensWeight = 0;
  let staplesWeight = 0;

  const items = (ingredients || []).map((ing) => {
    const name = ing.name || ing.foodItemName || 'Ingredient';
    const detail = calculateIngredientForPortions(name, portions, ing.quantity, ing.unit);

    totalCost += detail.estimatedCostKsh;
    if (detail.totalKgEstimate) {
      totalWeight += detail.totalKgEstimate;
      if (detail.category === 'meat') meatWeight += detail.totalKgEstimate;
      if (detail.category === 'greens') greensWeight += detail.totalKgEstimate;
      if (detail.category === 'flour_staple' || detail.category === 'rice_grain' || detail.category === 'tubers') {
        staplesWeight += detail.totalKgEstimate;
      }
    }

    return detail;
  });

  return {
    items,
    totalEstimatedCostKsh: totalCost,
    totalWeightKg: Number(totalWeight.toFixed(2)),
    meatWeightKg: Number(meatWeight.toFixed(2)),
    greensWeightKg: Number(greensWeight.toFixed(2)),
    staplesWeightKg: Number(staplesWeight.toFixed(2)),
  };
}
