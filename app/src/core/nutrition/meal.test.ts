import { describe, expect, it } from 'vitest';
import { scaleNutrients, consistentNutrients } from './meal';
describe('Локальный пересчёт', () => {
  const n = { kcal: 100, protein: 3, fat: 2, carbs: 17.5 };
  it('масштабирует на 150 г', () =>
    expect(scaleNutrients(n, 150)).toEqual({ kcal: 150, protein: 4.5, fat: 3, carbs: 26.25 }));
  it('поддерживает нулевую порцию', () => expect(scaleNutrients(n, 0).kcal).toBe(0));
  it.each([-1, Infinity, NaN, 5001])('отклоняет массу %s', (g) =>
    expect(() => scaleNutrients(n, g)).toThrow(),
  );
  it('исправляет несогласованные ккал', () =>
    expect(consistentNutrients({ ...n, kcal: 400 })).toEqual({ nutrients: n, corrected: true }));
  it('сохраняет согласованные ккал', () => expect(consistentNutrients(n).corrected).toBe(false));
});
