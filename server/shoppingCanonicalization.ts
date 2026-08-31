// Shared shopping-list item canonicalization, deduplication and quantity-merge
// logic. Used by both meal-plan-generated items (server/db.ts) and the
// manual/PUT shopping-list path (server.ts) so that no matter how an item
// enters the list, it goes through the same normalization before being
// persisted. See supabase/migrations/0020_shopping_item_canonicalization.sql
// for the columns this module's output is stored in.

export type ShoppingCategory =
  | 'carbohydrates' | 'proteins' | 'vegetables' | 'fruits' | 'dairy' | 'spices_pantry'
  | 'household' | 'cleaning' | 'personal_care' | 'utilities' | 'other';

export interface CanonicalizedName {
  canonicalKey: string;
  canonicalName: string;
  variant?: string;
  isCompound: boolean;
}

export interface MergeableItem {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  estimatedPriceKsh: number;
  actualPriceKsh?: number | null;
  isPurchased: boolean;
  frequency?: 'weekly' | 'monthly';
  source?: 'generated' | 'manual';
  canonicalKey?: string;
  unitGroup?: string;
  variant?: string;
  isCompound?: boolean;
  quantityNote?: string;
  id?: string;
}

// ── Alias table ──────────────────────────────────────────────────────────────
// Maps a recognizable phrase (checked via substring containment against the
// normalized input) to a canonical ingredient id + display name. Order
// matters only in that longer/more-specific phrases should be listed so they
// are matched deliberately (see resolveSegment below, which picks the
// longest matching alias phrase rather than the first).
interface Alias { phrase: string; canonicalId: string; canonicalName: string }

