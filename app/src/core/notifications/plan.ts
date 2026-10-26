import { z } from 'zod';
import type { Tab } from '../navigation';
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const ReminderSettingsSchema = z
  .object({
    meals: z.boolean(),
    mealHours: z.number().int().min(1).max(12),
    water: z.boolean(),
    waterMinutes: z.number().int().min(30).max(240),
    motivation: z.boolean(),
    motivationTime: time,
    sleep: time,
    wake: time,
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5, 6, 7]),
    mealMode: z.enum(['interval', 'times']).default('interval'),
    mealTimes: z.array(time).max(8).default(['08:00', '13:00', '18:00']),
    mealFollowups: z.boolean().default(true),
    stopWhenGoal: z.boolean().default(true),
  })
  .strict()
  .refine((s) => s.sleep !== s.wake, { message: 'Время сна и пробуждения должны различаться.' });
export type ReminderSettings = z.infer<typeof ReminderSettingsSchema>;
export interface DailyReminder {
  id: number;
  title: string;
  body: string;
  hour: number;
  minute: number;
  weekday?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  days?: number[];
  wake?: string;
  sleep?: string;
  followups?: boolean;
  stopWhenGoal?: boolean;
  channel: 'meals' | 'water' | 'motivation';
  route: Tab;
}
export const REMINDER_KEY = 'racionika.reminders';
export const defaultReminders: ReminderSettings = {
  meals: false,
  mealHours: 5,
  water: false,
  waterMinutes: 120,
  motivation: false,
  motivationTime: '11:00',
  sleep: '22:00',
  wake: '08:00',
  days: [1, 2, 3, 4, 5, 6, 7],
  mealMode: 'interval',
  mealTimes: ['08:00', '13:00', '18:00'],
  mealFollowups: true,
  stopWhenGoal: true,
};
export const motivations = [
  'Маленькие шаги тоже считаются. Один спокойный выбор — уже забота о себе.',
  'Не нужно делать всё идеально. Достаточно возвращаться к своему ритму.',
  'Еда — не экзамен. Замечайте голод, сытость и своё самочувствие.',
  'Пауза, вода и обычный обед могут быть хорошей заботой о себе.',
  'Один необычный день не отменяет ваш путь. Продолжайте без наказаний.',
  'Отдых — часть плана. Не сравнивайте свой темп с чужим.',
  'Поддерживайте себя так же доброжелательно, как поддержали бы друга.',
];
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export function isAwake(value: number, s: ReminderSettings) {
  const start = minutes(s.wake);
  return (value - start + 1440) % 1440 < (minutes(s.sleep) - start + 1440) % 1440;
}
export function reminderPlan(input: ReminderSettings): DailyReminder[] {
  if (input.days?.length === 0) throw new Error('Выберите хотя бы один день недели.');
  const s = ReminderSettingsSchema.parse(input);
  const result: DailyReminder[] = [];
  const start = minutes(s.wake),
    duration = (minutes(s.sleep) - start + 1440) % 1440;
  const add = (step: number, channel: 'meals' | 'water', base: number) => {
    for (let offset = 0; offset < duration; offset += step) {
      const m = (start + offset) % 1440;
      result.push({
        id: base + m,
        hour: Math.floor(m / 60),
        minute: m % 60,
        channel,
        route: channel === 'meals' ? 'diary' : 'home',
        title: channel === 'meals' ? 'Время позаботиться о питании' : 'Небольшая пауза для воды',
        body:
          channel === 'meals'
            ? 'Если вы голодны — время для еды. Если уже поели, можно отметить это в дневнике.'
            : 'Прислушайтесь к жажде. Можно сделать несколько глотков и отметить воду.',
      });
    }
  };
  if (s.meals) {
    if (s.mealMode === 'interval') add(s.mealHours * 60, 'meals', 10000);
    else {
      const values = [...new Set(s.mealTimes.map(minutes))].sort((a, b) => a - b);
      if (!values.length) throw new Error('Добавьте время еды.');
      if (values.some((m) => !isAwake(m, s))) throw new Error('Время еды попадает на сон.');
      if (
        values.some(
          (m, i) => values.length > 1 && (values[(i + 1) % values.length] - m + 1440) % 1440 < 60,
        )
      )
        throw new Error('Между приёмами пищи нужен интервал не меньше часа.');
      for (const m of values)
        result.push({
          id: 10000 + m,
          hour: Math.floor(m / 60),
          minute: m % 60,
          title: 'Время позаботиться о питании',
          body: 'Если пора поесть — сделайте паузу. Если уже поели, отметьте это в дневнике.',
          channel: 'meals',
          route: 'diary',
        });
    }
  }
  if (s.water) add(s.waterMinutes, 'water', 20000);
  if (s.motivation) {
    const m = minutes(s.motivationTime);
    if (!isAwake(m, s)) throw new Error('Выберите время мотивации вне часов сна.');
    motivations.forEach((body, index) =>
      result.push({
        id: 30001 + index,
        title: 'Немного поддержки',
        body,
        hour: Math.floor(m / 60),
        minute: m % 60,
        weekday: (index + 1) as DailyReminder['weekday'],
        channel: 'motivation',
        route: 'coach',
      }),
    );
  }
  return result
    .map((r) => ({
      ...r,
      days: [...new Set(s.days)].sort((a, b) => a - b),
      wake: s.wake,
      sleep: s.sleep,
      followups: r.channel === 'meals' && s.mealFollowups,
      stopWhenGoal: s.stopWhenGoal,
    }))
    .filter((r) => !r.weekday || r.days.includes(r.weekday === 1 ? 7 : r.weekday - 1));
}
export function loadReminders(): ReminderSettings {
  try {
    return ReminderSettingsSchema.parse(JSON.parse(localStorage.getItem(REMINDER_KEY) ?? 'null'));
  } catch {
    return { ...defaultReminders };
  }
}
