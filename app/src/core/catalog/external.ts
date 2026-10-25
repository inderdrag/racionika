import { getPlatform } from '../platform';
import {
  CatalogProductSchema,
  CatalogSourceSchema,
  type CatalogProduct,
  type CatalogSource,
} from './types';
import { normalizeFoodQuery } from './index';
class CatalogLookupError extends Error {}
export interface ExternalFoodHit {
  id: string;
  name: string;
  source: CatalogSource;
  needsDetails: true;
}
export type CatalogSearchResult = CatalogProduct | ExternalFoodHit;
const cache = new Map<string, { at: number; products: CatalogSearchResult[] }>();
const lastRequest = { search: -Infinity, product: -Infinity };
const fields =
  'code,product_name,product_name_ru,product_name_en,brands,nutriments,nutrition_data_per';
const validCode = (code: string) => /^\d{8}(?:\d{4,6})?$/.test(code);
function productName(p: Record<string, unknown>) {
  const rawName = p.product_name_ru || p.product_name || p.product_name_en;
  if (typeof rawName !== 'string' || !rawName.trim()) return null;
  const brands =
    typeof p.brands === 'string'
      ? p.brands
      : Array.isArray(p.brands)
        ? p.brands.filter((b) => typeof b === 'string').join(', ')
        : '';
  return `${rawName.trim()}${brands.trim() ? ` · ${brands.trim()}` : ''}`.slice(0, 160);
}
export function parseExternalProduct(input: unknown): CatalogProduct | null {
  if (!input || typeof input !== 'object') return null;
  const p = input as Record<string, unknown>;
  // Do not infer missing nutrients as zero, or silently convert a serving to grams.
  if (p.nutrition_data_per !== '100g' || !validCode(String(p.code))) return null;
  if (!p.nutriments || typeof p.nutriments !== 'object') return null;
  const n = p.nutriments as Record<string, unknown>;
  const value = (key: string) => (typeof n[key] === 'number' ? (n[key] as number) : NaN);
  const kcal =
    n['energy-kcal_100g'] !== undefined
      ? value('energy-kcal_100g')
      : value('energy-kj_100g') / 4.184;
  const name = productName(p);
  if (!name) return null;
  const result = CatalogProductSchema.safeParse({
    id: `off-${p.code}`,
    name,
    category: 'Внешний справочник',
    form: 'ready',
    preparation: 'проверьте упаковку',
    per100: {
      kcal,
      protein: value('proteins_100g'),
      fat: value('fat_100g'),
      carbs: value('carbohydrates_100g'),
    },
    source: { provider: 'off', id: String(p.code), description: name, release: 'Open Food Facts' },
  });
  return result.success ? result.data : null;
}
function parseHit(input: unknown): ExternalFoodHit | null {
  if (!input || typeof input !== 'object') return null;
  const p = input as Record<string, unknown>;
  const name = productName(p);
  if (!name || !validCode(String(p.code))) return null;
  const source = CatalogSourceSchema.parse({
    provider: 'off',
    id: String(p.code),
    description: name,
    release: 'Open Food Facts',
  });
  // Search index fields are not enough to confirm units/completeness. Fetch details on selection.
  return { id: `off-${p.code}`, name, source, needsDetails: true };
}
export async function searchExternalFoods(
  query: string,
  signal: AbortSignal,
): Promise<CatalogSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 120)
    throw new CatalogLookupError('Введите название или штрихкод: 2–120 символов.');
  signal.throwIfAborted();
  const key = normalizeFoodQuery(trimmed);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 3_600_000) return structuredClone(cached.products);
  if (!navigator.onLine) throw new CatalogLookupError('Нет интернета. Офлайн-база доступна.');
  const barcode = validCode(trimmed);
  const kind = barcode ? 'product' : 'search';
  if (Date.now() - lastRequest[kind] < (barcode ? 4500 : 7000))
    throw new CatalogLookupError('Подождите несколько секунд перед новым поиском.');
  lastRequest[kind] = Date.now();
  const url = barcode
    ? new URL(`/api/v2/product/${trimmed}.json`, 'https://world.openfoodfacts.org')
    : new URL('/search', 'https://search.openfoodfacts.org');
  if (barcode) url.searchParams.set('fields', fields);
  else {
    url.searchParams.set('q', trimmed);
    url.searchParams.set('page_size', '15');
    // The public endpoint currently collapses repeated fields/langs parameters.
    // Keep its default projection; only validated names and IDs are used below.
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const request = (await getPlatform()).http.request(url.href, {
      method: 'GET',
      headers: { 'User-Agent': 'Racionika/0.3.0 (https://github.com/inderdrag)' },
      signal,
    });
    const response = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new CatalogLookupError(
                'Справочник не ответил. Попробуйте позже или используйте офлайн-базу.',
              ),
            ),
          15000,
        );
        abort = () => reject(new DOMException('Поиск отменён', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
    signal.throwIfAborted();
    if (response.status === 404 && barcode) return [];
    if (response.status === 429)
      throw new CatalogLookupError('Справочник ограничил поиск. Повторите через минуту.');
    if (response.status !== 200)
      throw new CatalogLookupError('Внешний справочник временно недоступен. Офлайн-база работает.');
    if (!response.data || typeof response.data !== 'object')
      throw new CatalogLookupError('Справочник вернул некорректный ответ.');
    const data = response.data as { product?: unknown; hits?: unknown[]; status?: number };
    if (!barcode && !Array.isArray(data.hits))
      throw new CatalogLookupError('Справочник вернул некорректный ответ.');
    const products: CatalogSearchResult[] = barcode
      ? data.status === 1
        ? [parseExternalProduct(data.product)].filter((p): p is CatalogProduct => p !== null)
        : []
      : data.hits!.slice(0, 15).flatMap((p) => {
          const hit = parseHit(p);
          return hit ? [hit] : [];
        });
    const unique = [...new Map(products.map((p) => [p.id, p])).values()];
    cache.set(key, { at: Date.now(), products: unique });
    if (cache.size > 30) cache.delete(cache.keys().next().value!);
    return structuredClone(unique);
  } catch (error) {
    if (signal.aborted) throw new DOMException('Поиск отменён', 'AbortError');
    if (error instanceof CatalogLookupError) throw error;
    throw new CatalogLookupError(
      'Внешний справочник временно недоступен. Попробуйте позже или используйте офлайн-базу.',
      { cause: error },
    );
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
  }
}
export async function loadExternalFood(code: string, signal: AbortSignal): Promise<CatalogProduct> {
  if (!validCode(code)) throw new CatalogLookupError('Некорректный штрихкод.');
  const results = await searchExternalFoods(code, signal);
  const product = results.find((p): p is CatalogProduct => !('needsDetails' in p));
  if (!product)
    throw new CatalogLookupError(
      'В карточке нет полных КБЖУ на 100 г. Выберите другой продукт или внесите данные с упаковки вручную.',
    );
  return product;
}
