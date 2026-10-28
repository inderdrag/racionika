import data from './portions.json';
import type { CatalogSource } from './types';
export interface PortionMeasure {
  label: string;
  grams: number;
  sourceRow: string;
  original: string;
}
export function portionMeasures(source?: CatalogSource): PortionMeasure[] {
  if (source?.provider !== 'usda') return [];
  return data
    .filter((row) => row[0] === source.id)
    .map((row) => ({
      label: String(row[1]),
      grams: Number(row[2]),
      sourceRow: String(row[3]),
      original: String(row[4]),
    }));
}
export function portionGrams(count: number, weight: number) {
  if (!Number.isFinite(count) || !Number.isFinite(weight) || count <= 0 || weight <= 0) return '';
  const grams = Math.round(count * weight * 10) / 10;
  return grams >= 1 && grams <= 5000 ? String(grams) : '';
}
