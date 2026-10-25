import { expect, it } from 'vitest';
import type { FoodEntry } from './db';
import {
  copyDish,
  dishKey,
  localTime,
  mealMetadata,
  recentDishes,
  validDiaryDay,
  validateDetails,
} from './diary';
const entry: FoodEntry = {
  id: 'original',
  day: '2026-10-24',
  name: 'Рис',
  grams: 100,
  per100: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  createdAt: '2026-10-24T12:00:00Z',
  mealType: 'lunch',
  eatenTime: '13:00',
  note: 'Без соуса',
};
it('время еды локальное, не UTC', () =>
  expect(localTime(new Date(2026, 9, 24, 8, 5))).toBe('08:05'));
it('старым записям не выдумывает время или категорию', () =>
  expect(mealMetadata({ ...entry, mealType: undefined, eatenTime: undefined })).toMatchObject({
    mealType: undefined,
    eatenTime: undefined,
  }));
it('правка состава сохраняет метаданные', () =>
  expect(mealMetadata(entry)).toEqual({
    mealType: 'lunch',
    eatenTime: '13:00',
    note: 'Без соуса',
  }));
it('копия получает новый ID, дату и отдельные вложенные данные', () => {
  const copied = copyDish(entry, '2026-10-25', '08:10', 'breakfast', '  Заметка  ');
  expect(copied).toMatchObject({
    day: '2026-10-25',
    eatenTime: '08:10',
    mealType: 'breakfast',
    note: 'Заметка',
    grams: 100,
  });
  expect(copied.id).not.toBe(entry.id);
  copied.per100.kcal = 200;
  expect(entry.per100.kcal).toBe(130);
  expect(entry.day).toBe('2026-10-24');
});
it('пустые необязательные поля очищаются', () =>
  expect(copyDish(entry, entry.day, '', '', '')).toMatchObject({
    eatenTime: undefined,
    mealType: undefined,
    note: undefined,
  }));
it('отклоняет невозможные даты и неверный формат', () => {
  for (const day of ['2026-02-30', '2026-13-01', '2026-1-01', '0000-01-01'])
    expect(validDiaryDay(day)).toBe(false);
  expect(validDiaryDay('2028-02-29')).toBe(true);
});
it('проверяет время, категорию и длину заметки', () => {
  for (const args of [
    ['25:00', '', ''],
    ['12:60', '', ''],
    ['12:00', 'x'.repeat(1001), ''],
    ['12:00', '', 'invalid'],
  ])
    expect(() => validateDetails(entry.day, ...(args as [string, string, string]))).toThrow();
});
it('заметки и дата не создают дубли недавних блюд', () => {
  const newer = {
    ...entry,
    id: 'newer',
    day: '2026-10-25',
    note: 'Иная заметка',
    createdAt: '2026-10-25T12:00:00Z',
  };
  expect(dishKey(newer)).toBe(dishKey(entry));
  expect(recentDishes([entry, newer])).toEqual([newer]);
});
it('разные порции и рецепты не объединяет', () =>
  expect(recentDishes([entry, { ...entry, id: 'portion', grams: 200 }])).toHaveLength(2));
it('не изменяет исходный порядок массива и соблюдает лимит', () => {
  const values = [entry, { ...entry, id: '2', name: 'Гречка', createdAt: '2026-10-25T12:00:00Z' }];
  expect(recentDishes(values, 1)[0].id).toBe('2');
  expect(values[0].id).toBe('original');
});
