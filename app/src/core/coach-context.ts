import type { UserProfile, Nutrients } from '@racionika/shared';
import { localDay, type FoodEntry, type WaterLog, type WeightLog } from './db';
import { progressDays, progressSeries } from './progress';
import { personalPlan } from './profile';
import { entryTotals } from './nutrition/analysis';
import { validDiaryDay } from './diary';
const rounded = (n: number) => Math.round(n * 10) / 10;
export function coachWindow(selectedDay: string, today = localDay(), extended = true) {
  if (!validDiaryDay(selectedDay) || !validDiaryDay(today))
    throw new Error('Некорректная дата контекста.');
  const end = selectedDay < today ? selectedDay : today;
  const days = extended ? progressDays(end, 7) : [selectedDay];
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    days,
    from: extended ? days[0] : end,
    end,
    weightFrom: progressDays(end, 30)[0],
    menuDay: localDay(tomorrow),
    selectedDay,
    today,
  };
}
export function buildCoachContext(input: {
  selectedDay: string;
  today?: string;
  profile: UserProfile;
  food: FoodEntry[];
  water: WaterLog[];
  weights: WeightLog[];
  extended: boolean;
}) {
  const range = coachWindow(input.selectedDay, input.today, input.extended),
    byDay = new Map(
      range.days.map((day) => [
        day,
        { day, totals: null as Nutrients | null, water: null as number | null, entries: 0 },
      ]),
    );
  let excludedDemo = 0,
    invalidRecords = 0;
  const selectedMeals: { name: string; grams: number; category?: string; time?: string }[] = [];
  for (const e of input.food) {
    const row = byDay.get(e.day);
    if (!row) continue;
    if (e.source === 'demo') {
      excludedDemo++;
      continue;
    }
    try {
      const n = entryTotals(e);
      if (Object.values(n).some((v) => !Number.isFinite(v) || v < 0)) throw new Error('invalid');
      row.totals ??= { kcal: 0, protein: 0, fat: 0, carbs: 0 };
      for (const k of ['kcal', 'protein', 'fat', 'carbs'] as const) row.totals[k] += n[k];
      row.entries++;
      if (e.day === input.selectedDay && selectedMeals.length < 8)
        selectedMeals.push({
          name: e.name.slice(0, 64),
          grams: rounded(e.grams),
          category: e.mealType,
          time: e.eatenTime,
        });
    } catch {
      invalidRecords++;
    }
  }
  for (const e of input.water) {
    const row = byDay.get(e.day);
    if (row && Number.isFinite(e.ml) && e.ml > 0 && e.ml <= 10000)
      row.water = (row.water ?? 0) + e.ml;
  }
  const days = [...byDay.values()].map((r) => ({
    ...r,
    totals: r.totals
      ? (Object.fromEntries(
          Object.entries(r.totals).map(([k, v]) => [k, rounded(v)]),
        ) as unknown as Nutrients)
      : null,
  }));
  const foodDays = days.filter((r) => r.totals !== null),
    waterDays = days.filter((r) => r.water !== null);
  const weights = input.extended
    ? progressSeries(range.end, 30, input.weights, [], []).flatMap((r) =>
        r.weight === null ? [] : [{ day: r.day, kg: r.weight }],
      )
    : [];
  const summary = {
    version: 2,
    day: input.selectedDay,
    today: range.today,
    menuDay: range.menuDay,
    scope: input.extended ? '7d_food_30d_weight' : 'selected_day',
    window: { from: range.from, to: range.end },
    profile: input.profile,
    plan: personalPlan(input.profile),
    totals: days.find((r) => r.day === input.selectedDay)?.totals ?? null,
    water: days.find((r) => r.day === input.selectedDay)?.water ?? null,
    meals: selectedMeals,
    days,
    averages: {
      foodDays: foodDays.length,
      waterDays: waterDays.length,
      kcal: foodDays.length
        ? rounded(foodDays.reduce((s, r) => s + r.totals!.kcal, 0) / foodDays.length)
        : null,
      water: waterDays.length
        ? rounded(waterDays.reduce((s, r) => s + r.water!, 0) / waterDays.length)
        : null,
    },
    weight: {
      measurements: weights,
      change: weights.length > 1 ? rounded(weights.at(-1)!.kg - weights[0].kg) : null,
    },
    excludedDemo,
    invalidRecords,
    note: 'Пропуски неизвестны, не нули. Записи не гарантируют полный день. plan — текущая цель, не историческая. Не меняй её без подтверждения.',
  };
  let json = JSON.stringify(summary);
  while (json.length > 6000 && summary.meals.length) {
    summary.meals.pop();
    json = JSON.stringify(summary);
  }
  if (json.length > 6000)
    throw new Error('Контекст слишком большой. Попробуйте запрос по одному дню.');
  return { summary, json };
}
