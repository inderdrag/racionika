import { NutrientsSchema, type Nutrients } from '@racionika/shared';
// Единственный путь пересчёта ручной записи: значения на 100 г × масса.
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  NutrientsSchema.parse(per100);
  if (!Number.isFinite(grams) || grams < 0 || grams > 5000) throw new Error('Недопустимая масса');
  return {
    kcal: (per100.kcal * grams) / 100,
    protein: (per100.protein * grams) / 100,
    fat: (per100.fat * grams) / 100,
    carbs: (per100.carbs * grams) / 100,
  };
}
export function consistentNutrients(input: Nutrients): {
  nutrients: Nutrients;
  corrected: boolean;
} {
  const nutrients = NutrientsSchema.parse(input);
  const computed = 4 * nutrients.protein + 4 * nutrients.carbs + 9 * nutrients.fat;
  const corrected = Math.abs(nutrients.kcal - computed) / Math.max(computed, 1) > 0.15;
  return { nutrients: { ...nutrients, kcal: corrected ? computed : nutrients.kcal }, corrected };
}
