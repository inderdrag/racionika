import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  MealAnalysisSchema,
  NutrientsSchema,
  normalizedIngredientName,
  reviewMealComposition,
} from '../../packages/shared/src/index.js';
const Ingredient = z.object({
  name: z.string(),
  aliases: z.array(z.string()).min(1),
  grams: z.number().nonnegative(),
  per100: NutrientsSchema,
  source: z.object({ kind: z.string() }).passthrough(),
});
// Total nutrients are allowed to exceed per-100g bounds in a portion.
const TotalNutrients = z.object({
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
});
export const ReferenceSetSchema = z.object({
  version: z.literal(1),
  scope: z.string(),
  cases: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        text: z.string(),
        ingredients: z.array(Ingredient),
        expected: z.object({ grams: z.number(), nutrients: TotalNutrients }),
      }),
    )
    .min(1),
});
export const PredictionSetSchema = z.object({
  mode: z.enum(['live', 'recorded', 'fixture']),
  predictions: z.array(z.object({ id: z.string(), analysis: MealAnalysisSchema })),
});
export function evaluateRecognition(referenceInput: unknown, predictionInput: unknown) {
  const ref = ReferenceSetSchema.parse(referenceInput),
    input = PredictionSetSchema.parse(predictionInput);
  if (
    new Set(ref.cases.map((c) => c.id)).size !== ref.cases.length ||
    new Set(input.predictions.map((c) => c.id)).size !== input.predictions.length
  )
    throw new Error('Повтор ID контрольного примера.');
  const expectedIds = new Set(ref.cases.map((c) => c.id));
  if (input.predictions.some((p) => !expectedIds.has(p.id)))
    throw new Error('Неизвестный ID прогноза.');
  const reports = ref.cases.map((c) => {
    const candidate = input.predictions.find((p) => p.id === c.id);
    if (!candidate) return { id: c.id, status: 'missing' as const };
    const a = candidate.analysis;
    const unused = new Set(a.ingredients.map((_, i) => i));
    const pairs = c.ingredients.map((expected) => {
      const aliases = new Set(expected.aliases.map(normalizedIngredientName));
      const index = [...unused].find((i) =>
        aliases.has(normalizedIngredientName(a.ingredients[i].name)),
      );
      if (index === undefined) return { name: expected.name, matched: false as const };
      unused.delete(index);
      return {
        name: expected.name,
        matched: true as const,
        gramsAbsoluteError: Math.abs(a.ingredients[index].grams - expected.grams),
      };
    });
    const total = TotalNutrients.parse(
      Object.fromEntries(
        (['kcal', 'protein', 'fat', 'carbs'] as const).map((k) => [
          k,
          a.ingredients.reduce((sum, r) => sum + (r.per_100g[k] * r.grams) / 100, 0),
        ]),
      ),
    );
    const mass = a.ingredients.reduce((sum, r) => sum + r.grams, 0);
    const issues = reviewMealComposition(a);
    return {
      id: c.id,
      status: 'evaluated' as const,
      isFood: a.is_food,
      ingredientPairs: pairs,
      missingIngredients: pairs.filter((p) => !p.matched).length,
      extraIngredients: unused.size,
      structureIssues: issues.map((i) => i.code),
      guessedExtrasReturned: Object.entries(a.hidden_additions).some(
        ([k, v]) => k !== 'note' && typeof v === 'number' && v > 0,
      ),
      massAbsoluteError: Math.abs(mass - c.expected.grams),
      kcalAbsoluteError: Math.abs(total.kcal - c.expected.nutrients.kcal),
      kcalRelativeError:
        Math.abs(total.kcal - c.expected.nutrients.kcal) / Math.max(c.expected.nutrients.kcal, 1),
      nutrientAbsoluteErrors: Object.fromEntries(
        (['protein', 'fat', 'carbs'] as const).map((k) => [
          k,
          Math.abs(total[k] - c.expected.nutrients[k]),
        ]),
      ),
    };
  });
  const evaluated = reports.filter((r) => r.status === 'evaluated');
  const complete = evaluated.filter(
    (r) =>
      r.isFood &&
      !r.missingIngredients &&
      !r.extraIngredients &&
      !r.structureIssues.length &&
      !r.guessedExtrasReturned,
  );
  const percentile = (values: number[], fraction: number) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
  };
  return {
    mode: input.mode,
    errorSummary: {
      massGrams: {
        median: percentile(
          evaluated.map((r) => r.massAbsoluteError),
          0.5,
        ),
        p90: percentile(
          evaluated.map((r) => r.massAbsoluteError),
          0.9,
        ),
      },
      kcalRelative: {
        median: percentile(
          evaluated.map((r) => r.kcalRelativeError),
          0.5,
        ),
        p90: percentile(
          evaluated.map((r) => r.kcalRelativeError),
          0.9,
        ),
      },
    },
    scope: ref.scope,
    warning:
      input.mode === 'fixture'
        ? 'FIXTURE: проверка расчёта и оценщика, не результат распознавания ИИ.'
        : 'Набор описаний не доказывает точность по фотографиям; реальные снимки проверяются отдельно.',
    coverage: {
      expected: ref.cases.length,
      evaluated: evaluated.length,
      complete: complete.length,
    },
    meanKcalRelativeError: evaluated.length
      ? evaluated.reduce((s, r) => s + r.kcalRelativeError, 0) / evaluated.length
      : null,
    allCasesHaveRecordedPrediction: evaluated.length === ref.cases.length,
    reports,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2),
    at = (key: string) => args[args.indexOf(key) + 1];
  if (!args.includes('--predictions') || !at('--predictions'))
    throw new Error(
      'Укажите --predictions файл.json [--reference файл.json] [--output отчёт.json]. Сетевых запросов нет.',
    );
  const report = evaluateRecognition(
    JSON.parse(
      readFileSync(
        args.includes('--reference')
          ? at('--reference')
          : 'fixtures/recognition/reference-cases.json',
        'utf8',
      ),
    ),
    JSON.parse(readFileSync(at('--predictions'), 'utf8')),
  );
  if (args.includes('--output'))
    writeFileSync(at('--output'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        coverage: report.coverage,
        meanKcalRelativeError: report.meanKcalRelativeError,
        warning: report.warning,
      },
      null,
      2,
    ),
  );
}
