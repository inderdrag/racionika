import Dexie, { type Table } from 'dexie';
import type { Nutrients } from '@racionika/shared';
export interface FoodEntry {
  id: string;
  day: string;
  name: string;
  grams: number;
  per100: Nutrients;
  createdAt: string;
}
export interface WaterLog {
  id: string;
  day: string;
  ml: number;
  createdAt: string;
}
// Стартовая схема только для прототипа. Расширение схемы — отдельная миграция фазы 1.
export class DiaryDatabase extends Dexie {
  foodEntries!: Table<FoodEntry, string>;
  waterLogs!: Table<WaterLog, string>;
  constructor() {
    super('racionika');
    this.version(1).stores({ foodEntries: 'id, day, createdAt', waterLogs: 'id, day, createdAt' });
  }
}
export const db = new DiaryDatabase();
export function localDay(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
