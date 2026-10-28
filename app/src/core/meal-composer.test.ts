import { describe, expect, it } from 'vitest';
import type { FoodEntry } from './db';
import { appendIngredients, composeEntry, ingredientsOf, resizeIngredients } from './meal-composer';
import { favoriteKey, uniqueFavorites } from './favorites';
import { entryTotals } from './nutrition/analysis';
const rice: FoodEntry = {
  id: 'rice',
  name: 'Рис',
  day: '2026-10-24',
  grams: 100,
  per100: { kcal: 130, protein: 2.69, fat: 0.28, carbs: 28.17 },
  source: 'label',
  catalogSource: {
    provider: 'usda',
    id: '168878',
    description: 'Rice, cooked',
    release: 'SR Legacy',
  },
  createdAt: '2026-10-24T12:00:00Z',
};
const chicken: FoodEntry = {
  ...rice,
  id: 'chicken',
  name: 'Курица',
  per100: { kcal: 165, protein: 31, fat: 3.6, carbs: 0 },
  catalogSource: undefined,
};
describe('portion composer', () => {
  it('resizes a reference product without rounding nutrition or losing its source', () => {
    const result = composeEntry(
      rice,
      resizeIngredients(ingredientsOf(rice), 150),
      rice.name,
      rice.day,
    );
    expect(result.grams).toBe(150);
    expect(entryTotals(result).kcal).toBe(195);
    expect(result.per100).toEqual(rice.per100);
    expect(result.catalogSource).toEqual(rice.catalogSource);
    expect(result.analysis).toBeUndefined();
    expect(rice.grams).toBe(100);
  });
  it('combines products once, preserves calories and does not falsely attribute a mixed recipe', () => {
    const parts = appendIngredients(ingredientsOf(rice), ingredientsOf(chicken));
    const result = composeEntry(rice, parts, 'Обед', rice.day);
    expect(result.grams).toBe(200);
    expect(entryTotals(result).kcal).toBeCloseTo(295);
    expect(result.analysis?.ingredients).toHaveLength(2);
    expect(result.catalogSource).toBeUndefined();
    expect(result.analysis?.hidden_additions.oil_g).toBe(0);
    const double = composeEntry(result, resizeIngredients(parts, 400), result.name, rice.day);
    expect(entryTotals(double).kcal).toBeCloseTo(590);
    expect(parts[0].grams).toBe(100);
  });
  it('merges exactly repeated products instead of double rows', () => {
    const items = ingredientsOf(rice),
      next = appendIngredients(items, ingredientsOf({ ...rice, grams: 50 }));
    expect(next).toHaveLength(1);
    expect(next[0].grams).toBe(150);
    expect(items[0].grams).toBe(100);
  });
  it('does not merge raw and cooked variants', () => {
    expect(
      appendIngredients(
        ingredientsOf(rice),
        ingredientsOf({ ...rice, per100: { ...rice.per100, kcal: 350 } }),
      ),
    ).toHaveLength(2);
  });
  it.each([0, -1, 0.5, 5001, NaN, Infinity])('rejects invalid portion %s', (mass) =>
    expect(() => resizeIngredients(ingredientsOf(rice), mass)).toThrow(),
  );
  it('limits recipe size and validates the diary day', () => {
    expect(() =>
      appendIngredients(ingredientsOf({ ...rice, grams: 5000 }), ingredientsOf(chicken)),
    ).toThrow();
    expect(() => composeEntry(rice, ingredientsOf(rice), 'Рис', '2026-02-31')).toThrow();
    expect(() => composeEntry(rice, [], 'Рис', rice.day)).toThrow();
  });
  it('does not turn demo into real food or keep source after renaming', () => {
    expect(
      composeEntry({ ...rice, source: 'demo' }, ingredientsOf(rice), rice.name, rice.day).source,
    ).toBe('demo');
    expect(
      composeEntry(rice, ingredientsOf(rice), 'Другое блюдо', rice.day).catalogSource,
    ).toBeUndefined();
  });
});
describe('favorite identity', () => {
  it('ignores portion, date, notes and category', () => {
    expect(favoriteKey(rice)).toBe(
      favoriteKey({ ...rice, grams: 250, day: '2026-11-01', mealType: 'snack', note: 'test' }),
    );
  });
  it('separates different nutrition and demo', () => {
    expect(favoriteKey(rice)).not.toBe(favoriteKey({ ...rice, source: 'demo' }));
    expect(favoriteKey(rice)).not.toBe(
      favoriteKey({ ...rice, per100: { ...rice.per100, kcal: 350 } }),
    );
  });
  it('keeps recipe identity through proportional scaling and separates changed proportions', () => {
    const parts = appendIngredients(ingredientsOf(rice), ingredientsOf(chicken));
    const meal = composeEntry(rice, parts, 'Обед', rice.day);
    expect(favoriteKey(meal)).toBe(
      favoriteKey(composeEntry(meal, resizeIngredients(parts, 300), 'Обед', rice.day)),
    );
    expect(favoriteKey(meal)).not.toBe(
      favoriteKey(composeEntry(meal, [parts[0], { ...parts[1], grams: 200 }], 'Обед', rice.day)),
    );
  });
  it('deduplicates existing portion variants without mutating stored records', () => {
    const old = [
      { id: 'a', entry: rice, createdAt: rice.createdAt },
      { id: 'b', entry: { ...rice, grams: 200 }, createdAt: rice.createdAt },
    ];
    expect(uniqueFavorites(old)).toHaveLength(1);
    expect(old).toHaveLength(2);
  });
});
