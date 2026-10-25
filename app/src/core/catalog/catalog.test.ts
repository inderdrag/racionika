import { describe, expect, it } from 'vitest';
import { catalog, normalizeFoodQuery, searchCatalog } from './index';
import { CatalogProductSchema, CatalogSourceSchema, catalogSourceUrl } from './types';
import { parseBackup } from '../backup';
import { copyDish, dishKey } from '../diary';
import type { FoodEntry } from '../db';
import { scaleNutrients } from '../nutrition/meal';
const rice = catalog.find((p) => p.source.id === '168878')!;
describe('Локальный каталог USDA', () => {
  it('содержит 400–600 различных записей с полными КБЖУ и источником', () => {
    expect(catalog).toHaveLength(505);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(catalog.length);
    expect(new Set(catalog.map((p) => p.name)).size).toBe(catalog.length);
    for (const p of catalog) {
      expect(CatalogProductSchema.safeParse(p).success).toBe(true);
      expect(p.source.provider).toBe('usda');
      expect(p.id).toBe('usda-' + p.source.id);
      expect(p.source.description.length).toBeGreaterThan(2);
      expect(p.source.release).toBe('SR Legacy 2018-04');
    }
  });
  it('не подменяет сырую крупу готовой: разные записи, массы и калорийность', () => {
    const dry = catalog.find((p) => p.source.id === '168877')!;
    expect(dry.form).toBe('raw');
    expect(dry.per100.kcal).toBe(365);
    expect(rice.form).toBe('cooked');
    expect(rice.per100.kcal).toBe(130);
    expect(scaleNutrients(rice.per100, 150).kcal).toBe(195);
    expect(catalog.find((p) => p.source.id === '170685')!.form).toBe('dry');
    expect(catalog.find((p) => p.source.id === '170686')!.form).toBe('cooked');
  });
  it('хранит оригинальную энергию, не переписывает её формулой 4/4/9', () => {
    const product = catalog.find((p) => p.source.id === '170567')!; // almonds, USDA-specific energy
    expect(product.per100.kcal).toBe(579);
    expect(product.per100.kcal).not.toBe(
      product.per100.protein * 4 + product.per100.fat * 9 + product.per100.carbs * 4,
    );
  });
  it('ищет на русском и английском, игнорирует ё/е и поддерживает бытовые названия', () => {
    expect(normalizeFoodQuery('  ГРЕЧКА, Ёж! ')).toBe('гречка еж');
    expect(searchCatalog('гречка').some((p) => p.source.id === '170685')).toBe(true);
    expect(searchCatalog('овсянка').some((p) => p.source.id === '173905')).toBe(true);
    expect(searchCatalog('помидор').length).toBeGreaterThan(0);
    expect(searchCatalog('курица').some((p) => p.source.id === '171477')).toBe(true);
    expect(searchCatalog('rice cooked').some((p) => p.id === rice.id)).toBe(true);
    expect(searchCatalog('несуществующийпродукт')).toEqual([]);
  });
  it('фильтрует категории и состояние без вывода сырого вместо приготовленного', () => {
    const result = searchCatalog('рис', 'Крупы и макароны', 'cooked');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.form === 'cooked')).toBe(true);
    expect(searchCatalog('рис', 'Рыба и морепродукты', 'cooked')).toEqual([]);
  });
  it('URL источника строится из валидного ID, не из пользовательской ссылки', () => {
    expect(catalogSourceUrl(rice.source)).toBe(
      'https://fdc.nal.usda.gov/food-details/168878/nutrients',
    );
    expect(() =>
      CatalogSourceSchema.parse({ ...rice.source, id: 'javascript:alert(1)' }),
    ).toThrow();
  });
  it('источник сохраняется в резервной копии, копии и избранном', () => {
    const entry: FoodEntry = {
      id: 'reference',
      day: '2026-10-25',
      name: rice.name,
      grams: 150,
      per100: rice.per100,
      catalogSource: rice.source,
      source: 'label',
      createdAt: '2026-10-25T12:00:00Z',
    };
    const data = parseBackup(
      JSON.stringify({
        schemaVersion: 4,
        foodEntries: [entry],
        waterLogs: [],
        favoriteDishes: [{ id: 'favorite', entry, createdAt: entry.createdAt }],
      }),
    );
    expect(data.foodEntries[0].catalogSource).toEqual(rice.source);
    expect(data.favoriteDishes[0].entry.catalogSource).toEqual(rice.source);
    expect(copyDish(entry, '2026-10-26', '08:00', 'breakfast', '').catalogSource).toEqual(
      rice.source,
    );
    expect(dishKey(entry)).not.toBe(dishKey({ ...entry, catalogSource: undefined }));
  });
});
