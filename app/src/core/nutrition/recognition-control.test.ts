import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { MealAnalysisSchema, type MealAnalysis } from '@racionika/shared';
import { evaluateRecognition, ReferenceSetSchema } from '../../../../scripts/recognition/evaluate';
import {
  normalizeAnalysis,
  withoutAutomaticAdditions,
  analysisTotals,
  aggregatePer100,
} from './analysis';
import { catalog } from '../catalog';
const raw = JSON.parse(readFileSync('fixtures/recognition/reference-cases.json', 'utf8'));
const ref = ReferenceSetSchema.parse(raw);
function expectedAnalysis(c: (typeof ref.cases)[number]): MealAnalysis {
  return MealAnalysisSchema.parse({
    is_food: true,
    dish_name: c.id,
    confidence: 1,
    cooking_method: 'reference',
    ingredients: c.ingredients.map((i) => ({
      name: i.name,
      grams: i.grams,
      grams_range: [i.grams, i.grams],
      per_100g: i.per100,
      confidence: 1,
    })),
    hidden_additions: { oil_g: 0, salt_g: 0, sugar_g: 0, sauce_kcal: 0, note: '' },
    clarifying_questions: [],
    warnings: [],
  });
}
describe('Контрольные расчётные порции — не проверка фото ИИ', () => {
  for (const c of ref.cases)
    it(c.id, () => {
      const a = withoutAutomaticAdditions(expectedAnalysis(c));
      const t = analysisTotals(a),
        saved = aggregatePer100(a, 0, c.expected.grams);
      expect(t.mealGrams).toBeCloseTo(c.expected.grams, 8);
      for (const k of ['kcal', 'protein', 'fat', 'carbs'] as const) {
        expect(t.nutrients[k]).toBeCloseTo(c.expected.nutrients[k], 8);
        expect((saved.per100[k] * saved.grams) / 100).toBeCloseTo(c.expected.nutrients[k], 8);
      }
      for (const i of c.ingredients)
        if (i.source.kind === 'usda') {
          const original = catalog.find((p) => p.source.id === i.source.id);
          expect(original?.per100).toEqual(i.per100);
        }
    });
  it('синтетическая этикетка не меняется на формулу 4/4/9', () => {
    const c = ref.cases.find((c) => c.id === 'label-not-449')!,
      a = normalizeAnalysis(expectedAnalysis(c));
    expect(a.ingredients[0].per_100g.kcal).toBe(180);
    expect(analysisTotals(a).nutrients.kcal).toBe(81);
    expect(a.warnings.join(' ')).toContain('не изменены');
  });
});
describe('Оценщик не выдаёт фикстуру за измерение точности ИИ', () => {
  const predictions = ref.cases.map((c) => ({ id: c.id, analysis: expectedAnalysis(c) }));
  it('идеальный технический прогон явно помечен fixture', () => {
    const r = evaluateRecognition(raw, { mode: 'fixture', predictions });
    expect(r.coverage).toEqual({ expected: 16, evaluated: 16, complete: 16 });
    expect(r.meanKcalRelativeError).toBeCloseTo(0, 10);
    expect(r.warning).toContain('не результат распознавания ИИ');
  });
  it('пропущенные примеры не скрываются средним', () => {
    const r = evaluateRecognition(raw, { mode: 'recorded', predictions: predictions.slice(0, 1) });
    expect(r.coverage.evaluated).toBe(1);
    expect(r.allCasesHaveRecordedPrediction).toBe(false);
  });
  it('лишние/повторные ингредиенты ухудшают метрики и выявляются', () => {
    const p = structuredClone(predictions);
    p[0].analysis.ingredients.push({ ...p[0].analysis.ingredients[0] });
    const r = evaluateRecognition(raw, { mode: 'recorded', predictions: p });
    expect(r.coverage.complete).toBe(15);
    expect(r.reports[0]).toMatchObject({
      extraIngredients: 1,
      structureIssues: ['duplicate'],
      kcalRelativeError: 1,
    });
  });
  it('не допускает повтор ID и неизвестные ID', () => {
    expect(() =>
      evaluateRecognition(raw, { mode: 'fixture', predictions: [predictions[0], predictions[0]] }),
    ).toThrow('Повтор ID');
    expect(() =>
      evaluateRecognition(raw, {
        mode: 'fixture',
        predictions: [{ ...predictions[0], id: 'unknown' }],
      }),
    ).toThrow('Неизвестный ID');
  });
});

it('платный сборщик не запускается без явного флага', () => {
  const r = spawnSync(process.execPath, ['scripts/recognition/collect.mjs'], { encoding: 'utf8' });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('Без запросов');
});

it('угаданные добавки не считаются чистым ответом, даже если приложение их обнулит', () => {
  const predictions = ref.cases.map((c) => ({ id: c.id, analysis: expectedAnalysis(c) }));
  predictions[0].analysis.hidden_additions.oil_g = 10;
  const r = evaluateRecognition(raw, { mode: 'recorded', predictions });
  expect(r.coverage.complete).toBe(15);
  expect(r.reports[0]).toMatchObject({ guessedExtrasReturned: true, kcalAbsoluteError: 0 });
  expect(r.errorSummary.massGrams.p90).toBe(0);
});
