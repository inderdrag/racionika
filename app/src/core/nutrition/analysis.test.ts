import { describe, it, expect } from 'vitest';
import { analysisTotals, normalizeAnalysis } from './analysis';
import { DEMO_MEAL } from '../../../../server/src/providers/mock';
describe('КБЖУ и скрытые добавки', () => {
  it('считает порции в коде', () => {
    const result = analysisTotals(DEMO_MEAL);
    expect(result.nutrients.kcal).toBeCloseTo(526.5);
    expect(result.additionsKcal).toBe(45);
  });
  it('масса ×2 масштабирует и добавки ×2', () => {
    const food = structuredClone(DEMO_MEAL);
    food.ingredients = food.ingredients.map((i) => ({ ...i, grams: i.grams * 2 }));
    expect(analysisTotals(food, 1, 330).nutrients.kcal).toBeCloseTo(
      analysisTotals(DEMO_MEAL, 1, 330).nutrients.kcal * 2,
    );
  });
  it('можно отключить добавки', () => expect(analysisTotals(DEMO_MEAL, 0).additionsKcal).toBe(0));
  it('ограничивает неправдоподобное масло', () => {
    const food = structuredClone(DEMO_MEAL);
    food.hidden_additions.oil_g = 100;
    expect(analysisTotals(food).additionsKcal).toBe(360);
  });
  it('уточняет несогласованные калории', () => {
    const food = structuredClone(DEMO_MEAL);
    food.ingredients[0].per_100g.kcal = 900;
    expect(normalizeAnalysis(food).ingredients[0].per_100g.kcal).toBeCloseTo(156.4);
  });
  it('не выдумывает БЖУ неизвестного соуса', () => {
    const food = structuredClone(DEMO_MEAL);
    food.hidden_additions.sauce_kcal = 50;
    expect(analysisTotals(food).sauceUnknown).toBe(true);
    expect(analysisTotals(food).nutrients.carbs).toBe(analysisTotals(DEMO_MEAL).nutrients.carbs);
  });
});
describe('Проверка пищевых значений', () => {
  it('не принимает невозможную сумму БЖУ на100г', () => {
    const food = structuredClone(DEMO_MEAL);
    food.ingredients[0].per_100g = { kcal: 500, protein: 80, fat: 80, carbs: 80 };
    expect(() => normalizeAnalysis(food)).toThrow();
  });
});
