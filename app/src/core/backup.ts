import { CatalogSourceSchema } from './catalog/types';
import { z } from 'zod';
import { MealAnalysisSchema, NutrientsSchema, ProfileSchema } from '@racionika/shared';
import { db } from './db';
import { loadProfile } from './profile';
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
  });
const id = z.string().min(1).max(128);
const timestamp = z.string().datetime({ offset: true });
const food = z.object({
  id,
  day,
  name: z.string().min(1).max(160),
  grams: z.number().finite().min(0).max(300000),
  per100: NutrientsSchema,
  createdAt: timestamp,
  analysis: MealAnalysisSchema.optional(),
  additionsLevel: z.number().min(0).max(1.5).optional(),
  source: z.enum(['ai', 'demo', 'manual', 'label']).optional(),
  catalogSource: CatalogSourceSchema.optional(),
  baseGrams: z.number().finite().min(0).max(150000).optional(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  eatenTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  note: z.string().max(1000).optional(),
});
const water = z.object({ id, day, ml: z.number().int().min(1).max(10000), createdAt: timestamp });
const chat = z.object({
  id,
  createdAt: timestamp,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(20000),
  demo: z.boolean().optional(),
});
const weight = z.object({ id, day, kg: z.number().min(25).max(350), createdAt: timestamp });
export const BackupSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  exportedAt: timestamp.optional(),
  foodEntries: z.array(food).max(50000),
  waterLogs: z.array(water).max(50000),
  chatMessages: z.array(chat).max(50000).default([]),
  weightLogs: z.array(weight).max(50000).default([]),
  favoriteDishes: z
    .array(z.object({ id, entry: food, createdAt: timestamp }))
    .max(10000)
    .default([]),
  profile: ProfileSchema.nullable().optional(),
});
export type Backup = z.infer<typeof BackupSchema>;
export function parseBackup(text: string) {
  if (text.length > 20 * 1024 * 1024) throw new Error('Резервная копия больше 20 МБ.');
  return BackupSchema.parse(JSON.parse(text));
}
export async function exportBackup() {
  return {
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    profile: loadProfile(),
    foodEntries: await db.foodEntries.toArray(),
    waterLogs: await db.waterLogs.toArray(),
    chatMessages: await db.chatMessages.toArray(),
    weightLogs: await db.weightLogs.toArray(),
    favoriteDishes: await db.favoriteDishes.toArray(),
  };
}
export async function mergeBackup(input: Backup) {
  const backup = BackupSchema.parse(input);
  await db.transaction(
    'rw',
    [db.foodEntries, db.waterLogs, db.chatMessages, db.weightLogs, db.favoriteDishes],
    async () => {
      await db.foodEntries.bulkPut(backup.foodEntries);
      await db.waterLogs.bulkPut(backup.waterLogs);
      await db.chatMessages.bulkPut(backup.chatMessages);
      await db.weightLogs.bulkPut(backup.weightLogs);
      await db.favoriteDishes.bulkPut(backup.favoriteDishes);
    },
  );
}
