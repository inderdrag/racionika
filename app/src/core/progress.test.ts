import { describe, expect, it } from 'vitest';
import type { UserProfile } from '@racionika/shared';
import type { FoodEntry, WaterLog, WeightLog } from './db';
import { progressDays, progressSeries, progressSummary, weightPlanProposal } from './progress';
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
  updatedAt: '2026-10-01T12:00:00Z',
};
const weight = (day: string, kg: number, createdAt = `${day}T12:00:00Z`): WeightLog => ({
  id: `weight-${day}`,
  day,
  kg,
  createdAt,
});
const food = (day: string, grams = 150): FoodEntry => ({
  id: crypto.randomUUID(),
  day,
  name: 'Еда',
  grams,
  per100: { kcal: 100, protein: 5, fat: 2, carbs: 15 },
  createdAt: `${day}T12:00:00Z`,
});
const water = (day: string, ml: number): WaterLog => ({
  id: crypto.randomUUID(),
  day,
  ml,
  createdAt: `${day}T12:00:00Z`,
});
describe('Графики за локальные календарные дни', () => {
  it('включает сегодняшний день, границу месяца, года и високосный день', () => {
    expect(progressDays('2026-01-02', 7)).toEqual([
      '2025-12-27',
      '2025-12-28',
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
    expect(progressDays('2024-03-01', 7)).toContain('2024-02-29');
    expect(progressDays('2026-10-25', 30)).toHaveLength(30);
    expect(() => progressDays('2026-02-30', 7)).toThrow();
  });
  it('суммирует порции и воду за день, пропуски не превращаются в нули', () => {
    const rows = progressSeries(
      '2026-10-25',
      7,
      [weight('2026-10-20', 80), weight('2026-10-25', 79)],
      [food('2026-10-20'), food('2026-10-20', 50), food('2026-10-25', 300)],
      [water('2026-10-20', 200), water('2026-10-20', 300), water('2026-10-25', 1000)],
    );
    expect(rows[0]).toEqual({ day: '2026-10-19', weight: null, calories: null, water: null });
    expect(rows[1]).toEqual({ day: '2026-10-20', weight: 80, calories: 200, water: 500 });
    expect(progressSummary(rows, 'calories')).toEqual({ count: 2, mean: 250, change: 100 });
    expect(progressSummary(rows, 'water').mean).toBe(750);
    expect(progressSummary(rows, 'weight')).toEqual({ count: 2, mean: 79.5, change: -1 });
  });
  it('игнорирует будущие и старые записи; 30 дней включает то, чего нет в 7', () => {
    const foods = [food('2026-09-25'), food('2026-09-26'), food('2026-10-25'), food('2026-10-26')];
    expect(progressSummary(progressSeries('2026-10-25', 7, [], foods, []), 'calories').count).toBe(
      1,
    );
    expect(progressSummary(progressSeries('2026-10-25', 30, [], foods, []), 'calories').count).toBe(
      2,
    );
  });
  it('пустые данные не создают фиктивный вес профиля', () => {
    const rows = progressSeries('2026-10-25', 7, [], [], []);
    expect(progressSummary(rows, 'weight')).toEqual({ count: 0, mean: null, change: null });
  });
  it('нулевая калорийность реальной записи отличается от отсутствия данных', () => {
    const zero = { ...food('2026-10-25'), per100: { kcal: 0, protein: 0, fat: 0, carbs: 0 } };
    expect(progressSummary(progressSeries('2026-10-25', 7, [], [zero], []), 'calories')).toEqual({
      count: 1,
      mean: 0,
      change: null,
    });
  });
  it('защищает вес от некорректных значений и использует последнее измерение дня', () => {
    const rows = progressSeries(
      '2026-10-25',
      7,
      [
        weight('2026-10-25', 79, '2026-10-25T14:00:00Z'),
        weight('2026-10-25', 80),
        weight('2026-10-24', NaN),
      ],
      [],
      [],
    );
    expect(rows.at(-1)?.weight).toBe(79);
    expect(rows.at(-2)?.weight).toBeNull();
  });
});
describe('Предложение пересчитать норму', () => {
  it('только предлагает новый план, не мутируя профиль и не назначая новую цель веса', () => {
    const before = structuredClone(profile);
    const proposal = weightPlanProposal(profile, [weight('2026-10-25', 78)], '2026-10-25')!;
    expect(profile).toEqual(before);
    expect(proposal.candidate.weight).toBe(78);
    expect(proposal.candidate.targetWeight).toBe(78);
    expect(proposal.previous.calories).toBe(2136);
    expect(proposal.next.calories).toBe(2112);
  });
  it('ручную калорийность сохраняет, а БЖУ пересчитывает по новому весу', () => {
    const proposal = weightPlanProposal(
      { ...profile, customCalories: 2000 },
      [weight('2026-10-25', 78)],
      '2026-10-25',
    )!;
    expect(proposal.next.calories).toBe(2000);
    expect(proposal.next.protein).toBe(125);
    expect(proposal.candidate.customCalories).toBe(2000);
  });
  it('игнорирует тот же вес, будущие и более старые, чем профиль, измерения', () => {
    expect(weightPlanProposal(profile, [weight('2026-10-25', 80)], '2026-10-25')).toBeNull();
    expect(
      weightPlanProposal(
        profile,
        [weight('2026-09-30', 77), weight('2026-10-26', 79)],
        '2026-10-25',
      ),
    ).toBeNull();
  });
  it('не возвращает профиль к измерению до ручного изменения профиля в тот же день', () => {
    const current = { ...profile, updatedAt: '2026-10-25T18:00:00Z' };
    expect(weightPlanProposal(current, [weight('2026-10-25', 78)], '2026-10-25')).toBeNull();
    expect(
      weightPlanProposal(current, [weight('2026-10-25', 78, '2026-10-25T19:00:00Z')], '2026-10-25')
        ?.candidate.weight,
    ).toBe(78);
  });
  it('берёт последнее по дате, не последнее введённое историческое значение', () => {
    const proposal = weightPlanProposal(
      profile,
      [weight('2026-10-25', 78), weight('2026-10-10', 79, '2026-10-25T15:00:00Z')],
      '2026-10-25',
    )!;
    expect(proposal.measurement.kg).toBe(78);
  });
  it('не обходит ограничения нормы и достижение цели', () => {
    const proposal = weightPlanProposal(
      { ...profile, goal: 'lose', targetWeight: 70 },
      [weight('2026-10-25', 69)],
      '2026-10-25',
    )!;
    expect(proposal.next.status).toBe('review');
    const custom = weightPlanProposal(
      { ...profile, customCalories: 1602 },
      [weight('2026-10-25', 90)],
      '2026-10-25',
    )!;
    expect(custom.next.status).toBe('review');
  });
});
