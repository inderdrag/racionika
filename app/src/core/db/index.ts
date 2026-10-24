import Dexie, { type Table } from 'dexie';
import type { Nutrients, MealAnalysis, AnalysisResponse } from '@racionika/shared';
export interface FoodEntry {
  id: string;
  day: string;
  name: string;
  grams: number;
  per100: Nutrients;
  createdAt: string;
  analysis?: MealAnalysis;
  additionsLevel?: number;
  source?: 'ai' | 'demo' | 'manual' | 'label';
  baseGrams?: number;
}

export interface WeightLog {
  id: string;
  day: string;
  kg: number;
  createdAt: string;
}
export interface WaterLog {
  id: string;
  day: string;
  ml: number;
  createdAt: string;
}
// Миграция v2 сохраняет ручные записи v1 и добавляет кэш и историю ИИ.
export interface AiCache {
  hash: string;
  createdAt: number;
  response: AnalysisResponse;
}
export interface ChatMessage {
  id: string;
  createdAt: string;
  role: 'user' | 'assistant';
  text: string;
  demo?: boolean;
}
export class DiaryDatabase extends Dexie {
  foodEntries!: Table<FoodEntry, string>;
  weightLogs!: Table<WeightLog, string>;
  waterLogs!: Table<WaterLog, string>;
  aiCache!: Table<AiCache, string>;
  chatMessages!: Table<ChatMessage, string>;
  constructor() {
    super('racionika');
    this.version(1).stores({ foodEntries: 'id, day, createdAt', waterLogs: 'id, day, createdAt' });
    this.version(2).stores({
      foodEntries: 'id, day, createdAt',
      waterLogs: 'id, day, createdAt',
      aiCache: 'hash, createdAt',
      chatMessages: 'id, createdAt',
    });
    this.version(3).stores({
      foodEntries: 'id, day, createdAt',
      waterLogs: 'id, day, createdAt',
      aiCache: 'hash, createdAt',
      chatMessages: 'id, createdAt',
      weightLogs: 'id, day, createdAt',
    });
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
