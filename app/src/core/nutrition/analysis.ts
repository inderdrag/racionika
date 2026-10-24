import { MealAnalysisSchema, type MealAnalysis, type Nutrients } from '@racionika/shared';
import { consistentNutrients, scaleNutrients } from './meal';
import type { FoodEntry } from '../db';
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
export function normalizeAnalysis(input: MealAnalysis) {
  const result = MealAnalysisSchema.parse(input);
  let corrected = false;
  result.ingredients = result.ingredients.map((item) => {
    const next = consistentNutrients(item.per_100g);
    corrected ||= next.corrected;
    return { ...item, per_100g: next.nutrients };
  });
  if (corrected)
    result.warnings = [
      ...result.warnings,
      'Калории части ингредиентов уточнены кодом по БЖУ (4·Б + 4·У + 9·Ж).',
    ].slice(-10);
  return result;
}
export function analysisTotals(analysis: MealAnalysis, level = 1, baseGrams?: number) {
  let grams = 0;
  const nutrients: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const ingredient of analysis.ingredients) {
    grams += ingredient.grams;
    const value = scaleNutrients(ingredient.per_100g, ingredient.grams);
    for (const key of ['kcal', 'protein', 'fat', 'carbs'] as const) nutrients[key] += value[key];
  }
  const ratio = baseGrams && baseGrams > 0 ? grams / baseGrams : 1;
  const multiplier = clamp(level, 1.5) * ratio;
  const hidden = analysis.hidden_additions;
  const base = baseGrams ?? grams;
  const oil = clamp(hidden.oil_g, Math.min(40, base * 0.15)) * multiplier;
  const sugar = clamp(hidden.sugar_g, Math.min(40, base * 0.2)) * multiplier;
  const sauce = clamp(hidden.sauce_kcal, Math.min(250, base)) * multiplier;
  const additionsKcal = oil * 9 + sugar * 4 + sauce;
  nutrients.kcal += additionsKcal;
  nutrients.fat += oil;
  nutrients.carbs += sugar;
  return { nutrients, grams, additionsKcal, sauceUnknown: sauce > 0 };
}
export function entryTotals(entry: FoodEntry) {
  return entry.analysis
    ? analysisTotals(entry.analysis, entry.additionsLevel ?? 1, entry.baseGrams).nutrients
    : scaleNutrients(entry.per100, entry.grams);
}
export function aggregatePer100(analysis: MealAnalysis, level: number, base: number) {
  const total = analysisTotals(analysis, level, base);
  const factor = total.grams > 0 ? 100 / total.grams : 0;
  return {
    grams: total.grams,
    per100: {
      kcal: total.nutrients.kcal * factor,
      protein: total.nutrients.protein * factor,
      fat: total.nutrients.fat * factor,
      carbs: total.nutrients.carbs * factor,
    },
  };
}
