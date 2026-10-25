import type { FoodEntry, MealType } from './db';
export const mealTypes: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Завтрак' },
  { value: 'lunch', label: 'Обед' },
  { value: 'dinner', label: 'Ужин' },
  { value: 'snack', label: 'Перекус' },
];
export function localTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function mealMetadata(entry?: FoodEntry) {
  if (entry) return { mealType: entry.mealType, eatenTime: entry.eatenTime, note: entry.note };
  // Time is local wall-clock time, separate from the diary's selected calendar date.
  return { eatenTime: localTime() };
}
export function dishKey(entry: FoodEntry) {
  return JSON.stringify({
    name: entry.name.trim().toLocaleLowerCase('ru-RU'),
    grams: entry.grams,
    per100: {
      kcal: entry.per100.kcal,
      protein: entry.per100.protein,
      fat: entry.per100.fat,
      carbs: entry.per100.carbs,
    },
    analysis: entry.analysis,
    additionsLevel: entry.additionsLevel,
    baseGrams: entry.baseGrams,
    source: entry.source === 'demo' ? 'demo' : undefined,
  });
}
export function recentDishes(entries: FoodEntry[], limit = 20) {
  const seen = new Set<string>();
  return [...entries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((entry) => {
      const key = dishKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
export function validDiaryDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number);
  const value = new Date(`${day}T12:00:00`);
  return (
    y >= 1900 &&
    y <= 9999 &&
    value.getFullYear() === y &&
    value.getMonth() === m - 1 &&
    value.getDate() === d
  );
}
export function validateDetails(day: string, time: string, note: string, category: string) {
  if (!validDiaryDay(day)) throw new Error('Выберите корректную дату.');
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('Укажите время от 00:00 до 23:59.');
  if (note.length > 1000) throw new Error('Заметка должна быть не длиннее 1000 символов.');
  if (category && !mealTypes.some((item) => item.value === category))
    throw new Error('Выберите приём пищи.');
}
export function copyDish(
  entry: FoodEntry,
  day: string,
  time: string,
  category: string,
  note: string,
): FoodEntry {
  validateDetails(day, time, note, category);
  return {
    ...structuredClone(entry),
    id: crypto.randomUUID(),
    day,
    createdAt: new Date().toISOString(),
    eatenTime: time || undefined,
    mealType: (category || undefined) as MealType | undefined,
    note: note.trim() || undefined,
  };
}