const ALIASES: Alias[] = [
  // Staples
  { phrase: 'irish potato', canonicalId: 'irish_potatoes', canonicalName: 'Irish Potatoes' },
  { phrase: 'waru', canonicalId: 'irish_potatoes', canonicalName: 'Irish Potatoes' },
  { phrase: 'potato', canonicalId: 'irish_potatoes', canonicalName: 'Irish Potatoes' },
  { phrase: 'sweet potato', canonicalId: 'sweet_potatoes', canonicalName: 'Sweet Potatoes' },
  { phrase: 'ngwaci', canonicalId: 'sweet_potatoes', canonicalName: 'Sweet Potatoes' },
  { phrase: 'arrowroot', canonicalId: 'arrowroots', canonicalName: 'Arrowroots' },
  { phrase: 'nduma', canonicalId: 'arrowroots', canonicalName: 'Arrowroots' },
  { phrase: 'pishori', canonicalId: 'rice', canonicalName: 'Rice' },
  { phrase: 'sindano', canonicalId: 'rice', canonicalName: 'Rice' },
  { phrase: 'basmati', canonicalId: 'rice', canonicalName: 'Rice' },
  { phrase: 'mchele', canonicalId: 'rice', canonicalName: 'Rice' },
  { phrase: 'rice', canonicalId: 'rice', canonicalName: 'Rice' },
  { phrase: 'maize flour', canonicalId: 'maize_flour', canonicalName: 'Maize Flour' },
  { phrase: 'unga wa mahindi', canonicalId: 'maize_flour', canonicalName: 'Maize Flour' },
  { phrase: 'wheat flour', canonicalId: 'wheat_flour', canonicalName: 'Wheat Flour' },
  { phrase: 'unga wa ngano', canonicalId: 'wheat_flour', canonicalName: 'Wheat Flour' },
  { phrase: 'gram flour', canonicalId: 'gram_flour', canonicalName: 'Gram Flour' },
  { phrase: 'besan', canonicalId: 'gram_flour', canonicalName: 'Gram Flour' },
  { phrase: 'wimbi', canonicalId: 'wimbi_flour', canonicalName: 'Wimbi Flour' },
  { phrase: 'millet flour', canonicalId: 'wimbi_flour', canonicalName: 'Wimbi Flour' },
  { phrase: 'unga', canonicalId: 'maize_flour', canonicalName: 'Maize Flour' },
  { phrase: 'bread', canonicalId: 'bread', canonicalName: 'Bread' },
  { phrase: 'rolled oats', canonicalId: 'rolled_oats', canonicalName: 'Rolled Oats' },
  { phrase: 'oats', canonicalId: 'rolled_oats', canonicalName: 'Rolled Oats' },
  { phrase: 'matoke', canonicalId: 'matoke', canonicalName: 'Matoke' },
  { phrase: 'green banana', canonicalId: 'matoke', canonicalName: 'Matoke' },
  { phrase: 'cooking banana', canonicalId: 'matoke', canonicalName: 'Matoke' },
  { phrase: 'sweet banana', canonicalId: 'sweet_bananas', canonicalName: 'Sweet Bananas' },
  { phrase: 'ndizi mbivu', canonicalId: 'sweet_bananas', canonicalName: 'Sweet Bananas' },
  { phrase: 'banana', canonicalId: 'sweet_bananas', canonicalName: 'Sweet Bananas' },

  // Vegetables / greens — each traditional green stays its own canonical
  // ingredient (they are NOT interchangeable purchases), only spelling/name
  // variants of the SAME plant collapse together.
  { phrase: 'sukuma', canonicalId: 'sukuma_wiki', canonicalName: 'Sukuma Wiki' },
  { phrase: 'collard', canonicalId: 'sukuma_wiki', canonicalName: 'Sukuma Wiki' },
  { phrase: 'spinach', canonicalId: 'spinach', canonicalName: 'Spinach' },
  { phrase: 'cabbage', canonicalId: 'cabbage', canonicalName: 'Cabbage' },
  { phrase: 'kabeji', canonicalId: 'cabbage', canonicalName: 'Cabbage' },
  { phrase: 'managu', canonicalId: 'managu', canonicalName: 'Managu' },
  { phrase: 'african nightshade', canonicalId: 'managu', canonicalName: 'Managu' },
  { phrase: 'terere', canonicalId: 'terere', canonicalName: 'Terere' },
  { phrase: 'amaranth', canonicalId: 'terere', canonicalName: 'Terere' },
  { phrase: 'kunde', canonicalId: 'kunde', canonicalName: 'Kunde' },
  { phrase: 'cowpea leaves', canonicalId: 'kunde', canonicalName: 'Kunde' },
  { phrase: 'mrenda', canonicalId: 'mrenda', canonicalName: 'Mrenda' },
  { phrase: 'mrere', canonicalId: 'mrenda', canonicalName: 'Mrenda' },
  { phrase: 'jute mallow', canonicalId: 'mrenda', canonicalName: 'Mrenda' },
  { phrase: 'green pea', canonicalId: 'green_peas', canonicalName: 'Green Peas' },
  { phrase: 'minji', canonicalId: 'green_peas', canonicalName: 'Green Peas' },
  { phrase: 'carrot', canonicalId: 'carrots', canonicalName: 'Carrots' },
  { phrase: 'karoti', canonicalId: 'carrots', canonicalName: 'Carrots' },
  { phrase: 'tomato', canonicalId: 'tomatoes', canonicalName: 'Tomatoes' },
  { phrase: 'nyanya', canonicalId: 'tomatoes', canonicalName: 'Tomatoes' },
  { phrase: 'onion', canonicalId: 'onions', canonicalName: 'Onions' },
  { phrase: 'kitunguu maji', canonicalId: 'onions', canonicalName: 'Onions' },
  { phrase: 'dhania', canonicalId: 'dhania', canonicalName: 'Dhania' },
  { phrase: 'coriander', canonicalId: 'dhania', canonicalName: 'Dhania' },
  { phrase: 'cilantro', canonicalId: 'dhania', canonicalName: 'Dhania' },
  { phrase: 'bell pepper', canonicalId: 'bell_peppers', canonicalName: 'Bell Peppers' },
  { phrase: 'pilipili hoho', canonicalId: 'bell_peppers', canonicalName: 'Bell Peppers' },
  { phrase: 'capsicum', canonicalId: 'bell_peppers', canonicalName: 'Bell Peppers' },
  { phrase: 'ginger', canonicalId: 'garlic_ginger', canonicalName: 'Garlic & Ginger' },
  { phrase: 'garlic', canonicalId: 'garlic_ginger', canonicalName: 'Garlic & Ginger' },
  { phrase: 'tangawizi', canonicalId: 'garlic_ginger', canonicalName: 'Garlic & Ginger' },
  { phrase: 'maize cob', canonicalId: 'maize_cobs', canonicalName: 'Maize Cobs' },
  { phrase: 'green maize', canonicalId: 'maize_cobs', canonicalName: 'Maize Cobs' },

  // Fruits
  { phrase: 'avocado', canonicalId: 'avocado', canonicalName: 'Avocado' },
  { phrase: 'parachichi', canonicalId: 'avocado', canonicalName: 'Avocado' },
  { phrase: 'mango', canonicalId: 'mangoes', canonicalName: 'Mangoes' },
  { phrase: 'papaya', canonicalId: 'papaya', canonicalName: 'Papaya' },
  { phrase: 'pawpaw', canonicalId: 'papaya', canonicalName: 'Papaya' },
  { phrase: 'pineapple', canonicalId: 'pineapple', canonicalName: 'Pineapple' },
  { phrase: 'orange', canonicalId: 'oranges', canonicalName: 'Oranges' },
  { phrase: 'passion fruit', canonicalId: 'passion_fruit', canonicalName: 'Passion Fruit' },
  { phrase: 'lemon', canonicalId: 'lemon', canonicalName: 'Lemon' },
  { phrase: 'lime', canonicalId: 'lemon', canonicalName: 'Lemon' },

  // Proteins & legumes
  { phrase: 'beef', canonicalId: 'beef', canonicalName: 'Beef' },
  { phrase: "ng'ombe", canonicalId: 'beef', canonicalName: 'Beef' },
  { phrase: 'goat meat', canonicalId: 'goat_meat', canonicalName: 'Goat Meat' },
  { phrase: 'mbuzi', canonicalId: 'goat_meat', canonicalName: 'Goat Meat' },
  { phrase: 'chicken', canonicalId: 'chicken', canonicalName: 'Chicken' },
  { phrase: 'kuku', canonicalId: 'chicken', canonicalName: 'Chicken' },
  { phrase: 'omena', canonicalId: 'omena', canonicalName: 'Omena' },
  { phrase: 'tilapia', canonicalId: 'tilapia', canonicalName: 'Tilapia' },
  { phrase: 'egg', canonicalId: 'eggs', canonicalName: 'Eggs' },
  { phrase: 'mayai', canonicalId: 'eggs', canonicalName: 'Eggs' },
  { phrase: 'yellow bean', canonicalId: 'yellow_beans', canonicalName: 'Yellow Beans' },
  { phrase: 'maharage', canonicalId: 'yellow_beans', canonicalName: 'Yellow Beans' },
  { phrase: 'wairimu', canonicalId: 'yellow_beans', canonicalName: 'Yellow Beans' },
  { phrase: 'ndengu', canonicalId: 'ndengu', canonicalName: 'Ndengu' },
  { phrase: 'green gram', canonicalId: 'ndengu', canonicalName: 'Ndengu' },
  { phrase: 'mung bean', canonicalId: 'ndengu', canonicalName: 'Ndengu' },
  { phrase: 'kamande', canonicalId: 'kamande', canonicalName: 'Kamande' },
  { phrase: 'brown lentil', canonicalId: 'kamande', canonicalName: 'Kamande' },
  { phrase: 'lentil', canonicalId: 'kamande', canonicalName: 'Kamande' },
  { phrase: 'groundnut', canonicalId: 'groundnuts', canonicalName: 'Groundnuts' },
  { phrase: 'peanut', canonicalId: 'groundnuts', canonicalName: 'Groundnuts' },
  { phrase: 'njugu', canonicalId: 'groundnuts', canonicalName: 'Groundnuts' },

  // Dairy & pantry
  { phrase: 'fresh cow milk', canonicalId: 'milk', canonicalName: 'Milk' },
  { phrase: 'whole milk', canonicalId: 'milk', canonicalName: 'Milk' },
  { phrase: 'maziwa', canonicalId: 'milk', canonicalName: 'Milk' },
  { phrase: 'milk', canonicalId: 'milk', canonicalName: 'Milk' },
  { phrase: 'mala', canonicalId: 'mala', canonicalName: 'Mala' },
  { phrase: 'cooking oil', canonicalId: 'cooking_oil', canonicalName: 'Cooking Oil' },
  { phrase: 'vegetable oil', canonicalId: 'cooking_oil', canonicalName: 'Cooking Oil' },
  { phrase: 'mafuta', canonicalId: 'cooking_oil', canonicalName: 'Cooking Oil' },
  { phrase: 'tea leaves', canonicalId: 'tea_leaves', canonicalName: 'Tea Leaves' },
  { phrase: 'chai', canonicalId: 'tea_leaves', canonicalName: 'Tea Leaves' },
  { phrase: 'salt', canonicalId: 'salt', canonicalName: 'Salt' },
  { phrase: 'chumvi', canonicalId: 'salt', canonicalName: 'Salt' },
  { phrase: 'sugar', canonicalId: 'sugar', canonicalName: 'Sugar' },
  { phrase: 'sukari', canonicalId: 'sugar', canonicalName: 'Sugar' },
  { phrase: 'turmeric', canonicalId: 'turmeric', canonicalName: 'Turmeric' },
  { phrase: 'manjano', canonicalId: 'turmeric', canonicalName: 'Turmeric' },
  { phrase: 'royco', canonicalId: 'royco_seasoning', canonicalName: 'Royco Mchuzi Mix Seasoning' },
  { phrase: 'mchuzi mix', canonicalId: 'royco_seasoning', canonicalName: 'Royco Mchuzi Mix Seasoning' },
  { phrase: 'yeast', canonicalId: 'yeast_baking_powder', canonicalName: 'Yeast/Baking Powder' },
  { phrase: 'baking powder', canonicalId: 'yeast_baking_powder', canonicalName: 'Yeast/Baking Powder' },
  { phrase: 'cardamom', canonicalId: 'cardamom', canonicalName: 'Cardamom' },
  { phrase: 'honey', canonicalId: 'honey', canonicalName: 'Honey' },
  { phrase: 'chili', canonicalId: 'chili', canonicalName: 'Chili' },
  { phrase: 'pilipili', canonicalId: 'chili', canonicalName: 'Chili' },

  // Non-food: household / cleaning / personal care / utilities
  { phrase: 'toilet paper', canonicalId: 'toilet_paper', canonicalName: 'Toilet Paper' },
  { phrase: 'toilet tissue', canonicalId: 'toilet_paper', canonicalName: 'Toilet Paper' },
  { phrase: 'bathroom tissue', canonicalId: 'toilet_paper', canonicalName: 'Toilet Paper' },
  { phrase: 'tissue', canonicalId: 'tissue', canonicalName: 'Tissue' },
  { phrase: 'paper towel', canonicalId: 'paper_towels', canonicalName: 'Paper Towels' },
  { phrase: 'sanitary', canonicalId: 'sanitary_products', canonicalName: 'Sanitary Products' },
  { phrase: 'laundry detergent', canonicalId: 'laundry_detergent', canonicalName: 'Laundry Detergent' },
  { phrase: 'washing powder', canonicalId: 'laundry_detergent', canonicalName: 'Laundry Detergent' },
  { phrase: 'dishwashing liquid', canonicalId: 'dishwashing_liquid', canonicalName: 'Dishwashing Liquid' },
  { phrase: 'dish soap', canonicalId: 'dishwashing_liquid', canonicalName: 'Dishwashing Liquid' },
  { phrase: 'bar soap', canonicalId: 'soap', canonicalName: 'Soap' },
  { phrase: 'bathing soap', canonicalId: 'soap', canonicalName: 'Soap' },
  { phrase: 'soap', canonicalId: 'soap', canonicalName: 'Soap' },
  { phrase: 'toothpaste', canonicalId: 'toothpaste', canonicalName: 'Toothpaste' },
  { phrase: 'toothbrush', canonicalId: 'toothbrush', canonicalName: 'Toothbrush' },
  { phrase: 'cooking gas', canonicalId: 'cooking_gas', canonicalName: 'Cooking Gas' },
  { phrase: 'gas cylinder', canonicalId: 'cooking_gas', canonicalName: 'Cooking Gas' },
  { phrase: 'charcoal', canonicalId: 'charcoal', canonicalName: 'Charcoal' },
  { phrase: 'makaa', canonicalId: 'charcoal', canonicalName: 'Charcoal' },
  { phrase: 'match', canonicalId: 'matches', canonicalName: 'Matches' },
  { phrase: 'batter', canonicalId: 'batteries', canonicalName: 'Batteries' },
  { phrase: 'light bulb', canonicalId: 'light_bulbs', canonicalName: 'Light Bulbs' },
  { phrase: 'cleaning sponge', canonicalId: 'cleaning_sponge', canonicalName: 'Cleaning Sponge' },
  { phrase: 'sponge', canonicalId: 'cleaning_sponge', canonicalName: 'Cleaning Sponge' },
  { phrase: 'bleach', canonicalId: 'bleach', canonicalName: 'Bleach' },
  { phrase: 'floor cleaner', canonicalId: 'floor_cleaner', canonicalName: 'Floor Cleaner' },
  { phrase: 'water', canonicalId: 'water', canonicalName: 'Water' },
];

