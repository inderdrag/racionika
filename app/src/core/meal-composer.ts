import { MealAnalysisSchema, type MealAnalysis } from '@racionika/shared';
import { type FoodEntry, localDay } from './db';
import { mealMetadata, validDiaryDay } from './diary';
import { aggregatePer100, withoutAutomaticAdditions } from './nutrition/analysis';

export type Ingredient = MealAnalysis['ingredients'][number];
export function ingredientEntry(
  item: Ingredient,
  source: FoodEntry['source'] = 'manual',
): FoodEntry {
  return {
    id: 'ingredient',
    day: localDay(),
    name: item.name,
    grams: item.grams,
    per100: item.per_100g,
    source,
    createdAt: new Date().toISOString(),
  };
}
export function ingredientsOf(entry: FoodEntry): Ingredient[] {
  return entry.analysis
    ? structuredClone(withoutAutomaticAdditions(entry.analysis).ingredients)
    : [
        {
          name: entry.name,
          grams: entry.grams,
          grams_range: [entry.grams, entry.grams],
          per_100g: { ...entry.per100 },
          confidence: 1,
        },
      ];
}
export function resizeIngredients(items: Ingredient[], grams: number): Ingredient[] {
  const mass = items.reduce((sum, p) => sum + p.grams, 0);
  if (!Number.isFinite(grams) || grams < 1 || grams > 5000 || mass <= 0)
    throw new Error('Масса: от 1 до 5000 г.');
  return items.map((p) => {
    const value = (p.grams * grams) / mass;
    return { ...p, grams: value, grams_range: [value, value] };
  });
}
export function appendIngredients(items: Ingredient[], extra: Ingredient[]): Ingredient[] {
  const output = structuredClone(items);
  for (const part of extra) {
    const same = output.find(
      (p) =>
        p.name.trim().toLowerCase() === part.name.trim().toLowerCase() &&
        (['kcal', 'protein', 'fat', 'carbs'] as const).every(
          (k) => p.per_100g[k] === part.per_100g[k],
        ),
    );
    if (same) {
      same.grams += part.grams;
      same.grams_range = [same.grams, same.grams];
    } else output.push(structuredClone(part));
  }
  if (
    output.length > 30 ||
    output.some((p) => p.grams > 5000) ||
    output.reduce((s, p) => s + p.grams, 0) > 5000
  )
    throw new Error('Не больше 30 продуктов и 5000 г в одной порции.');
  return output;
}
export function composeEntry(
  seed: FoodEntry,
  items: Ingredient[],
  name: string,
  day: string,
): FoodEntry {
  if (!validDiaryDay(day)) throw new Error('Выберите корректную дату.');
  const analysis = MealAnalysisSchema.parse({
    is_food: true,
    dish_name: name.trim(),
    confidence: Math.min(...items.map((p) => p.confidence)),
    cooking_method: seed.analysis?.cooking_method ?? '',
    ingredients: items,
    hidden_additions: { oil_g: 0, salt_g: 0, sugar_g: 0, sauce_kcal: 0, note: '' },
    clarifying_questions: [],
    warnings: seed.analysis?.warnings ?? [],
  });
  const total = aggregatePer100(analysis, 0, 0);
  if (!name.trim() || !items.length || total.grams < 1 || total.grams > 5000)
    throw new Error('Проверьте название и массу порции.');
  // A single reference product retains its exact nutrition/source when resized.
  const sameProduct =
    !seed.analysis &&
    name.trim() === seed.name &&
    items.length === 1 &&
    items[0].name === seed.name &&
    (['kcal', 'protein', 'fat', 'carbs'] as const).every(
      (k) => items[0].per_100g[k] === seed.per100[k],
    );
  return {
    ...mealMetadata(seed),
    id: seed.id,
    day,
    name: name.trim(),
    grams: total.grams,
    per100: sameProduct ? { ...seed.per100 } : total.per100,
    source:
      seed.source === 'demo'
        ? 'demo'
        : sameProduct
          ? seed.source
          : seed.source === 'ai'
            ? 'ai'
            : 'manual',
    catalogSource: sameProduct ? seed.catalogSource : undefined,
    ...(sameProduct ? {} : { analysis, baseGrams: total.grams, additionsLevel: 0 }),
    createdAt: seed.createdAt,
  };
}
