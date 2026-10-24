import { z } from 'zod';
export const APP_VERSION = '0.1.0';
export const API_VERSION = 'v1';
const nonnegative = z.number().finite().min(0);
export const NutrientsSchema = z
  .object({
    kcal: nonnegative.max(1000),
    protein: nonnegative.max(100),
    fat: nonnegative.max(100),
    carbs: nonnegative.max(100),
  })
  .strict();
export const IngredientSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    grams: nonnegative.max(5000),
    grams_range: z
      .tuple([nonnegative.max(5000), nonnegative.max(5000)])
      .refine(([lo, hi]) => lo <= hi),
    per_100g: NutrientsSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();
export const MealAnalysisSchema = z
  .object({
    is_food: z.boolean(),
    dish_name: z.string().max(160),
    confidence: z.number().min(0).max(1),
    cooking_method: z.string().max(60),
    ingredients: z.array(IngredientSchema).max(30),
    hidden_additions: z
      .object({
        oil_g: nonnegative.max(100),
        salt_g: nonnegative.max(20),
        sauce_kcal: nonnegative.max(500),
        sugar_g: nonnegative.max(100).default(0),
        note: z.string().max(500),
      })
      .strict(),
    clarifying_questions: z
      .array(
        z
          .object({
            question: z.string().max(240),
            options: z.array(z.string().max(160)).min(2).max(6),
          })
          .strict(),
      )
      .max(3),
    warnings: z.array(z.string().max(500)).max(10),
  })
  .strict()
  .refine((value) => !value.is_food || value.ingredients.length > 0, {
    message: 'Еда должна содержать ингредиенты',
  });
export const ErrorCodeSchema = z.enum([
  'invalid_token',
  'quota_exceeded',
  'rate_limited',
  'maintenance',
  'upgrade_required',
  'provider_error',
  'provider_timeout',
  'invalid_input',
  'image_too_large',
  'bad_ai_output',
]);
export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: ErrorCodeSchema,
        message_ru: z.string(),
        retry_after: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();
export const RegisterInputSchema = z
  .object({
    deviceId: z.string().uuid(),
    appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    accessCode: z.string().max(128).optional(),
  })
  .strict();
export const HealthSchema = z.object({ status: z.literal('ok'), version: z.string() }).strict();
export type Nutrients = z.infer<typeof NutrientsSchema>;
export type MealAnalysis = z.infer<typeof MealAnalysisSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