// Sorted longest-phrase-first so a specific match (e.g. "irish potato") wins
// over a broader one (e.g. "potato") when both are substrings.
const SORTED_ALIASES = [...ALIASES].sort((a, b) => b.phrase.length - a.phrase.length);

// Suffix/modifier words that indicate a genuinely different purchasable or
// prepared product, not a plain quantity of the base ingredient — e.g.
// "Irish Potatoes (fries)" must never merge with "Irish Potatoes".
const PREP_MODIFIERS = ['fries', 'fry', 'chips', 'crisps', 'fried', 'roasted', 'mash', 'mashed', 'wedges', 'boiled', 'baked', 'grilled', 'sauteed', 'sautéed'];

const JOINER_RE = /\s*(?:&|\/|,| and )\s*/i;

// Purely descriptive words that never name an ingredient on their own — a
// segment made up ONLY of these (e.g. "White" in "White / Pishori Rice")
// shouldn't block that string from being recognized as one ingredient named
// two ways. Deliberately NOT added as real aliases (that would risk
// mis-resolving unrelated items whose name merely contains the word).
const GENERIC_QUALIFIER_WORDS = new Set(['white', 'fresh', 'ripe', 'raw', 'whole', 'plain', 'pure', 'local', 'regular']);

function isPureQualifier(segment: string): boolean {
  const words = segment.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => GENERIC_QUALIFIER_WORDS.has(w));
}

function normalizeWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function stripParens(s: string): { base: string; paren?: string } {
  const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { base: normalizeWhitespace(m[1]), paren: normalizeWhitespace(m[2]) };
  return { base: normalizeWhitespace(s) };
}

function findAlias(text: string): Alias | undefined {
  const lower = text.toLowerCase();
  return SORTED_ALIASES.find((a) => lower.includes(a.phrase));
}

function hasPrepModifier(text: string): string | undefined {
  const lower = text.toLowerCase();
  return PREP_MODIFIERS.find((w) => lower.includes(w));
}

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Resolve a single (non-compound) segment against the alias table, honoring
 * the prep-modifier guard. Returns undefined if nothing recognizable matched
 * — the caller falls back to a literal-string canonical key in that case.
 */
function resolveSegment(segment: string): CanonicalizedName | undefined {
  const { base, paren } = stripParens(segment);
  const wholeText = `${base} ${paren ?? ''}`.trim();
  const prep = hasPrepModifier(wholeText);
  const alias = findAlias(base) || (paren ? findAlias(paren) : undefined);
  if (!alias) return undefined;

  if (prep) {
    // A recognized base ingredient, but a prepared/derived form of it —
    // keep it as its own distinct canonical entry rather than merging into
    // the raw ingredient (e.g. "Irish Potatoes (fries)" stays separate from
    // "Irish Potatoes").
    return {
      canonicalKey: `${alias.canonicalId}_${slugify(prep)}`,
      canonicalName: `${alias.canonicalName} (${toTitleCase(prep)})`,
      variant: prep,
      isCompound: false,
    };
  }

  // Variant = the matched alias phrase itself, but only worth surfacing as a
  // note when it's more specific than the canonical name already is.
  const variant = paren && paren.toLowerCase() !== alias.canonicalName.toLowerCase() ? paren
    : (alias.phrase.toLowerCase() !== alias.canonicalName.toLowerCase() && base.toLowerCase() !== alias.canonicalName.toLowerCase()) ? alias.phrase
    : undefined;

  return {
    canonicalKey: alias.canonicalId,
    canonicalName: alias.canonicalName,
    variant,
    isCompound: false,
  };
}

