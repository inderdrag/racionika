import { describe, it, expect } from 'vitest';
import {
  analysisTotals,
  withoutAutomaticAdditions,
  normalizeAnalysis,
  aggregatePer100,
  roundedComponentCalories,
} from './analysis';
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

describe('Простой состав и итоги', () => {
  it('включает масло и соль в массу блюда, а все калории — в строки', () => {
    const total = analysisTotals(DEMO_MEAL, 1, 330);
    expect(total.mealGrams).toBe(336);
    expect(total.components.reduce((sum, row) => sum + row.kcal, 0)).toBeCloseTo(
      total.nutrients.kcal,
    );
    expect(total.components.reduce((sum, row) => sum + (row.grams ?? 0), 0)).toBeCloseTo(
      total.mealGrams,
    );
    expect(roundedComponentCalories(total.components)).toEqual([248, 234, 45, 0]);
  });
  it('не придумывает массу соуса', () => {
    const food = structuredClone(DEMO_MEAL);
    food.hidden_additions.sauce_kcal = 50;
    const total = analysisTotals(food, 1, 330);
    expect(total.components.find((row) => row.name === 'Соус')).toMatchObject({
      grams: null,
      kcal: 50,
    });
    expect(total.sauceUnknown).toBe(true);
    expect(total.mealGrams).toBe(336);
  });
  it('сохранение общего веса не меняет калорийность', () => {
    const saved = aggregatePer100(DEMO_MEAL, 1, 330);
    expect(saved.grams).toBe(336);
    expect((saved.per100.kcal * saved.grams) / 100).toBeCloseTo(526.5);
  });
  it('без автодобавок масса состоит только из основных продуктов', () => {
    const total = analysisTotals(DEMO_MEAL, 0, 330);
    expect(total.components).toHaveLength(2);
    expect(total.mealGrams).toBe(330);
  });
  it('нулевая порция не оставляет скрытые калории и массу', () => {
    const food = structuredClone(DEMO_MEAL);
    food.ingredients = food.ingredients.map((row) => ({ ...row, grams: 0 }));
    const total = analysisTotals(food, 1, 330);
    expect(total.mealGrams).toBe(0);
    expect(total.nutrients.kcal).toBe(0);
  });
  it('округлённые строки всегда складываются в округлённый итог', () => {
    for (let count = 0; count < 40; count++) {
      const rows = Array.from({ length: count }, (_, index) => ({
        name: 'Тест',
        grams: 1,
        kcal: (index * 3.17 + count * 0.13) % 17,
      }));
      const display = roundedComponentCalories(rows);
      expect(display.reduce((sum, value) => sum + value, 0)).toBe(
        Math.round(rows.reduce((sum, row) => sum + row.kcal, 0)),
      );
      expect(display.every((value) => value >= 0)).toBe(true);
    }
  });
});

describe('Новые блюда без автоматических добавок', () => {
  it('обнуляет предполагаемые добавки, не меняя исходный ответ и реальные продукты', () => {
    const result = withoutAutomaticAdditions(DEMO_MEAL);
    const total = analysisTotals(result);
    expect(total.nutrients.kcal).toBeCloseTo(481.5);
    expect(total.mealGrams).toBe(330);
    expect(total.additionsKcal).toBe(0);
    expect(total.components).toHaveLength(2);
    expect(DEMO_MEAL.hidden_additions.oil_g).toBe(5);
  });
  it('явно указанный продукт масло остаётся в составе и калориях', () => {
    const input = structuredClone(DEMO_MEAL);
    input.ingredients.push({
      name: 'Масло на хлебе',
      grams: 5,
      grams_range: [5, 5],
      per_100g: { kcal: 900, protein: 0, fat: 100, carbs: 0 },
      confidence: 1,
    });
    const total = analysisTotals(withoutAutomaticAdditions(input));
    expect(total.components.at(-1)?.name).toBe('Масло на хлебе');
    expect(total.nutrients.kcal).toBeCloseTo(526.5);
    expect(total.mealGrams).toBe(335);
  });
  it('не считает скрытые соус, сахар и соль даже в старом ответе модели', () => {
    const input = structuredClone(DEMO_MEAL);
    input.hidden_additions.sauce_kcal = 100;
    input.hidden_additions.sugar_g = 20;
    input.hidden_additions.salt_g = 10;
    const total = analysisTotals(withoutAutomaticAdditions(input));
    expect(total.sauceUnknown).toBe(false);
    expect(total.mealGrams).toBe(330);
    expect(total.nutrients.kcal).toBeCloseTo(481.5);
  });
});
