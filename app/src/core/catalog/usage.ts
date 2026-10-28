import type { FoodEntry } from '../db';
import type { CatalogProduct } from './types';
export interface ProductUsage {
  count: number;
  lastAt: string;
  grams: number;
}
export function sourceKey(source: FoodEntry['catalogSource']) {
  return source ? `${source.provider}-${source.id}` : '';
}
export function productUsage(entries: FoodEntry[]) {
  const usage = new Map<string, ProductUsage>();
  for (const entry of entries) {
    if (
      entry.source === 'demo' ||
      !entry.catalogSource ||
      entry.analysis ||
      !Number.isFinite(entry.grams) ||
      entry.grams < 1 ||
      entry.grams > 5000
    )
      continue;
    const key = sourceKey(entry.catalogSource),
      old = usage.get(key);
    usage.set(key, {
      count: (old?.count ?? 0) + 1,
      ...(old && old.lastAt > entry.createdAt
        ? { lastAt: old.lastAt, grams: old.grams }
        : { lastAt: entry.createdAt, grams: entry.grams }),
    });
  }
  return usage;
}
export function rankByUsage(products: CatalogProduct[], usage: Map<string, ProductUsage>) {
  return products
    .map((product, order) => ({ product, order, usage: usage.get(sourceKey(product.source)) }))
    .sort(
      (a, b) =>
        Number(!!b.usage) - Number(!!a.usage) ||
        (b.usage?.lastAt ?? '').slice(0, 10).localeCompare((a.usage?.lastAt ?? '').slice(0, 10)) ||
        (b.usage?.count ?? 0) - (a.usage?.count ?? 0) ||
        a.order - b.order,
    )
    .map((item) => item.product);
}
export function shortForm(product: CatalogProduct) {
  return {
    raw: 'сырой',
    cooked: 'готовый',
    dry: 'сухой',
    frozen: 'замороженный',
    canned: 'консервы',
    ready: product.source.provider === 'off' ? 'с упаковки' : 'вид не уточнён',
  }[product.form];
}
