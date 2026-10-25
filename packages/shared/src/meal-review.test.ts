import { describe, expect, it } from 'vitest';
import { reviewMealComposition, clearGuessedAdditions } from './meal-review';
import { MealAnalysisSchema } from './index';
import { DEMO_MEAL } from '../../../server/src/providers/mock';
describe('Структура распознанной порции', () => {
  it('принимает обычный состав и не мутирует исходник', () => {
    expect(reviewMealComposition(DEMO_MEAL)).toEqual([]);
    expect(clearGuessedAdditions(DEMO_MEAL).hidden_additions.oil_g).toBe(0);
    expect(DEMO_MEAL.hidden_additions.oil_g).toBe(5);
  });
  it('находит точный повтор порции с разным регистром/пунктуацией', () => {
    const a = structuredClone(DEMO_MEAL);
    const row = a.ingredients[0];
    a.ingredients.push({ ...row, name: row.name.toUpperCase().replaceAll(',', ' ') });
    expect(reviewMealComposition(a)).toMatchObject([{ code: 'duplicate', indexes: [0, 2] }]);
  });
  it('не удаляет одинаково названные отдельные порции и не угадывает синонимы', () => {
    const a = structuredClone(DEMO_MEAL);
    a.ingredients.push({ ...a.ingredients[0], grams: 30, grams_range: [30, 30] });
    expect(reviewMealComposition(a)).toEqual([]);
    expect(a.ingredients).toHaveLength(3);
  });
  it('масса должна входить в диапазон модели', () => {
    const a = structuredClone(DEMO_MEAL);
    a.ingredients[0].grams_range = [10, 20];
    expect(reviewMealComposition(a)[0].code).toBe('mass_range');
  });
  it('не даёт сохранить еду без массы; не еда допускает пустой состав', () => {
    const a = structuredClone(DEMO_MEAL);
    a.ingredients.forEach((i) => (i.grams = 0));
    expect(reviewMealComposition(a)[0].code).toBe('empty_mass');
    expect(reviewMealComposition({ ...a, is_food: false, ingredients: [] })).toEqual([]);
  });
  it('сохраняет совместимость контракта со старыми резервными копиями', () => {
    expect(MealAnalysisSchema.safeParse(DEMO_MEAL).success).toBe(true);
    expect(MealAnalysisSchema.safeParse(clearGuessedAdditions(DEMO_MEAL)).success).toBe(true);
  });
});
