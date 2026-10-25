import type { MealAnalysis } from './index.js';
export const RECOGNITION_REVISION = 3;
export function normalizedIngredientName(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
export interface MealReviewIssue {
  code: 'duplicate' | 'mass_range' | 'empty_mass';
  indexes: number[];
  message: string;
}
// Conservative checks only: never silently delete a repeated portion or guess recipe overlap.
export function reviewMealComposition(analysis: MealAnalysis): MealReviewIssue[] {
  if (!analysis.is_food) return [];
  const issues: MealReviewIssue[] = [];
  const seen = new Map<string, number>();
  analysis.ingredients.forEach((item, index) => {
    if (item.grams <= 0) return; // A user can exclude an ingredient by setting its mass to zero.
    const key = JSON.stringify([
      normalizedIngredientName(item.name),
      item.grams,
      ...(['kcal', 'protein', 'fat', 'carbs'] as const).map((k) => item.per_100g[k]),
    ]);
    const previous = seen.get(key);
    if (previous !== undefined)
      issues.push({
        code: 'duplicate',
        indexes: [previous, index],
        message: 'Возможный повтор продукта. Удалите лишнюю строку или уточните массу.',
      });
    else seen.set(key, index);
    if (item.grams < item.grams_range[0] - 0.1 || item.grams > item.grams_range[1] + 0.1)
      issues.push({
        code: 'mass_range',
        indexes: [index],
        message: 'Масса вне указанного ИИ диапазона. Уточните порцию.',
      });
  });
  if (!analysis.ingredients.some((item) => item.grams > 0))
    issues.push({
      code: 'empty_mass',
      indexes: [],
      message: 'Укажите массу хотя бы одного продукта.',
    });
  return issues;
}
export function clearGuessedAdditions(analysis: MealAnalysis): MealAnalysis {
  return {
    ...analysis,
    hidden_additions: { oil_g: 0, salt_g: 0, sugar_g: 0, sauce_kcal: 0, note: '' },
  };
}
