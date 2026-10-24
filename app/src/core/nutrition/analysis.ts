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
export interface MealComponent {
  name: string;
  grams: number | null;
  kcal: number;
  ingredientIndex?: number;
  additionKey?: 'oil_g' | 'sugar_g' | 'salt_g';
}
export function analysisTotals(analysis: MealAnalysis, level = 1, baseGrams?: number) {
  let grams = 0;
  const components: MealComponent[] = [];
  const nutrients: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const [index, ingredient] of analysis.ingredients.entries()) {
    grams += ingredient.grams;
    const value = scaleNutrients(ingredient.per_100g, ingredient.grams);
    components.push({
      name: ingredient.name,
      grams: ingredient.grams,
      kcal: value.kcal,
      ingredientIndex: index,
    });
    for (const key of ['kcal', 'protein', 'fat', 'carbs'] as const) nutrients[key] += value[key];
  }
  const ratio = baseGrams && baseGrams > 0 ? grams / baseGrams : 1;
  const multiplier = clamp(level, 1.5) * ratio;
  const hidden = analysis.hidden_additions;
  const base = baseGrams ?? grams;
  const oil = clamp(hidden.oil_g, Math.min(40, base * 0.15)) * multiplier;
  const sugar = clamp(hidden.sugar_g, Math.min(40, base * 0.2)) * multiplier;
  const sauce = clamp(hidden.sauce_kcal, Math.min(250, base)) * multiplier;
  const salt = clamp(hidden.salt_g, Math.min(20, base * 0.05)) * multiplier;
  for (const item of [
    { name: 'Масло', grams: oil, kcal: oil * 9, additionKey: 'oil_g' as const },
    { name: 'Сахар', grams: sugar, kcal: sugar * 4, additionKey: 'sugar_g' as const },
    { name: 'Соль', grams: salt, kcal: 0, additionKey: 'salt_g' as const },
  ])
    if (item.grams > 0) components.push(item);
  // Старый контракт знает только калории соуса, не его массу. Не выдумываем граммы.
  if (sauce > 0) components.push({ name: 'Соус', grams: null, kcal: sauce });
  const additionsKcal = oil * 9 + sugar * 4 + sauce;
  nutrients.kcal += additionsKcal;
  nutrients.fat += oil;
  nutrients.carbs += sugar;
  return {
    nutrients,
    grams,
    additionsKcal,
    sauceUnknown: sauce > 0,
    multiplier,
    components,
    mealGrams: grams + oil + sugar + salt,
  };
}
export function entryTotals(entry: FoodEntry) {
  return entry.analysis
    ? analysisTotals(entry.analysis, entry.additionsLevel ?? 1, entry.baseGrams).nutrients
    : scaleNutrients(entry.per100, entry.grams);
}
export function aggregatePer100(analysis: MealAnalysis, level: number, base: number) {
  const total = analysisTotals(analysis, level, base);
  const factor = total.mealGrams > 0 ? 100 / total.mealGrams : 0;
  return {
    grams: total.mealGrams,
    per100: {
      kcal: total.nutrients.kcal * factor,
      protein: total.nutrients.protein * factor,
      fat: total.nutrients.fat * factor,
      carbs: total.nutrients.carbs * factor,
    },
  };
}

// Целые ккал в строках складываются ровно в округлённый итог блюда.
export function roundedComponentCalories(components: MealComponent[]) {
  const values = components.map((item) => Math.floor(item.kcal));
  const target = Math.round(components.reduce((sum, item) => sum + item.kcal, 0));
  const remainder = target - values.reduce((sum, value) => sum + value, 0);
  const order = components
    .map((item, index) => ({ index, fraction: item.kcal - values[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remainder; i++) values[order[i].index]++;
  return values;
}
