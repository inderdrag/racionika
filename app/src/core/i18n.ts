const ru = {
  brand: 'Рационика',
  home: 'Главная',
  diary: 'Дневник',
  coach: 'Наставник',
  progress: 'Прогресс',
  settings: 'Профиль',
};
export type TranslationKey = keyof typeof ru;
export type Locale = 'ru' | 'en';
const en: Record<TranslationKey, string> = {
  brand: 'Racionika',
  home: 'Today',
  diary: 'Diary',
  coach: 'Coach',
  progress: 'Progress',
  settings: 'Profile',
};
export const t = (key: TranslationKey, locale: Locale = 'ru') => ({ ru, en })[locale][key];
