import { describe, expect, it } from 'vitest';
import { monthCells, shiftDay } from './calendar';
import { catalog, searchCatalog } from './catalog';
import { portionMeasures, portionGrams } from './catalog/portions';
import { productUsage, rankByUsage, shortForm } from './catalog/usage';
import type { FoodEntry } from './db';
const rice = catalog.find((p) => p.id === 'usda-168878')!;
function entry(grams: number, date: string): FoodEntry {
  return {
    id: date,
    day: date.slice(0, 10),
    name: rice.name,
    grams,
    per100: rice.per100,
    catalogSource: rice.source,
    source: 'label',
    createdAt: date,
  };
}
describe('Удобство дневника', () => {
  it('переходит через месяцы, високосный день и годы', () => {
    expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDay('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-29', 1)).toBe('2026-03-30');
    expect(monthCells('2024-02').filter(Boolean)).toHaveLength(29);
    expect(monthCells('2026-06')[0]).toBe('2026-06-01');
  });
  it('ищет опечатки, перестановку букв, сокращения и бренд без сети', () => {
    expect(searchCatalog('творк').some((p) => /творо/u.test(p.name.toLowerCase()))).toBe(true);
    expect(
      searchCatalog('гречка')
        .map((p) => p.id)
        .sort(),
    ).toEqual(
      searchCatalog('греч')
        .map((p) => p.id)
        .sort(),
    );
    expect(searchCatalog('творог prostokvashino').some((p) => p.id === 'off-4600605027721')).toBe(
      true,
    );
    expect(searchCatalog('банна').some((p) => /банан/i.test(p.name))).toBe(true);
    expect(searchCatalog('1234567890')).toHaveLength(0);
    expect(searchCatalog('несуществующийпродукт')).toHaveLength(0);
    expect(searchCatalog('творог 5%').every((p) => /5%/.test(p.name + p.source.description))).toBe(
      true,
    );
  });
  it('поднимает идентичный продукт из истории и не применяет порцию сам', () => {
    const usage = productUsage([
      entry(150, '2026-10-25T12:00:00Z'),
      entry(200, '2026-10-26T12:00:00Z'),
      { ...entry(999, '2026-10-27T12:00:00Z'), source: 'demo' },
    ]);
    expect(usage.get(rice.id)).toEqual({ count: 2, lastAt: '2026-10-26T12:00:00Z', grams: 200 });
    expect(rankByUsage(searchCatalog('рис'), usage)[0].id).toBe(rice.id);
    expect(shortForm(rice)).toBe('готовый');
  });
  it('не переносит меры на другой продукт, сохраняет исходный вес USDA', () => {
    const cup = portionMeasures(rice.source).find((p) => p.original === 'cup');
    expect(cup?.grams).toBe(158);
    expect(
      portionMeasures({
        provider: 'off',
        id: '4600605027721',
        description: 'test',
        release: 'test',
      }),
    ).toEqual([]);
    expect(portionGrams(1.5, 158)).toBe('237');
    expect(portionGrams(2, 160)).toBe('320');
    for (const value of [0, -1, NaN, Infinity]) expect(portionGrams(value, 50)).toBe('');
    expect(portionGrams(101, 50)).toBe('');
    const egg = catalog.find((p) => p.source.id === '171287');
    if (egg) expect(portionMeasures(egg.source).some((p) => p.grams === 50)).toBe(true);
  });
});