/**
 * Canonicalize a raw shopping-item name into a stable dedup key plus a clean
 * display name. Handles: case/whitespace/punctuation normalization, known
 * Kenyan-food alias resolution, prepared-form distinction (never collapses
 * "X (fries)" into "X"), and compound-ingredient detection (a joiner string
 * whose segments resolve to 2+ *different* canonical ingredients is treated
 * as its own stable compound key — it dedupes against identical compounds
 * but never against either ingredient alone).
 */
export function canonicalizeShoppingItemName(rawName: string): CanonicalizedName {
  const clean = normalizeWhitespace(rawName);
  if (!clean) {
    return { canonicalKey: 'unknown_item', canonicalName: 'Item', isCompound: false };
  }

  if (JOINER_RE.test(clean)) {
    const segments = clean.split(JOINER_RE).map((s) => s.trim()).filter(Boolean);
    if (segments.length > 1) {
      // Pure-qualifier segments (e.g. "White" in "White / Pishori Rice")
      // never count as a separate ingredient and never block a same-
      // ingredient merge — but they're also not "resolved," so they're
      // excluded from both the compound-membership and the
      // every-segment-resolved checks below.
      const meaningfulSegments = segments.filter((seg) => !isPureQualifier(seg));
      const resolved = meaningfulSegments.map((seg) => resolveSegment(seg));
      const resolvedOnly = resolved.filter((r): r is CanonicalizedName => !!r);
      const distinctCanonicalIds = new Set(resolvedOnly.map((r) => r.canonicalKey));

      if (distinctCanonicalIds.size >= 2) {
        // Genuine compound of 2+ different recognized ingredients — stable,
        // order-independent key so "Milk & Tea Leaves" and "Tea Leaves &
        // Milk" dedupe against each other but never against plain "Milk".
        const sortedIds = [...distinctCanonicalIds].sort();
        const displayNames = resolvedOnly
          .map((r) => r.canonicalName)
          .filter((name, i, arr) => arr.indexOf(name) === i);
        return {
          canonicalKey: `compound:${sortedIds.join('+')}`,
          canonicalName: displayNames.join(' & '),
          isCompound: true,
        };
      }
      if (distinctCanonicalIds.size === 1 && resolvedOnly.length === meaningfulSegments.length) {
        // Every non-qualifier segment resolved to the SAME canonical
        // ingredient — this is one ingredient named multiple ways (e.g.
        // "Sindano / Pishori Rice", "White / Pishori Rice"), not a compound
        // of different items.
        return resolvedOnly[0];
      }
      // Anything else (0 recognized, or a mix of 1 recognized + 1+
      // unrecognized segment, e.g. "Sweet Bananas & Kachumbari") is a
      // compound/prepared item that must stay distinct from any
      // single-ingredient group rather than being force-merged into one.
      return {
        canonicalKey: `literal:${slugify(clean)}`,
        canonicalName: toTitleCase(clean),
        isCompound: true,
      };
    }
  }

  const direct = resolveSegment(clean);
  if (direct) return direct;

  // Nothing recognized — still normalize for case/whitespace/punctuation so
  // exact repeats and trivial variants of an unknown item still dedupe.
  return {
    canonicalKey: `literal:${slugify(clean)}`,
    canonicalName: toTitleCase(clean),
    isCompound: false,
  };
}

