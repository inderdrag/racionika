import { ProfileSchema, type UserProfile } from '@racionika/shared';
export const PROFILE_KEY = 'racionika.profile';
export const CONSENT_KEY = 'racionika.aiConsent';
export const CONSENT_VERSION = 'v2';
export const COACH_CONTEXT_KEY = 'racionika.coachContextConsent';
export function hasCoachContextConsent() {
  return hasAiConsent() && localStorage.getItem(COACH_CONTEXT_KEY) === 'v1';
}
export function saveCoachContextConsent(value: boolean) {
  if (value && hasAiConsent()) localStorage.setItem(COACH_CONTEXT_KEY, 'v1');
  else localStorage.removeItem(COACH_CONTEXT_KEY);
  window.dispatchEvent(new Event('racionika:consent'));
}
export function loadProfile(): UserProfile | null {
  try {
    return ProfileSchema.parse(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null'));
  } catch {
    return null;
  }
}
export function saveProfile(profile: UserProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(ProfileSchema.parse(profile)));
  window.dispatchEvent(new Event('racionika:profile'));
}
export function hasAiConsent() {
  return localStorage.getItem(CONSENT_KEY) === CONSENT_VERSION;
}
export function saveAiConsent(value: boolean, includeCoachContext = false) {
  if (value) {
    localStorage.setItem(CONSENT_KEY, CONSENT_VERSION);
    if (includeCoachContext) localStorage.setItem(COACH_CONTEXT_KEY, 'v1');
  } else {
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(COACH_CONTEXT_KEY);
  }
  window.dispatchEvent(new Event('racionika:consent'));
}
export function personalPlan(input: UserProfile) {
  const p = ProfileSchema.parse(input);
  const bmi = p.weight / (p.height / 100) ** 2;
  const targetBmi = p.targetWeight / (p.height / 100) ** 2;
  const review =
    p.age < 18 || p.individualCare || (p.goal === 'lose' && (bmi < 18.5 || targetBmi < 18.5));
  const blocked = (message: string) => ({
    status: 'review' as const,
    message,
    calories: null,
    automaticCalories: null,
    source: 'automatic' as 'automatic' | 'custom',
    lower: null,
    upper: null,
    protein: null,
    fat: null,
    carbs: null,
    water: null,
    weeks: null,
    pace: null,
    adjusted: false,
  });
  if (review)
    return blocked(
      'Для вас нужен индивидуальный план со специалистом. Дневник, вода и напоминания доступны; стандартный дефицит калорий не назначаем.',
    );
  if (
    (p.goal === 'lose' && p.targetWeight >= p.weight) ||
    (p.goal === 'gain' && p.targetWeight <= p.weight)
  )
    return blocked('Целевой вес не соответствует направлению цели. Проверьте параметры профиля.');
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const tdee = bmr * Number(p.activity);
  // App guardrails, not individual medical recommendations.
  const floor = p.sex === 'male' ? 1500 : 1300;
  if (tdee < floor)
    return blocked(
      'Расчётный расход ниже стандартной безопасной границы. Нужна индивидуальная консультация, а не автоматическая диета.',
    );
  const automaticPace =
    p.goal === 'lose'
      ? Math.min(
          p.pace,
          p.weight * 0.01,
          (tdee * 0.25 * 7) / 7700,
          (Math.max(0, tdee - floor) * 7) / 7700,
        )
      : p.goal === 'gain'
        ? Math.min(0.5, Math.max(0.1, p.pace))
        : 0;
  const signed = p.goal === 'lose' ? -1 : p.goal === 'gain' ? 1 : 0;
  const rawCalories = tdee + (signed * automaticPace * 7700) / 7;
  const automaticCalories = Math.max(
    floor,
    p.goal === 'lose' ? Math.ceil(rawCalories) : Math.round(rawCalories),
  );
  const minCalories = Math.ceil(
    Math.max(floor, tdee * 0.75, tdee - (Math.min(1, p.weight * 0.01) * 7700) / 7),
  );
  if (p.customCalories !== undefined && p.customCalories < minCalories)
    return blocked(
      `По вашим данным цель должна быть не ниже ${minCalories} ккал. Более низкую норму подбирают со специалистом.`,
    );
  const maxCalories = Math.floor(Math.min(5000, tdee + 550));
  if (p.customCalories !== undefined && p.customCalories > maxCalories)
    return blocked(
      `По вашим данным цель должна быть не выше ${maxCalories} ккал. Более высокую норму подбирают со специалистом.`,
    );
  const calories = p.customCalories ?? automaticCalories;
  const manual = p.customCalories !== undefined;
  const pace = manual
    ? p.goal === 'lose'
      ? Math.max(0, ((tdee - calories) * 7) / 7700)
      : p.goal === 'gain'
        ? Math.max(0, ((calories - tdee) * 7) / 7700)
        : 0
    : automaticPace;
  const protein = Math.round(
    Math.min(p.weight * (p.goal === 'gain' ? 1.8 : 1.6), (calories * 0.3) / 4),
  );
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    status: 'ready' as const,
    message:
      'Стартовая оценка по формуле Миффлина–Сан Жеора и активности. Это не медицинское назначение; корректируйте план по самочувствию и динамике со специалистом.',
    calories,
    automaticCalories,
    source: manual ? ('custom' as const) : ('automatic' as const),
    lower: Math.ceil(
      Math.max(floor, calories - 100, p.goal === 'lose' || manual ? minCalories : floor),
    ),
    upper: Math.round(
      !manual && p.goal === 'lose' ? Math.min(tdee, calories + 100) : calories + 100,
    ),
    protein,
    fat,
    carbs,
    water: Math.round(Math.min(3500, Math.max(1500, p.weight * 30)) / 50) * 50,
    pace,
    weeks: pace > 0 ? Math.ceil(Math.abs(p.targetWeight - p.weight) / pace) : null,
    adjusted: !manual && p.goal !== 'maintain' && Math.abs(pace - p.pace) > 0.001,
  };
}
export type PersonalPlan = ReturnType<typeof personalPlan>;
