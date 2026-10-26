import type { Table } from 'dexie';
import { CatalogSourceSchema } from './catalog/types';
import { z } from 'zod';
import { MealAnalysisSchema, NutrientsSchema, ProfileSchema } from '@racionika/shared';
import { db } from './db';
import { loadProfile, personalPlan, PROFILE_KEY } from './profile';
import { loadPreferences, PreferencesSchema, PREFERENCES_KEY } from './preferences';
export const day = z
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
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
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
  preferences: PreferencesSchema.optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  integrity: z
    .object({ algorithm: z.literal('SHA-256'), digest: z.string().regex(/^[a-f0-9]{64}$/) })
    .optional(),
});
export type Backup = z.infer<typeof BackupSchema>;
const maxBytes = 20 * 1024 * 1024;
function validate(input: unknown) {
  const backup = BackupSchema.parse(input);
  for (const entries of [
    backup.foodEntries,
    backup.waterLogs,
    backup.chatMessages,
    backup.weightLogs,
    backup.favoriteDishes,
  ]) {
    if (new Set(entries.map((item) => item.id)).size !== entries.length)
      throw new Error('Повторяющиеся ID в резервной копии.');
  }
  return backup;
}
export function parseBackup(text: string) {
  if (new TextEncoder().encode(text).byteLength > maxBytes)
    throw new Error('Резервная копия больше 20 МБ.');
  return validate(JSON.parse(text));
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => JSON.stringify(key) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
async function digest(backup: Backup) {
  const payload = { ...backup, integrity: undefined };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(payload)));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function verify(backup: Backup) {
  if (
    backup.schemaVersion === 5 &&
    (!backup.integrity || backup.integrity.digest !== (await digest(backup)))
  )
    throw new Error('Контрольная сумма не совпадает. Данные не изменены.');
}
export async function readBackup(text: string) {
  const backup = parseBackup(text);
  await verify(backup);
  return backup;
}
export async function exportBackup(): Promise<Backup> {
  const theme = localStorage.getItem('racionika.theme');
  const backup = validate(
    await db.transaction(
      'r',
      [db.foodEntries, db.waterLogs, db.chatMessages, db.weightLogs, db.favoriteDishes],
      async () => ({
        schemaVersion: 5,
        exportedAt: new Date().toISOString(),
        profile: loadProfile(),
        preferences: loadPreferences(),
        theme: theme === 'light' || theme === 'dark' ? theme : 'system',
        foodEntries: await db.foodEntries.toArray(),
        waterLogs: await db.waterLogs.toArray(),
        chatMessages: await db.chatMessages.toArray(),
        weightLogs: await db.weightLogs.toArray(),
        favoriteDishes: await db.favoriteDishes.toArray(),
      }),
    ),
  );
  backup.integrity = { algorithm: 'SHA-256', digest: await digest(backup) };
  if (new TextEncoder().encode(JSON.stringify(backup, null, 2)).byteLength > maxBytes)
    throw new Error('Резервная копия больше 20 МБ.');
  return backup;
}
export async function mergeBackup(
  input: Backup,
  options: { keepExisting?: boolean; restoreProfile?: boolean; restoreSettings?: boolean } = {},
) {
  const backup = validate(input);
  await verify(backup);
  if (
    options.restoreProfile &&
    backup.profile?.customCalories !== undefined &&
    personalPlan(backup.profile).status !== 'ready'
  )
    throw new Error('Проверьте цель калорий в импортируемом профиле.');
  const changes: [string, string][] = [];
  if (options.restoreProfile && backup.profile)
    changes.push([PROFILE_KEY, JSON.stringify(backup.profile)]);
  if (options.restoreSettings && backup.preferences)
    changes.push([PREFERENCES_KEY, JSON.stringify(backup.preferences)]);
  if (options.restoreSettings && backup.theme) changes.push(['racionika.theme', backup.theme]);
  const previous = changes.map(([key]) => [key, localStorage.getItem(key)] as const);
  let settingsWritten = false;
  try {
    await db.transaction(
      'rw',
      [db.foodEntries, db.waterLogs, db.chatMessages, db.weightLogs, db.favoriteDishes],
      async () => {
        // Keep all table changes atomic. Existing rows are overwritten only when requested.
        async function put<T extends { id: string }>(table: Table<T, string>, entries: T[]) {
          const existing = options.keepExisting
            ? await table.bulkGet(entries.map((item) => item.id))
            : [];
          const selected = options.keepExisting
            ? entries.filter((_, index) => !existing[index])
            : entries;
          await table.bulkPut(selected);
        }
        await put(db.foodEntries, backup.foodEntries);
        await put(db.waterLogs, backup.waterLogs);
        await put(db.chatMessages, backup.chatMessages);
        await put(db.weightLogs, backup.weightLogs);
        await put(db.favoriteDishes, backup.favoriteDishes);
        settingsWritten = true;
        for (const [key, value] of changes) localStorage.setItem(key, value);
      },
    );
  } catch (error) {
    if (settingsWritten)
      for (const [key, value] of previous) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
    throw error;
  }
  if (options.restoreSettings && backup.theme) {
    if (backup.theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = backup.theme;
  }
  if (options.restoreProfile && backup.profile)
    window.dispatchEvent(new Event('racionika:profile'));
  if (options.restoreSettings) window.dispatchEvent(new Event('racionika:preferences'));
}
