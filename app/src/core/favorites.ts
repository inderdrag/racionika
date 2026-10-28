import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db, type FoodEntry, type FavoriteDish } from './db';
import { prepareDishForReuse } from './diary';
import { ingredientsOf } from './meal-composer';

const nameKey = (name: string) => name.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
const rounded = (n: number) => Math.round(n * 1e6) / 1e6;
// Ignore portion, meal date, confidence and notes: a product stays liked at any weight.
export function favoriteKey(entry: FoodEntry) {
  const parts = ingredientsOf(entry);
  const mass = parts.reduce((sum, p) => sum + p.grams, 0);
  return JSON.stringify({
    name: nameKey(entry.name),
    demo: entry.source === 'demo',
    parts: parts
      .map((p) => ({
        name: nameKey(p.name),
        ratio: rounded(mass ? p.grams / mass : 0),
        nutrients: Object.fromEntries(
          (['kcal', 'protein', 'fat', 'carbs'] as const).map((k) => [k, rounded(p.per_100g[k])]),
        ),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}
export function uniqueFavorites(items: FavoriteDish[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = favoriteKey(item.entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export async function toggleFavorite(entry: FoodEntry) {
  const key = favoriteKey(entry);
  await db.transaction('rw', db.favoriteDishes, async () => {
    const items = await db.favoriteDishes.toArray();
    const same = items.filter((item) => favoriteKey(item.entry) === key);
    if (same.length) await db.favoriteDishes.bulkDelete(same.map((item) => item.id));
    else {
      if (items.length >= 10000) throw new Error('В избранном слишком много продуктов.');
      await db.favoriteDishes.add({
        id: crypto.randomUUID(),
        entry: structuredClone(prepareDishForReuse(entry)),
        createdAt: new Date().toISOString(),
      });
    }
  });
}
export function useFavorites() {
  const [items, setItems] = useState<FavoriteDish[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const sub = liveQuery(() =>
      db.favoriteDishes.orderBy('createdAt').reverse().toArray(),
    ).subscribe({
      next: (value) => {
        setItems(uniqueFavorites(value));
        setError('');
      },
      error: () => setError('Не удалось открыть избранное.'),
    });
    return () => sub.unsubscribe();
  }, []);
  return { items, error };
}
