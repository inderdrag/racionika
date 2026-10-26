import { db } from './db';
import { validDiaryDay } from './diary';
import { entryTotals } from './nutrition/analysis';
export type ReportType = 'meals' | 'days' | 'weights';
// Quote every cell; neutralise spreadsheet formulas, including whitespace-prefixed text.
export function csvCell(value: string | number | null | undefined): string {
  let text =
    value == null ? '' : typeof value === 'number' ? String(value).replace('.', ',') : value;
  if (
    typeof value === 'string' &&
    // eslint-disable-next-line no-control-regex -- block control-prefixed spreadsheet formulas
    (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
  )
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function csvDocument(rows: (string | number | null | undefined)[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
const meals = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
const rounded = (value: number) => Math.round(value * 100) / 100;
export async function exportCsv(type: ReportType, from: string, to: string): Promise<string> {
  if (!validDiaryDay(from) || !validDiaryDay(to) || from > to)
    throw new Error('Проверьте даты отчёта.');
  const data = await db.transaction(
    'r',
    [db.foodEntries, db.waterLogs, db.weightLogs],
    async () => ({
      food: await db.foodEntries.where('day').between(from, to, true, true).toArray(),
      water: await db.waterLogs.where('day').between(from, to, true, true).toArray(),
      weights: await db.weightLogs.where('day').between(from, to, true, true).toArray(),
    }),
  );
  if (type === 'meals')
    return csvDocument([
      [
        'Дата',
        'Приём пищи',
        'Время',
        'Блюдо',
        'Масса, г',
        'Калории, ккал',
        'Белки, г',
        'Жиры, г',
        'Углеводы, г',
        'Заметка',
      ],
      ...data.food
        .sort((a, b) =>
          (a.day + (a.eatenTime ?? '') + a.id).localeCompare(b.day + (b.eatenTime ?? '') + b.id),
        )
        .map((item) => {
          const n = entryTotals(item);
          return [
            item.day,
            item.mealType ? meals[item.mealType] : 'Без категории',
            item.eatenTime,
            item.name,
            rounded(item.grams),
            rounded(n.kcal),
            rounded(n.protein),
            rounded(n.fat),
            rounded(n.carbs),
            item.note,
          ];
        }),
    ]);
  if (type === 'weights')
    return csvDocument([
      ['Дата', 'Вес, кг', 'Время записи'],
      ...data.weights
        .sort((a, b) => (a.day + a.createdAt).localeCompare(b.day + b.createdAt))
        .map((item) => [item.day, item.kg, item.createdAt]),
    ]);
  const daily = new Map<
    string,
    {
      food: number;
      kcal: number;
      protein: number;
      fat: number;
      carbs: number;
      water: number | null;
      weight: number | null;
      weightAt: string;
    }
  >();
  const row = (day: string) => {
    if (!daily.has(day))
      daily.set(day, {
        food: 0,
        kcal: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        water: null,
        weight: null,
        weightAt: '',
      });
    return daily.get(day)!;
  };
  for (const item of data.food) {
    const day = row(item.day),
      n = entryTotals(item);
    day.food++;
    day.kcal += n.kcal;
    day.protein += n.protein;
    day.fat += n.fat;
    day.carbs += n.carbs;
  }
  for (const item of data.water) {
    const day = row(item.day);
    day.water = (day.water ?? 0) + item.ml;
  }
  for (const item of data.weights) {
    const day = row(item.day);
    if (item.createdAt >= day.weightAt) {
      day.weightAt = item.createdAt;
      day.weight = item.kg;
    }
  }
  return csvDocument([
    ['Дата', 'Калории, ккал', 'Белки, г', 'Жиры, г', 'Углеводы, г', 'Вода, мл', 'Вес, кг'],
    ...[...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, total]) => [
        day,
        ...(['kcal', 'protein', 'fat', 'carbs'] as const).map((key) =>
          total.food ? rounded(total[key]) : null,
        ),
        total.water,
        total.weight,
      ]),
  ]);
}
