import { expect, it } from 'vitest';
import { parseBackup } from './backup';
const base = {
  schemaVersion: 2,
  foodEntries: [
    {
      id: 'meal',
      day: '2026-10-24',
      name: 'Рис',
      grams: 100,
      per100: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
      createdAt: '2026-10-24T12:00:00Z',
    },
  ],
  waterLogs: [],
};
it('принимает старый JSON без профиля и веса', () => {
  const p = parseBackup(JSON.stringify(base));
  expect(p.foodEntries).toHaveLength(1);
  expect(p.weightLogs).toEqual([]);
});
it('отклоняет повреждённые данные и невозможную дату', () => {
  expect(() => parseBackup('broken')).toThrow();
  expect(() =>
    parseBackup(
      JSON.stringify({ ...base, foodEntries: [{ ...base.foodEntries[0], day: '2026-02-30' }] }),
    ),
  ).toThrow();
});
it('отклоняет отрицательную массу и неверное БЖУ', () => {
  expect(() =>
    parseBackup(JSON.stringify({ ...base, foodEntries: [{ ...base.foodEntries[0], grams: -1 }] })),
  ).toThrow();
  expect(() =>
    parseBackup(
      JSON.stringify({
        ...base,
        foodEntries: [
          { ...base.foodEntries[0], per100: { kcal: 900, protein: 100, fat: 100, carbs: 100 } },
        ],
      }),
    ),
  ).toThrow();
});
it('не принимает произвольный JSON и будущий формат молча', () => {
  expect(() => parseBackup('{}')).toThrow();
  expect(() => parseBackup(JSON.stringify({ ...base, schemaVersion: 999 }))).toThrow();
});
it('не импортирует секреты и согласие из неизвестных полей', () => {
  const p = parseBackup(JSON.stringify({ ...base, token: 'fixture', consent: 'v2' }));
  expect(p).not.toHaveProperty('token');
  expect(p).not.toHaveProperty('consent');
});
it('ограничивает размер до парсинга', () =>
  expect(() => parseBackup(' '.repeat(20 * 1024 * 1024 + 1))).toThrow('20 МБ'));
it('формат v4 сохраняет детали и избранное, старому JSON добавляет пустой список', () => {
  const entry = {
    ...base.foodEntries[0],
    mealType: 'breakfast',
    eatenTime: '08:15',
    note: 'Заметка',
  };
  const result = parseBackup(
    JSON.stringify({
      ...base,
      schemaVersion: 4,
      foodEntries: [entry],
      favoriteDishes: [{ id: 'fav', entry, createdAt: entry.createdAt }],
    }),
  );
  expect(result.foodEntries[0]).toMatchObject({
    mealType: 'breakfast',
    eatenTime: '08:15',
    note: 'Заметка',
  });
  expect(result.favoriteDishes[0].entry).toMatchObject(entry);
  expect(parseBackup(JSON.stringify(base)).favoriteDishes).toEqual([]);
});
it('не импортирует неверные детали приёма пищи', () => {
  for (const details of [{ eatenTime: '24:00' }, { mealType: 'wrong' }, { note: 'a'.repeat(1001) }])
    expect(() =>
      parseBackup(
        JSON.stringify({ ...base, foodEntries: [{ ...base.foodEntries[0], ...details }] }),
      ),
    ).toThrow();
});
