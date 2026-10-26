import { useEffect, useState } from 'react';
import { z } from 'zod';
export const PREFERENCES_KEY = 'racionika.preferences';
export const PreferencesSchema = z.object({
  version: z.literal(1),
  weightUnit: z.enum(['kg', 'lb']),
  waterUnit: z.enum(['ml', 'l']),
  quality: z.enum(['fast', 'accurate']),
});
export type Preferences = z.infer<typeof PreferencesSchema>;
export const defaultPreferences: Preferences = {
  version: 1,
  weightUnit: 'kg',
  waterUnit: 'ml',
  quality: 'fast',
};
export function loadPreferences(): Preferences {
  try {
    return PreferencesSchema.parse(JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null'));
  } catch {
    return { ...defaultPreferences };
  }
}
export function savePreferences(value: Preferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(PreferencesSchema.parse(value)));
  window.dispatchEvent(new Event('racionika:preferences'));
}
export function usePreferences() {
  const [value, setValue] = useState(loadPreferences);
  useEffect(() => {
    const refresh = () => setValue(loadPreferences());
    window.addEventListener('racionika:preferences', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('racionika:preferences', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return value;
}
export const weightUnitLabel = (p: Preferences) => (p.weightUnit === 'lb' ? 'фунт.' : 'кг');
export const waterUnitLabel = (p: Preferences) => (p.waterUnit === 'l' ? 'л' : 'мл');
export const weightValue = (kg: number, p: Preferences) =>
  kg * (p.weightUnit === 'lb' ? 2.20462262185 : 1);
export const weightKg = (value: number, p: Preferences) =>
  Math.round((value / (p.weightUnit === 'lb' ? 2.20462262185 : 1)) * 1000) / 1000;
export const waterValue = (ml: number, p: Preferences) => ml / (p.waterUnit === 'l' ? 1000 : 1);
export const waterMl = (value: number, p: Preferences) =>
  Math.round(value * (p.waterUnit === 'l' ? 1000 : 1));
export const weightInput = (kg: number, p: Preferences) => Math.round(weightValue(kg, p) * 10) / 10;
export const weightText = (kg: number, p: Preferences) =>
  weightValue(kg, p).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
export const waterText = (ml: number, p: Preferences) =>
  waterValue(ml, p).toLocaleString('ru-RU', { maximumFractionDigits: p.waterUnit === 'l' ? 3 : 0 });
