import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCoachContext, coachWindow } from './coach-context';
import {
  hasAiConsent,
  hasCoachContextConsent,
  saveAiConsent,
  saveCoachContextConsent,
  COACH_CONTEXT_KEY,
} from './profile';
import type { UserProfile } from '@racionika/shared';
import type { FoodEntry, WeightLog } from './db';
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
  updatedAt: '2026-10-20T12:00:00Z',
  customCalories: 2000,
};
const food = (day: string, kcal = 100, source: FoodEntry['source'] = 'manual'): FoodEntry => ({
  id: day,
  day,
  name: 'Еда',
  grams: 1000,
  per100: { kcal: kcal / 10, protein: 3, fat: 2, carbs: 10 },
  source,
  createdAt: day + 'T12:00:00Z',
});
const weight = (day: string, kg: number): WeightLog => ({
  id: day,
  day,
  kg,
  createdAt: day + 'T12:00:00Z',
});
const input = {
  selectedDay: '2026-10-25',
  today: '2026-10-25',
  profile,
  food: [],
  water: [],
  weights: [],
  extended: true,
};
afterEach(() => vi.unstubAllGlobals());
describe('Контекст нескольких дней', () => {
  it('пропуски остаются null, среднее только по записанным дням, демо исключено', () => {
    const c = buildCoachContext({
      ...input,
      food: [food('2026-10-19', 1000), food('2026-10-25', 2000), food('2026-10-24', 500, 'demo')],
      water: [{ id: 'w', day: '2026-10-25', ml: 200, createdAt: '2026-10-25T12:00:00Z' }],
    }).summary;
    expect(c.days).toHaveLength(7);
    expect(c.averages.kcal).toBe(1500);
    expect(c.averages.foodDays).toBe(2);
    expect(c.days[1].totals).toBeNull();
    expect(c.excludedDemo).toBe(1);
    expect(c.plan.calories).toBe(2000);
    expect(c.plan.source).toBe('custom');
  });
  it('выбирает последнее измерение дня, без интерполяции и будущего', () => {
    const c = buildCoachContext({
      ...input,
      weights: [
        weight('2026-09-01', 90),
        weight('2026-10-01', 81),
        weight('2026-10-25', 80),
        { ...weight('2026-10-25', 79.5), createdAt: '2026-10-25T19:00:00Z' },
        weight('2026-10-26', 78),
      ],
    }).summary;
    expect(c.weight.measurements).toHaveLength(2);
    expect(c.weight.change).toBe(-1.5);
  });
  it('старое согласие передаёт только выбранный день, без веса за 30 дней', () => {
    const c = buildCoachContext({
      ...input,
      extended: false,
      food: [food('2026-10-24'), food('2026-10-25')],
      weights: [weight('2026-10-25', 80)],
    }).summary;
    expect(c.days).toHaveLength(1);
    expect(c.weight.measurements).toEqual([]);
    expect(c.meals).toHaveLength(1);
    expect(c.scope).toBe('selected_day');
  });
  it('завтра привязано к сегодняшней дате, не к историческому дню', () => {
    expect(coachWindow('2026-10-01', '2026-10-25').menuDay).toBe('2026-10-26');
  });
  it('будущая еда не выдаётся за съеденную; выбранный будущий день неизвестен', () => {
    const c = buildCoachContext({
      ...input,
      selectedDay: '2026-10-26',
      food: [food('2026-10-26')],
    }).summary;
    expect(c.totals).toBeNull();
    expect(c.meals).toEqual([]);
    expect(c.days.at(-1)?.day).toBe('2026-10-25');
  });
  it('JSON остаётся валидным и в пределах лимита даже при большом дневнике', () => {
    const c = buildCoachContext({
      ...input,
      food: Array.from({ length: 300 }, (_, i) => ({
        ...food('2026-10-25'),
        id: String(i),
        name: 'Длинное название '.repeat(20),
      })),
      weights: Array.from({ length: 30 }, (_, i) =>
        weight(new Date(2026, 8, 26 + i).toISOString().slice(0, 10), 80),
      ),
    });
    expect(c.json.length).toBeLessThanOrEqual(6000);
    expect(() => JSON.parse(c.json)).not.toThrow();
    expect(c.summary.meals.length).toBeLessThanOrEqual(8);
    expect(c.json).not.toContain('createdAt');
  });
  it('не переносит недействительные записи в арифметику', () => {
    const c = buildCoachContext({
      ...input,
      food: [{ ...food('2026-10-25'), grams: NaN }],
    }).summary;
    expect(c.invalidRecords).toBe(1);
    expect(c.totals).toBeNull();
  });
});
describe('Расширение согласия только явно', () => {
  it('v2 не расширяется при обычном сохранении профиля; включение и отзыв явные', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    });
    vi.stubGlobal('window', { dispatchEvent: () => true });
    saveAiConsent(true);
    expect(hasAiConsent()).toBe(true);
    expect(hasCoachContextConsent()).toBe(false);
    saveCoachContextConsent(true);
    expect(hasCoachContextConsent()).toBe(true);
    saveCoachContextConsent(false);
    saveAiConsent(true);
    expect(hasCoachContextConsent()).toBe(false);
    saveAiConsent(true, true);
    expect(hasCoachContextConsent()).toBe(true);
    saveAiConsent(false);
    expect(values.has(COACH_CONTEXT_KEY)).toBe(false);
  });
});
