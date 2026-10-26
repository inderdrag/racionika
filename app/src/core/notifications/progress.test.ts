import { describe, expect, it } from 'vitest';
import { reminderProgress } from './progress';
import type { FoodEntry } from '../db';
import type { UserProfile } from '@racionika/shared';
const profile: UserProfile = {
  version: 1,
  name: 'Тест',
  sex: 'male',
  age: 30,
  height: 180,
  weight: 80,
  activity: '1.2',
  goal: 'maintain',
  targetWeight: 80,
  pace: 0.5,
  individualCare: false,
  updatedAt: '2026-10-25T10:00:00Z',
  customCalories: 2000,
};
const now = new Date('2026-10-25T15:00:00');
const meal = (next: Partial<FoodEntry> = {}): FoodEntry => ({
  id: '1',
  day: '2026-10-25',
  name: 'Еда',
  grams: 200,
  per100: { kcal: 200, protein: 10, fat: 4, carbs: 30 },
  createdAt: '2026-10-25T13:05:00',
  source: 'manual',
  ...next,
});
describe('Данные для фоновых напоминаний', () => {
  it('передаёт только итоги, времена и цели без названий еды или профиля', () => {
    const p = reminderProgress(
      profile,
      [meal()],
      [{ id: 'w', day: '2026-10-25', ml: 300, createdAt: now.toISOString() }],
      now,
    );
    expect(p.days[0]).toMatchObject({ kcal: 400, water: 300 });
    expect(p.calorieGoal).toBe(2000);
    expect(JSON.stringify(p)).not.toContain('Тест');
    expect(JSON.stringify(p)).not.toContain('Еда');
  });
  it('демо, будущая и повреждённая еда не отменяют напоминания', () => {
    const p = reminderProgress(
      profile,
      [
        meal({ source: 'demo' }),
        meal({ day: '2026-10-26' }),
        meal({ eatenTime: '19:00' }),
        meal({ grams: NaN }),
        meal({ createdAt: 'bad' }),
      ],
      [],
      now,
    );
    expect(p.days.reduce((sum, d) => sum + d.kcal, 0)).toBe(0);
    expect(p.days.flatMap((d) => d.meals)).toEqual([]);
  });
  it('запись сегодня с уточнённым ранним временем тоже отменяет повтор', () => {
    const p = reminderProgress(profile, [meal({ eatenTime: '12:00' })], [], now);
    expect(p.days[0].meals).toEqual([
      new Date('2026-10-25T12:00:00').getTime(),
      new Date('2026-10-25T13:05:00').getTime(),
    ]);
  });
  it('копия на прошлую дату не отмечает сегодняшний приём пищи', () => {
    const p = reminderProgress(profile, [meal({ day: '2026-10-24' })], [], now);
    expect(p.days.flatMap((d) => d.meals)).toEqual([]);
  });
  it('нулевая вода, старые дни и будущие даты не попадают в норму сегодня', () => {
    const p = reminderProgress(
      profile,
      [],
      [
        { id: 'w', day: '2026-10-25', ml: 0, createdAt: now.toISOString() },
        { id: 'f', day: '2026-10-26', ml: 500, createdAt: now.toISOString() },
      ],
      now,
    );
    expect(p.days).toEqual([]);
  });
});
