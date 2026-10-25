import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileSchema, type UserProfile } from '@racionika/shared';
import {
  personalPlan,
  hasAiConsent,
  saveAiConsent,
  loadProfile,
  saveProfile,
  CONSENT_KEY,
  PROFILE_KEY,
} from './profile';
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
  updatedAt: '2026-10-24T12:00:00Z',
};
afterEach(() => vi.unstubAllGlobals());
describe('Персональная норма', () => {
  it('использует Миффлина–Сан Жеора, не ИИ', () => {
    const p = personalPlan(profile);
    expect(p.status).toBe('ready');
    expect(p.calories).toBe(2136);
    expect(p.water).toBe(2400);
  });
  it('отличает женскую формулу', () => {
    expect(personalPlan({ ...profile, sex: 'female' }).calories).toBe(1937);
  });
  it('ограничивает дефицит 25%, 1% массы и нижней границей', () => {
    const p = personalPlan({ ...profile, goal: 'lose', targetWeight: 70, pace: 1 });
    expect(p.status).toBe('ready');
    expect(p.calories).toBeGreaterThanOrEqual(2136 * 0.75);
    expect(p.calories).toBeGreaterThanOrEqual(1500);
    expect(p.lower).toBeGreaterThanOrEqual(2136 * 0.75);
    expect(p.pace).toBeLessThanOrEqual(0.8);
    expect(p.adjusted).toBe(true);
  });
  it('не назначает диету несовершеннолетнему', () => {
    expect(
      personalPlan({ ...profile, age: 17, goal: 'lose', targetWeight: 70 }).calories,
    ).toBeNull();
  });
  it('не назначает похудение при недостаточном текущем или целевом весе', () => {
    for (const targetWeight of [40, 50])
      expect(personalPlan({ ...profile, goal: 'lose', targetWeight }).status).toBe('review');
    expect(personalPlan({ ...profile, weight: 50, goal: 'lose', targetWeight: 45 }).status).toBe(
      'review',
    );
  });
  it('не назначает стандартную норму при особых состояниях', () =>
    expect(personalPlan({ ...profile, individualCare: true }).calories).toBeNull());
  it('контролирует направление цели', () =>
    expect(personalPlan({ ...profile, goal: 'gain', targetWeight: 60 }).status).toBe('review'));
  it('ограничивает набор и прогнозирует срок, а не обещает дату', () => {
    const p = personalPlan({ ...profile, goal: 'gain', targetWeight: 85, pace: 1 });
    expect(p.pace).toBe(0.5);
    expect(p.weeks).toBe(10);
    expect(p.calories).toBe(2686);
  });
  it('БЖУ не дают отрицательных углеводов, вода ограничена разумным ориентиром', () => {
    const p = personalPlan({ ...profile, weight: 180, goal: 'lose', targetWeight: 150 });
    expect(p.carbs).toBeGreaterThanOrEqual(0);
    expect(p.water).toBeLessThanOrEqual(3500);
    if (p.status === 'ready')
      expect(Math.abs(p.protein * 4 + p.fat * 9 + p.carbs * 4 - p.calories)).toBeLessThanOrEqual(
        10,
      );
  });
  it('отклоняет неправильные поля и возраст', () => {
    expect(() => ProfileSchema.parse({ ...profile, age: NaN })).toThrow();
    expect(() => ProfileSchema.parse({ ...profile, name: '' })).toThrow();
  });
});
describe('Сохранённое согласие', () => {
  function storage() {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    return values;
  }
  it('не расширяет старое v1-согласие молча', () => {
    const values = storage();
    values.set(CONSENT_KEY, 'v1');
    expect(hasAiConsent()).toBe(false);
    saveAiConsent(true);
    expect(hasAiConsent()).toBe(true);
    saveAiConsent(false);
    expect(hasAiConsent()).toBe(false);
  });
  it('хранит профиль локально без токенов', () => {
    const values = storage();
    saveProfile(profile);
    expect(loadProfile()).toEqual(profile);
    expect(values.get(PROFILE_KEY)).not.toContain('token');
  });
  it('не теряет дневник из-за повреждённого профиля', () => {
    const values = storage();
    values.set(PROFILE_KEY, 'broken');
    expect(loadProfile()).toBeNull();
  });
});

