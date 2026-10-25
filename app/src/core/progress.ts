import type { UserProfile } from '@racionika/shared';
import { localDay, type FoodEntry, type WaterLog, type WeightLog } from './db';
import { validDiaryDay } from './diary';
import { scaleNutrients } from './nutrition/meal';
import { personalPlan } from './profile';
export type ProgressPeriod = 7 | 30;
export interface ProgressDay {
  day: string;
  weight: number | null;
  calories: number | null;
  water: number | null;
}
// Local calendar arithmetic (not milliseconds): periods remain correct across DST.
export function progressDays(today: string, period: ProgressPeriod): string[] {
  if (!validDiaryDay(today)) throw new Error('Некорректная дата периода.');
  const end = new Date(`${today}T12:00:00`);
  return Array.from({ length: period }, (_, index) => {
    const date = new Date(end);
    date.setDate(date.getDate() - period + index + 1);
    return localDay(date);
  });
}
export function progressSeries(
  today: string,
  period: ProgressPeriod,
  weights: WeightLog[],
  food: FoodEntry[],
  water: WaterLog[],
): ProgressDay[] {
  const rows = progressDays(today, period).map((day) => ({
    day,
    weight: null,
    calories: null,
    water: null,
  })) as ProgressDay[];
  const byDay = new Map(rows.map((row) => [row.day, row]));
  for (const item of [...weights].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const row = byDay.get(item.day);
    if (row && Number.isFinite(item.kg) && item.kg >= 25 && item.kg <= 350) row.weight = item.kg;
  }
  for (const item of food) {
    const row = byDay.get(item.day);
    if (row) row.calories = (row.calories ?? 0) + scaleNutrients(item.per100, item.grams).kcal;
  }
  for (const item of water) {
    const row = byDay.get(item.day);
    if (row && Number.isFinite(item.ml) && item.ml >= 0) row.water = (row.water ?? 0) + item.ml;
  }
  return rows;
}
export function progressSummary(rows: ProgressDay[], key: 'weight' | 'calories' | 'water') {
  const values = rows.flatMap((row) => (row[key] === null ? [] : [row[key]]));
  return {
    count: values.length,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    change: values.length > 1 ? values.at(-1)! - values[0] : null,
  };
}
export function weightPlanProposal(profile: UserProfile, weights: WeightLog[], today: string) {
  const profileDay = localDay(new Date(profile.updatedAt));
  const measurement = [...weights]
    .filter(
      (item) =>
        validDiaryDay(item.day) &&
        item.day >= profileDay &&
        (item.day > profileDay || Date.parse(item.createdAt) >= Date.parse(profile.updatedAt)) &&
        item.day <= today &&
        Number.isFinite(item.kg) &&
        item.kg >= 25 &&
        item.kg <= 350,
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  if (!measurement || Math.abs(measurement.kg - profile.weight) < 0.099) return null;
  const candidate = {
    ...profile,
    weight: measurement.kg,
    targetWeight: profile.goal === 'maintain' ? measurement.kg : profile.targetWeight,
  };
  return {
    profile,
    measurement,
    candidate,
    previous: personalPlan(profile),
    next: personalPlan(candidate),
  };
}
export type WeightPlanProposal = NonNullable<ReturnType<typeof weightPlanProposal>>;