// ── Units & quantity merging ─────────────────────────────────────────────────
const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', millilitre: 'ml', milliliter: 'ml', millilitres: 'ml', milliliters: 'ml',
  l: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l',
  piece: 'pieces', pieces: 'pieces', pcs: 'pieces', pc: 'pieces', unit: 'pieces', units: 'pieces',
};
const MASS_TO_G: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000 };

export function normalizeUnit(unit: string): string {
  const u = (unit || '').trim().toLowerCase();
  return UNIT_ALIASES[u] || u;
}

export function getUnitGroup(unit: string): string {
  const n = normalizeUnit(unit);
  if (n === 'g' || n === 'kg') return 'mass';
  if (n === 'ml' || n === 'l') return 'volume';
  if (n === 'pieces') return 'count';
  return `other:${n}`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Merge two quantities if — and only if — their units are genuinely
 * compatible. Returns null when they are not (e.g. "8 pieces" + "1 kg"),
 * in which case the caller must keep both quantities separately represented
 * rather than inventing a conversion. Never produces a mathematically false
 * merged quantity.
 */
export function mergeQuantity(
  aQty: number, aUnit: string, bQty: number, bUnit: string
): { quantity: number; unit: string } | null {
  const groupA = getUnitGroup(aUnit);
  const groupB = getUnitGroup(bUnit);
  if (groupA !== groupB) return null;

  if (groupA === 'mass') {
    const totalG = aQty * MASS_TO_G[normalizeUnit(aUnit)] + bQty * MASS_TO_G[normalizeUnit(bUnit)];
    return totalG >= 1000 ? { quantity: round3(totalG / 1000), unit: 'kg' } : { quantity: round3(totalG), unit: 'g' };
  }
  if (groupA === 'volume') {
    const totalMl = aQty * VOLUME_TO_ML[normalizeUnit(aUnit)] + bQty * VOLUME_TO_ML[normalizeUnit(bUnit)];
    return totalMl >= 1000 ? { quantity: round3(totalMl / 1000), unit: 'l' } : { quantity: round3(totalMl), unit: 'ml' };
  }
  if (groupA === 'count') {
    return { quantity: round3(aQty + bQty), unit: 'pieces' };
  }
  // "other:<unit>" groups only merge when the normalized unit literally
  // matches (already guaranteed by groupA === groupB for this branch).
  return { quantity: round3(aQty + bQty), unit: normalizeUnit(aUnit) };
}

// ── Category inference (food + non-food) ────────────────────────────────────
const NON_FOOD_CATEGORIES = new Set<ShoppingCategory>(['household', 'cleaning', 'personal_care', 'utilities', 'other']);
export function isNonFoodCategory(category: string): boolean {
  return NON_FOOD_CATEGORIES.has(category as ShoppingCategory);
}

/**
 * Infer a shopping category from a canonical/raw ingredient name. Mirrors
 * the food keyword set previously inlined in server/db.ts's
 * generateShoppingItemsFromMealPlan, extended with non-food categories.
 */
export function inferShoppingCategory(nameOrCanonicalKey: string): ShoppingCategory {
  const lower = nameOrCanonicalKey.toLowerCase();

  // Non-food first — these never collide with food keywords.
  if (/(toilet paper|toilet tissue|bathroom tissue|\btissue\b|paper towel|sanitary|batter|light bulb)/.test(lower)) return 'household';
  if (/(laundry detergent|washing powder|dishwashing|dish soap|\bsponge\b|bleach|floor cleaner)/.test(lower)) return 'cleaning';
  if (/(\bsoap\b|toothpaste|toothbrush)/.test(lower)) return 'personal_care';
  if (/(cooking gas|gas cylinder|charcoal|makaa|\bmatch\b|matches)/.test(lower)) return 'utilities';

  // Food
  if (lower.includes('flour') || lower.includes('rice') || lower.includes('potato') || lower.includes('matoke')
    || lower.includes('githeri') || lower.includes('oats') || lower.includes('bread') || lower.includes('nduma')
    || lower.includes('arrowroot')) return 'carbohydrates';
  if (lower.includes('bean') || lower.includes('beef') || lower.includes('chicken') || lower.includes('egg')
    || lower.includes('omena') || lower.includes('tilapia') || lower.includes('fish') || lower.includes('meat')
    || lower.includes('ndengu') || lower.includes('kamande') || lower.includes('lentil') || lower.includes('goat')) return 'proteins';
  if (lower.includes('banana') || lower.includes('mango') || lower.includes('avocado') || lower.includes('watermelon')
    || lower.includes('papaya') || lower.includes('pawpaw') || lower.includes('pineapple') || lower.includes('orange')
    || lower.includes('passion fruit') || lower.includes('lemon') || lower.includes('lime')) return 'fruits';
  if (lower.includes('milk') || lower.includes('mala') || lower.includes('yoghurt') || lower.includes('yogurt')) return 'dairy';
  if (lower.includes('oil') || lower.includes('salt') || lower.includes('royco') || lower.includes('spice')
    || lower.includes('curry') || lower.includes('tea') || lower.includes('sugar') || lower.includes('turmeric')
    || lower.includes('yeast') || lower.includes('baking powder') || lower.includes('cardamom') || lower.includes('honey')
    || lower.includes('chili') || lower.includes('groundnut') || lower.includes('peanut') || lower.includes('njugu')) return 'spices_pantry';

  return 'vegetables';
}

/**
 * Merge a flat list of shopping items into deduplicated rows keyed by
 * (canonicalKey, unitGroup). Compatible-unit quantities are summed safely;
 * incompatible-unit duplicates of the same ingredient are kept as separate
 * rows (never falsely converted) but annotated so the UI can explain why.
 * `isPurchased` is preserved as checked if ANY merged instance was checked.
 * A 'manual' source wins over 'generated' when merging so a user-entered
 * note/category is not silently discarded by a same-named generated item.
 */
export function mergeShoppingItems(items: MergeableItem[]): MergeableItem[] {
  const groups = new Map<string, MergeableItem[]>();
  const order: string[] = [];

  for (const raw of items) {
    const canon = canonicalizeShoppingItemName(raw.name);
    const unitGroup = getUnitGroup(raw.unit);
    const groupKey = `${canon.canonicalKey}::${unitGroup}`;
    if (!groups.has(groupKey)) { groups.set(groupKey, []); order.push(groupKey); }
    groups.get(groupKey)!.push({
      ...raw,
      canonicalKey: canon.canonicalKey,
      unitGroup,
      variant: canon.variant,
      isCompound: canon.isCompound,
      name: raw.name, // keep original casing for now; canonical name applied below
    });
  }

  const result: MergeableItem[] = [];
  for (const groupKey of order) {
    const groupItems = groups.get(groupKey)!;
    const canon = canonicalizeShoppingItemName(groupItems[0].name);
    let merged: MergeableItem = { ...groupItems[0] };
    merged.name = canon.canonicalName;
    merged.category = groupItems.find((i) => i.source === 'manual')?.category
      || groupItems[0].category
      || inferShoppingCategory(canon.canonicalKey);

    for (let i = 1; i < groupItems.length; i++) {
      const next = groupItems[i];
      const mergedQty = mergeQuantity(merged.quantity, merged.unit, next.quantity, next.unit);
      if (mergedQty) {
        merged.quantity = mergedQty.quantity;
        merged.unit = mergedQty.unit;
        merged.estimatedPriceKsh = Math.round((merged.estimatedPriceKsh || 0) + (next.estimatedPriceKsh || 0));
      } else {
        // Should not happen within a single groupKey (unitGroup already
        // matches), kept as a defensive fallback: never silently drop data.
        merged.quantityNote = [merged.quantityNote, `${next.quantity} ${next.unit}`].filter(Boolean).join('; ');
      }
      merged.isPurchased = merged.isPurchased || next.isPurchased;
      if (next.source === 'manual') merged.source = 'manual';
      if (next.actualPriceKsh != null) merged.actualPriceKsh = next.actualPriceKsh;
    }

    // Surface the variant as a human-readable note when there is one and
    // multiple distinct variants were merged together (e.g. "Pishori" +
    // "Sindano" both merging into "Rice").
    const variants = [...new Set(groupItems.map((i) => i.variant).filter(Boolean))];
    if (variants.length === 1) merged.variant = variants[0];
    else if (variants.length > 1) merged.variant = variants.join(' / ');
    else merged.variant = undefined;

    merged.isCompound = canon.isCompound;
    merged.canonicalKey = canon.canonicalKey;
    result.push(merged);
  }
  return result;
}
