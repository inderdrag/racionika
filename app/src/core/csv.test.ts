import { afterEach, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({
  food: [] as unknown[],
  water: [] as unknown[],
  weights: [] as unknown[],
}));
vi.mock('./db', () => {
  const table = (key: keyof typeof mocked) => ({
    where: () => ({ between: () => ({ toArray: async () => mocked[key] }) }),
  });
  return {
    db: {
      foodEntries: table('food'),
      waterLogs: table('water'),
      weightLogs: table('weights'),
      transaction: async (_mode: unknown, _tables: unknown, fn: () => unknown) => fn(),
    },
  };
});
import { csvCell, csvDocument, exportCsv } from './csv';
afterEach(() => {
  mocked.food = [];
  mocked.water = [];
  mocked.weights = [];
});
it('кавычки, переносы, BOM, CRLF и десятичная запятая для Excel', () => {
  expect(csvCell('Рис; "вкусный"\nужин')).toBe('"Рис; ""вкусный""\nужин"');
  expect(
    csvDocument([
      ['Дата', 'Вес'],
      ['2026-10-24', 80.5],
    ]),
  ).toBe('\uFEFF"Дата";"Вес"\r\n"2026-10-24";"80,5"\r\n');
});
it('не выполняет формулы из названий и заметок', () => {
  for (const value of ['=HYPERLINK("x")', ' +1', '\t@SUM(1)', '\ntext', '-5'])
    expect(csvCell(value)).toMatch(/^"'/);
  expect(csvCell(-5)).toBe('"-5"');
});
it('не превращает пропуски питания в нули, считает порции и последнюю запись веса', async () => {
  mocked.food = [
    {
      id: 'f',
      day: '2026-10-24',
      name: 'Рис',
      grams: 150,
      per100: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
    },
  ];
  mocked.water = [
    { day: '2026-10-25', ml: 250 },
    { day: '2026-10-25', ml: 500 },
  ];
  mocked.weights = [
    { day: '2026-10-24', kg: 80, createdAt: '2026-10-24T08:00:00Z' },
    { day: '2026-10-24', kg: 79.9, createdAt: '2026-10-24T09:00:00Z' },
  ];
  const text = await exportCsv('days', '2026-10-24', '2026-10-25');
  expect(text).toContain('"2026-10-24";"195";"4,05";"0,45";"42";"";"79,9"');
  expect(text).toContain('"2026-10-25";"";"";"";"";"750";""');
  expect(text).not.toContain('2026-10-26');
});
it('проверяет даты до чтения БД', async () => {
  await expect(exportCsv('days', '2026-02-30', '2026-03-01')).rejects.toThrow('даты');
  await expect(exportCsv('days', '2026-10-25', '2026-10-24')).rejects.toThrow('даты');
});
it('сохраняет категорию, заметку и отдельный отчёт веса', async () => {
  mocked.food = [
    {
      id: 'f',
      day: '2026-10-24',
      name: '=test',
      grams: 100,
      mealType: 'lunch',
      eatenTime: '12:30',
      note: '@bad',
      per100: { kcal: 100, protein: 0, fat: 0, carbs: 25 },
    },
  ];
  expect(await exportCsv('meals', '2026-10-24', '2026-10-24')).toContain(
    '"Обед";"12:30";"\'=test"',
  );
  expect(await exportCsv('meals', '2026-10-24', '2026-10-24')).toContain('"\'@bad"');
  mocked.weights = [{ day: '2026-10-24', kg: 80, createdAt: '2026-10-24T08:00:00Z' }];
  expect(await exportCsv('weights', '2026-10-24', '2026-10-24')).toContain('"Вес, кг"');
});
