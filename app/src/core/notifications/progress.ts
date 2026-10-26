import type { UserProfile } from '@racionika/shared';
import { db, localDay, type FoodEntry, type WaterLog } from '../db';
import { personalPlan } from '../profile';
import { entryTotals } from '../nutrition/analysis';
export interface ReminderProgress {
  days: { day: string; kcal: number; water: number; meals: number[] }[];
  calorieGoal: number | null;
  waterGoal: number | null;
}
export function reminderProgress(
  profile: UserProfile,
  food: FoodEntry[],
  water: WaterLog[],
  now = new Date(),
): ReminderProgress {
  const start = new Date(now);
  start.setDate(start.getDate() - 2);
  const from = localDay(start),
    to = localDay(now);
  const days = new Map<string, ReminderProgress['days'][number]>();
  const get = (day: string) => {
    if (!days.has(day)) days.set(day, { day, kcal: 0, water: 0, meals: [] });
    return days.get(day)!;
  };
  for (const entry of food) {
    if (entry.day < from || entry.day > to || entry.source === 'demo') continue;
    try {
      const created = Date.parse(entry.createdAt);
      const at =
        entry.eatenTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.eatenTime)
          ? new Date(`${entry.day}T${entry.eatenTime}:00`).getTime()
          : created;
      if (!Number.isFinite(at) || at > now.getTime() || localDay(new Date(at)) !== entry.day)
        continue;
      get(entry.day).kcal += entryTotals(entry).kcal;
      get(entry.day).meals.push(at);
      // Logging a meal today also fulfils a reminder even when an earlier eatenTime was entered.
      if (
        Number.isFinite(created) &&
        created <= now.getTime() &&
        localDay(new Date(created)) === entry.day
      )
        get(entry.day).meals.push(created);
    } catch {
      /* A damaged record must not cancel a reminder. */
    }
  }
  for (const row of water)
    if (
      row.day >= from &&
      row.day <= to &&
      Number.isFinite(row.ml) &&
      row.ml > 0 &&
      row.ml <= 10000
    )
      get(row.day).water += row.ml;
  const plan = personalPlan(profile);
  return {
    days: [...days.values()].map((d) => ({
      ...d,
      kcal: Math.round(d.kcal),
      meals: [...new Set(d.meals)].sort((a, b) => a - b).slice(-100),
    })),
    calorieGoal: plan.calories,
    waterGoal: plan.water,
  };
}
export async function loadReminderProgress(profile: UserProfile) {
  const from = new Date();
  from.setDate(from.getDate() - 2);
  const [food, water] = await Promise.all([
    db.foodEntries.where('day').between(localDay(from), localDay(), true, true).toArray(),
    db.waterLogs.where('day').between(localDay(from), localDay(), true, true).toArray(),
  ]);
  return reminderProgress(profile, food, water);
}
