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