describe('Ручная цель калорий', () => {
  it('сохраняет старые профили без нового поля', () => {
    expect(ProfileSchema.parse(profile)).not.toHaveProperty('customCalories');
    expect(personalPlan(profile).source).toBe('automatic');
  });
  it('пересчитывает БЖУ под пользовательскую калорийность', () => {
    const plan = personalPlan({ ...profile, customCalories: 2000 });
    expect(plan.status).toBe('ready');
    expect(plan.calories).toBe(2000);
    expect(plan.automaticCalories).toBe(2136);
    expect(plan.source).toBe('custom');
    if (plan.status === 'ready') {
      expect(plan.protein).toBe(128);
      expect(plan.fat).toBe(62);
      expect(plan.carbs).toBe(233);
      expect(
        Math.abs(plan.protein * 4 + plan.fat * 9 + plan.carbs * 4 - plan.calories),
      ).toBeLessThanOrEqual(10);
    }
  });
  it('не обходит ограничения через ручной ввод или цель поддержания', () => {
    for (const goal of ['lose', 'maintain', 'gain'] as const) {
      expect(
        personalPlan({
          ...profile,
          goal,
          targetWeight: goal === 'lose' ? 70 : goal === 'gain' ? 85 : 80,
          customCalories: 1500,
        }).status,
      ).toBe('review');
    }
    expect(personalPlan({ ...profile, customCalories: 3000 }).status).toBe('review');
    expect(() => ProfileSchema.parse({ ...profile, pace: 8 })).toThrow();
    for (const customCalories of [0, -500, 1199, 5001, NaN, Infinity, 1800.5]) {
      expect(() => ProfileSchema.parse({ ...profile, customCalories })).toThrow();
    }
  });
  it('не назначает ручную диету несовершеннолетним или при особых состояниях', () => {
    expect(personalPlan({ ...profile, age: 17, customCalories: 2000 }).status).toBe('review');
    expect(personalPlan({ ...profile, individualCare: true, customCalories: 2000 }).status).toBe(
      'review',
    );
  });
  it('считает срок из выбранных калорий, не обещает прежний темп', () => {
    const slow = personalPlan({ ...profile, goal: 'lose', targetWeight: 70, customCalories: 2000 });
    expect(slow.pace).toBeCloseTo(((2136 - 2000) * 7) / 7700);
    expect(slow.weeks).toBe(81);
    const noLoss = personalPlan({
      ...profile,
      goal: 'lose',
      targetWeight: 70,
      customCalories: 2400,
    });
    expect(noLoss.pace).toBe(0);
    expect(noLoss.weeks).toBeNull();
    expect(noLoss.lower! <= noLoss.upper!).toBe(true);
  });
});

describe('Нижние пороги приложения', () => {
  const female = {
    ...profile,
    sex: 'female' as const,
    age: 55,
    height: 150,
    weight: 65,
    goal: 'lose' as const,
    targetWeight: 60,
  };
  it('не опускает женский расчёт ниже 1300 ккал', () => {
    expect(personalPlan({ ...female, pace: 1 }).calories).toBe(1300);
    expect(personalPlan({ ...female, customCalories: 1300 }).status).toBe('ready');
    expect(personalPlan({ ...female, customCalories: 1299 }).status).toBe('review');
  });
  it('мужской нижний порог 1500 не отменяет персональную проверку дефицита', () => {
    const male = {
      ...profile,
      age: 50,
      height: 170,
      weight: 65,
      goal: 'lose' as const,
      targetWeight: 60,
    };
    expect(personalPlan({ ...male, customCalories: 1500 }).status).toBe('ready');
    expect(personalPlan({ ...male, customCalories: 1499 }).status).toBe('review');
    expect(personalPlan({ ...profile, customCalories: 1500 }).status).toBe('review');
  });
  it('не теряет сохранённый профиль со старой нормой: возвращает review', () => {
    const legacy = { ...female, customCalories: 1200 };
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(legacy) });
    expect(loadProfile()).toEqual(legacy);
    expect(personalPlan(loadProfile()!).status).toBe('review');
  });
});
