import { afterEach, expect, it, vi } from 'vitest';
import {
  defaultPreferences,
  loadPreferences,
  PreferencesSchema,
  savePreferences,
  weightKg,
  weightValue,
  waterMl,
  waterValue,
} from './preferences';
afterEach(() => vi.unstubAllGlobals());
it('по умолчанию сохраняет метрические единицы и экономный режим', () => {
  vi.stubGlobal('localStorage', { getItem: () => '{broken' });
  expect(loadPreferences()).toEqual(defaultPreferences);
});
it('не меняет канонические единицы при пересчёте', () => {
  const p = { ...defaultPreferences, weightUnit: 'lb' as const, waterUnit: 'l' as const };
  for (const kg of [25, 80, 105, 350]) expect(weightKg(weightValue(kg, p), p)).toBe(kg);
  for (const ml of [1, 150, 250, 2400, 5000]) expect(waterMl(waterValue(ml, p), p)).toBe(ml);
  expect(waterMl(0.25, p)).toBe(250);
});
it('валидирует настройки и уведомляет интерфейс после сохранения', () => {
  const values = new Map<string, string>();
  const dispatchEvent = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal('window', { dispatchEvent });
  savePreferences({ ...defaultPreferences, quality: 'accurate' });
  expect(loadPreferences().quality).toBe('accurate');
  expect(dispatchEvent).toHaveBeenCalledOnce();
  expect(PreferencesSchema.safeParse({ ...defaultPreferences, waterUnit: 'gallon' }).success).toBe(
    false,
  );
});
