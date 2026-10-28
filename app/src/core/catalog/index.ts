import { CatalogProductSchema, type CatalogProduct } from './types';
import curatedData from './usda.json';
import expandedData from './generated.json';
const forms: CatalogProduct['form'][] = ['raw', 'cooked', 'dry', 'frozen', 'canned', 'ready'];
type PackedRow = [string, string, number, number, number, number, number, number, string, number];
const expanded = expandedData as unknown as {
  categories: string[];
  releases: string[];
  rows: PackedRow[];
};
export const catalog: CatalogProduct[] = [
  ...curatedData.map((item) => CatalogProductSchema.parse(item)),
  ...expanded.rows.map(
    ([id, name, category, form, kcal, protein, fat, carbs, description, release]) =>
      CatalogProductSchema.parse({
        id: `usda-${id}`,
        name,
        category: expanded.categories[category],
        form: forms[form],
        preparation: (
          {
            raw: 'сырой',
            cooked: 'приготовленный',
            dry: 'сухой',
            frozen: 'замороженный',
            canned: 'консервированный',
            ready: 'вид не уточнён',
          } as const
        )[forms[form]],
        per100: { kcal, protein, fat, carbs },
        source: { provider: 'usda', id, description, release: expanded.releases[release] },
      }),
  ),
];
export const catalogCategories = [...new Set(catalog.map((item) => item.category))].sort((a, b) =>
  a.localeCompare(b, 'ru'),
);
export function normalizeFoodQuery(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .trim();
}
const aliases: Record<string, string> = {
  гречка: 'гречнев',
  перловка: 'перлов',
  овсянка: 'овся',
  помидор: 'томат',
  помидоры: 'томат',
  индейка: 'индейк',
  творог: 'творож',
  картошка: 'картоф',
  кабачок: 'кабач',
  яйцо: 'яйц',
  яйца: 'яйц',
  орехи: 'орех',
  фасоли: 'фасол',
  вареный: 'приготовленный',
  вареная: 'приготовленный',
  вареное: 'приготовленный',
  отварной: 'приготовленный',
  отварная: 'приготовленный',
  вареные: 'приготовленный',
};
function term(word: string) {
  if (/^кур(иц|ин|ят)|^цыпл/u.test(word)) return 'куриц';
  if (/^овся(н|нк)/u.test(word)) return 'овся';
  if (/^греч(к|нев)/u.test(word)) return 'гречнев';
  if (/^инд(ей|юш)/u.test(word)) return 'индейк';
  if (/^помидор/u.test(word)) return 'томат';
  if (/^творо(г|ж)/u.test(word)) return 'творож';
  return aliases[word] ?? word;
}
// Normalize and tokenize once, not for every keystroke and every record.
const index = catalog.map((product, position) => ({
  product,
  position,
  name: normalizeFoodQuery(product.name),
  words: [
    ...new Set(
      normalizeFoodQuery(
        `${product.name} ${product.preparation} ${product.source.description} ${product.id} ${product.form === 'cooked' ? 'приготовленный' : ''}`,
      )
        .split(' ')
        .filter(Boolean)
        .map(term),
    ),
  ],
}));
const cache = new Map<string, CatalogProduct[]>();
export function searchCatalog(query: string, category = '', form = '') {
  const normalized = normalizeFoodQuery(query).slice(0, 240);
  const key = JSON.stringify([normalized, category, form]);
  const cached = cache.get(key);
  if (cached) return [...cached];
  const tokens = [...new Set(normalized.split(' ').filter(Boolean).map(term))];
  const ranked = index.filter(
    ({ product, words }) =>
      (!category || product.category === category) &&
      (!form || product.form === form) &&
      tokens.every((token) => words.some((word) => word.startsWith(token))),
  );
  const score = (item: (typeof index)[number]) =>
    (item.name === normalized ? 1000 : item.name.startsWith(normalized) ? 200 : 0) +
    (item.position < curatedData.length ? 20 : 0);
  ranked.sort(
    (a, b) =>
      score(b) - score(a) ||
      a.product.name.localeCompare(b.product.name, 'ru') ||
      a.product.id.localeCompare(b.product.id),
  );
  const result = ranked.map((item) => item.product);
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return [...result];
}
