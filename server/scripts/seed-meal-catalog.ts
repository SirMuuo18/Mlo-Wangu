// One-time, idempotent seed: loads the KENYAN_MEALS system catalog
// (src/data/kenyanFoodData.ts) into the Supabase `meals` table (owner_id
// NULL = system meal) so meal_plan_slots.meal_id (a real FK to meals(id))
// has something to reference. Without this, meal-plan generation/swap
// against Supabase has no system meals to pick from.
//
// Idempotent: matches existing system meals by name before inserting, so
// running this again is a safe no-op for anything already seeded. Never
// deletes or updates an existing row.
//
// Run with: npx tsx server/scripts/seed-meal-catalog.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { KENYAN_MEALS } from '../../src/data/kenyanFoodData.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: existingRows, error: existingErr } = await db
    .from('meals').select('id,name').is('owner_id', null);
  if (existingErr) throw new Error(`Failed to read existing system meals: ${existingErr.message}`);
  const existingByName = new Map((existingRows ?? []).map((r) => [r.name as string, r.id as string]));

  let inserted = 0, skipped = 0;
  for (const meal of KENYAN_MEALS) {
    if (existingByName.has(meal.name)) {
      skipped++;
      continue;
    }

    const { data: row, error } = await db.from('meals').insert({
      owner_id: null,
      name: meal.name,
      swahili_name: meal.swahiliName ?? null,
      category: meal.category,
      prep_time_minutes: meal.prepTimeMinutes,
      estimated_cost_ksh: meal.estimatedCostKsh,
      cost_level: meal.costLevel,
      description: meal.description,
      image_url: meal.imageUrl ?? null,
      servings: meal.servings,
      kenyan_cooking_tips: meal.kenyanCookingTips ?? null,
      is_custom: false,
      tags: meal.tags,
      nutrition_protein: meal.nutrition.proteinRich,
      nutrition_carb: meal.nutrition.carbRich,
      nutrition_veggie: meal.nutrition.veggieRich,
      nutrition_fruit: meal.nutrition.fruitIncluded,
      approx_calories: meal.nutrition.approxCalories,
    }).select('id').single();
    if (error || !row) {
      console.error(`Failed to insert "${meal.name}":`, error?.message);
      continue;
    }
    const mealId = row.id as string;

    if (meal.ingredients.length > 0) {
      const { error: ingErr } = await db.from('meal_ingredients').insert(
        meal.ingredients.map((ing, i) => ({
          meal_id: mealId, name: ing.name, quantity: ing.quantity, unit: ing.unit,
          estimated_cost_ksh: ing.estimatedCostKsh, sort_order: i,
        }))
      );
      if (ingErr) console.error(`Failed to insert ingredients for "${meal.name}":`, ingErr.message);
    }
    if (meal.instructions.length > 0) {
      const { error: stepErr } = await db.from('meal_instructions').insert(
        meal.instructions.map((step, i) => ({ meal_id: mealId, step, sort_order: i }))
      );
      if (stepErr) console.error(`Failed to insert instructions for "${meal.name}":`, stepErr.message);
    }

    inserted++;
  }

  console.log(`Seed complete: ${inserted} inserted, ${skipped} already present (skipped), ${KENYAN_MEALS.length} total in catalog.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
