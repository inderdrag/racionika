import { z } from 'zod';
export const APP_VERSION = '0.3.0';
export const API_VERSION = 'v1';
const nonnegative = z.number().finite().min(0);
export const NutrientsSchema = z
  .object({
    kcal: nonnegative.max(1000),
    protein: nonnegative.max(100),
    fat: nonnegative.max(100),
    carbs: nonnegative.max(100),
  })
  .strict()
  .refine((value) => value.protein + value.fat + value.carbs <= 100.1, {
    message: 'БЖУ на 100 г не могут превышать 100 г',
  });
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

export const QualitySchema = z.enum(['fast', 'accurate']);
export const AnalyzeTextSchema = z
  .object({
    text: z.string().trim().min(2).max(2000),
    hint: z.string().max(500).default(''),
    quality: QualitySchema.default('fast'),
  })
  .strict();
export const AnalyzeMealSchema = z
  .object({
    images: z
      .array(
        z
          .object({ mimeType: z.literal('image/jpeg'), data: z.string().min(4).max(2097152) })
          .strict(),
      )
      .min(1)
      .max(3),
    hint: z.string().max(500).default(''),
    quality: QualitySchema.default('fast'),
  })
  .strict();
export const LookupInputSchema = z.object({ name: z.string().trim().min(2).max(160) }).strict();
export const LookupResultSchema = z
  .object({
    name: z.string().min(1).max(160),
    per_100g: NutrientsSchema,
    typical_grams: z.number().min(1).max(2000),
    warning: z.string().max(500),
  })
  .strict();
export const CoachInputSchema = z
  .object({
    message: z.string().trim().min(1).max(1500),
    summary: z.string().max(6000),
    goal: z.enum(['lose', 'maintain', 'gain']).default('maintain'),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(1500) }).strict())
      .max(10),
  })
  .strict();
export const CoachResultSchema = z.object({ text: z.string().min(1).max(6000) }).strict();
export const UsageSchema = z
  .object({
    analyses: z.number().int().nonnegative(),
    analysis_limit: z.number().int().positive(),
    lookups: z.number().int().nonnegative(),
    lookup_limit: z.number().int().positive(),
    chat: z.number().int().nonnegative(),
    chat_limit: z.number().int().positive(),
    resets_at: z.string(),
  })
  .strict();
export const ProviderUsageSchema = z
  .object({
    input_tokens: z.number().nonnegative(),
    output_tokens: z.number().nonnegative(),
    estimated_cost_usd: z.number().nonnegative().nullable(),
  })
  .strict();
export const AnalysisResponseSchema = z
  .object({
    analysis: MealAnalysisSchema,
    demo: z.boolean(),
    usage: ProviderUsageSchema,
    daily: UsageSchema,
  })
  .strict();
export const LookupResponseSchema = z
  .object({
    food: LookupResultSchema,
    demo: z.boolean(),
    usage: ProviderUsageSchema,
    daily: UsageSchema,
  })
  .strict();
export const CoachResponseSchema = z
  .object({
    reply: CoachResultSchema,
    demo: z.boolean(),
    usage: ProviderUsageSchema,
    daily: UsageSchema,
  })
  .strict();
export const ConfigSchema = z
  .object({
    mode: z.enum(['real', 'demo', 'disabled']),
    access_code_required: z.boolean(),
    min_app_version: z.string(),
    provider: z.string(),
    maintenance: z.boolean(),
  })
  .strict();
export const RegisterResponseSchema = z
  .object({ token: z.string().min(10), daily: UsageSchema })
  .strict();
export type Quality = z.infer<typeof QualitySchema>;
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;
export type PublicConfig = z.infer<typeof ConfigSchema>;
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;

export { ProfileSchema, type UserProfile } from './profile.js';
