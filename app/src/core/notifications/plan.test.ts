import { describe, expect, it } from 'vitest';
import { defaultReminders, isAwake, reminderPlan } from './plan';
describe('Напоминания и тихие часы', () => {
  it('по умолчанию не включает уведомления без настройки', () =>
    expect(reminderPlan(defaultReminders)).toEqual([]));
  it('каждые пять часов: 08, 13, 18; ночью ничего', () => {
    const p = reminderPlan({ ...defaultReminders, meals: true });
    expect(p.map((x) => [x.hour, x.minute])).toEqual([
      [8, 0],
      [13, 0],
      [18, 0],
    ]);
  });
  it('исключает начало сна и включает начало бодрствования', () => {
    expect(isAwake(22 * 60, defaultReminders)).toBe(false);
    expect(isAwake(8 * 60, defaultReminders)).toBe(true);
    expect(isAwake(7 * 60 + 59, defaultReminders)).toBe(false);
  });
  it('поддерживает сон днём и бодрствование через полночь', () => {
    const s = { ...defaultReminders, meals: true, wake: '20:00', sleep: '08:00', mealHours: 5 };
    expect(reminderPlan(s).map((x) => x.hour)).toEqual([20, 1, 6]);
  });
  it('обрабатывает неполные часы', () => {
    const s = { ...defaultReminders, meals: true, wake: '08:30', sleep: '22:15' };
    expect(reminderPlan(s).map((x) => [x.hour, x.minute])).toEqual([
      [8, 30],
      [13, 30],
      [18, 30],
    ]);
  });
  it('мотивация повторяется по дням недели без ночных событий', () => {
    const s = { ...defaultReminders, meals: true, water: true, motivation: true };
    const p = reminderPlan(s);
    expect(p.filter((x) => x.channel === 'motivation')).toHaveLength(7);
    expect(new Set(p.map((x) => x.id)).size).toBe(p.length);
    expect(p.every((x) => isAwake(x.hour * 60 + x.minute, s))).toBe(true);
  });
  it('не переносит мотивацию на ночь молча', () =>
    expect(() =>
      reminderPlan({ ...defaultReminders, motivation: true, motivationTime: '23:00' }),
    ).toThrow());
  it('отклоняет нулевой интервал и одинаковые часы сна', () => {
    expect(() => reminderPlan({ ...defaultReminders, mealHours: 0 })).toThrow();
    expect(() => reminderPlan({ ...defaultReminders, wake: '22:00' })).toThrow();
  });
  it('разные интервалы не выходят за выбранные часы', () => {
    for (let hour = 0; hour < 24; hour++) {
      const wake = `${String(hour).padStart(2, '0')}:15`;
      const sleep = `${String((hour + 14) % 24).padStart(2, '0')}:45`;
      const s = { ...defaultReminders, meals: true, water: true, wake, sleep };
      expect(reminderPlan(s).every((x) => isAwake(x.hour * 60 + x.minute, s))).toBe(true);
    }
  });
});

describe('Гибкое расписание', () => {
  it('мигрирует старые настройки без потери интервалов', async () => {
    const { ReminderSettingsSchema } = await import('./plan');
    const old = {
      meals: true,
      mealHours: 4,
      water: true,
      waterMinutes: 90,
      motivation: false,
      motivationTime: '11:00',
      wake: '07:00',
      sleep: '23:00',
    };
    const s = ReminderSettingsSchema.parse(old);
    expect(s.days).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.mealFollowups).toBe(true);
    expect(s.mealHours).toBe(4);
    expect(s.mealMode).toBe('interval');
  });
  it('в выбранные дни задаёт конкретные часы и не дублирует одинаковые', () => {
    const p = reminderPlan({
      ...defaultReminders,
      meals: true,
      mealMode: 'times',
      mealTimes: ['18:00', '08:30', '13:00', '13:00'],
      days: [1, 3, 5],
    });
    expect(p.map((x) => [x.hour, x.minute])).toEqual([
      [8, 30],
      [13, 0],
      [18, 0],
    ]);
    expect(p.every((x) => x.followups && x.stopWhenGoal && x.days?.join() === '1,3,5')).toBe(true);
  });
  it('отклоняет пустые дни, сон и слишком тесное расписание', () => {
    expect(() => reminderPlan({ ...defaultReminders, days: [] })).toThrow();
    for (const mealTimes of [[], ['23:00'], ['08:00', '08:30']])
      expect(() =>
        reminderPlan({ ...defaultReminders, meals: true, mealMode: 'times', mealTimes }),
      ).toThrow();
  });
  it('поддержка приходит только в выбранные дни без повторов еды', () => {
    const p = reminderPlan({ ...defaultReminders, motivation: true, days: [1, 2] });
    expect(p).toHaveLength(2);
    expect(p.map((x) => x.weekday)).toEqual([2, 3]);
    expect(p.every((x) => !x.followups)).toBe(true);
  });
});
