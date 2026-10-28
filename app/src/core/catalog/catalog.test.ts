import manifest from '../../../../scripts/catalog/ru-manifest.json';
import { describe, expect, it } from 'vitest';
import { catalog, normalizeFoodQuery, searchCatalog } from './index';
import { CatalogProductSchema, CatalogSourceSchema, catalogSourceUrl } from './types';
import { parseBackup } from '../backup';
import { copyDish, dishKey } from '../diary';
import type { FoodEntry } from '../db';
import { scaleNutrients } from '../nutrition/meal';
const rice = catalog.find((p) => p.source.id === '168878')!;
describe('Локальный каталог USDA', () => {
  it('содержит больше 10000 разных записей с полными КБЖУ и источником', () => {
    expect(catalog).toHaveLength(manifest.totalCount);
    expect(catalog.length).toBeGreaterThanOrEqual(10000);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(catalog.length);
    expect(new Set(catalog.map((p) => p.name)).size).toBe(catalog.length);
    for (const p of catalog) {
      expect(CatalogProductSchema.safeParse(p).success).toBe(true);
      expect(['usda', 'off']).toContain(p.source.provider);
      expect(p.id).toBe((p.source.provider === 'usda' ? 'usda-' : 'off-') + p.source.id);
      expect(p.source.description.length).toBeGreaterThan(2);
      expect([
        'SR Legacy 2018-04',
        'FNDDS 2021–2023 (2024-10)',
        'Open Food Facts · российский рынок',
      ]).toContain(p.source.release);
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
    expect(
      searchCatalog('рис', 'Рыба и морепродукты', 'cooked').some((p) => p.id === rice.id),
    ).toBe(false);
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

it('сохраняет разные варианты и ищет продукты расширения по исходному ID и названию', () => {
  const expanded = catalog.find((p) => p.source.release.startsWith('FNDDS'))!;
  expect(expanded).toBeDefined();
  expect(searchCatalog(expanded.source.id).some((p) => p.id === expanded.id)).toBe(true);
  expect(searchCatalog(expanded.name).some((p) => p.id === expanded.id)).toBe(true);
  expect(catalogSourceUrl(expanded.source)).toContain(expanded.source.id);
  expect(searchCatalog('молоко').some((p) => p.source.release.startsWith('FNDDS'))).toBe(true);
});
it('нормализует синонимы и хранит результаты в ограниченном кеше без мутаций', () => {
  const first = searchCatalog('курица');
  expect(first.length).toBeGreaterThan(20);
  first.length = 0;
  expect(searchCatalog('курица').length).toBeGreaterThan(20);
  expect(searchCatalog('КУРИЦА')).toEqual(searchCatalog('курица'));
  expect(searchCatalog('rice cooked').some((p) => p.id === rice.id)).toBe(true);
  for (let i = 0; i < 40; i++) searchCatalog(String(i));
  expect(searchCatalog('гречка').some((p) => p.source.id === '170685')).toBe(true);
});

it('содержит продукты российского рынка с чистыми названиями и исходными КБЖУ', () => {
  const russian = catalog.filter((p) => p.source.provider === 'off');
  expect(russian).toHaveLength(manifest.count);
  expect(russian.every((p) => !/&(?:quot|amp|lt|gt);/.test(p.name))).toBe(true);
  for (const query of [
    'творог',
    'сметана',
    'гречка',
    'пельмени',
    'борщ',
    'сырники',
    'Простоквашино',
  ])
    expect(searchCatalog(query).some((p) => p.source.provider === 'off')).toBe(true);
  const product = catalog.find((p) => p.id === 'off-4600605027721')!;
  expect(product.name).toContain('Простоквашино');
  expect(product.per100.kcal).toBe(121);
  expect(catalogSourceUrl(product.source)).toBe(
    'https://world.openfoodfacts.org/product/4600605027721',
  );
});
