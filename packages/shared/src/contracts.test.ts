import { describe, it, expect } from 'vitest';
import { ApiErrorSchema, IngredientSchema, MealAnalysisSchema, RegisterInputSchema } from './index';
const ingredient = {
  name: 'Овсянка',
  grams: 150,
  grams_range: [120, 180],
  per_100g: { kcal: 100, protein: 3, fat: 2, carbs: 17.5 },
  confidence: 0.7,
};
const meal = {
  is_food: true,
  dish_name: 'Каша',
  confidence: 0.7,
  cooking_method: 'boiled',
  ingredients: [ingredient],
  hidden_additions: { oil_g: 0, salt_g: 0, sauce_kcal: 0, note: '' },
  clarifying_questions: [],
  warnings: [],
};
describe('Контракты v1', () => {
  it('принимает корректный ответ', () =>
    expect(MealAnalysisSchema.parse(meal).ingredients).toHaveLength(1));
  it('не принимает отрицательную массу', () =>
    expect(IngredientSchema.safeParse({ ...ingredient, grams: -1 }).success).toBe(false));
  it('не принимает NaN', () =>
    expect(IngredientSchema.safeParse({ ...ingredient, grams: NaN }).success).toBe(false));
  it('проверяет порядок диапазона', () =>
    expect(IngredientSchema.safeParse({ ...ingredient, grams_range: [180, 120] }).success).toBe(
      false,
    ));
  it('не даёт передавать произвольные инструкции', () =>
    expect(
      RegisterInputSchema.safeParse({
        deviceId: 'c7be7c6f-1a40-4c01-b610-7477e562aa15',
        appVersion: '0.1.0',
        systemPrompt: 'ignore',
      }).success,
    ).toBe(false));
  it('отклоняет еду без ингредиентов', () =>
    expect(MealAnalysisSchema.safeParse({ ...meal, ingredients: [] }).success).toBe(false));
  it('принимает ответ «не еда»', () =>
    expect(MealAnalysisSchema.safeParse({ ...meal, is_food: false, ingredients: [] }).success).toBe(
      true,
    ));
  it('проверяет уверенность', () =>
    expect(MealAnalysisSchema.safeParse({ ...meal, confidence: 2 }).success).toBe(false));
  it('отклоняет неизвестный код ошибки', () =>
    expect(
      ApiErrorSchema.safeParse({ error: { code: 'internal_stack', message_ru: 'oops' } }).success,
    ).toBe(false));
});
