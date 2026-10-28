import { CatalogProductSchema, type CatalogProduct } from './types';
import curatedData from './usda.json';
import expandedData from './generated.json';
import russianData from './generated-ru.json';
import { improveUsdaName } from './localization';
const usedNames = new Set(curatedData.map((p) => p.name));
function uniqueName(name: string, id: string) {
  let result = name;
  if (name.length > 160 || usedNames.has(name)) result = name.slice(0, 139).trim() + ` [${id}]`;
  usedNames.add(result);
  return result;
}
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
        name: uniqueName(improveUsdaName(name, description), id),
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
  ...(russianData as (string | number)[][]).map(
    ([id, name, category, kcal, protein, fat, carbs, description]) =>
      CatalogProductSchema.parse({
        id: `off-${id}`,
        name: uniqueName(String(name), String(id)),
        category,
        form: 'ready',
        preparation: 'проверьте упаковку',
        per100: { kcal, protein, fat, carbs },
        source: { provider: 'off', id, description, release: 'Open Food Facts · российский рынок' },
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
  творк: 'творож',
  тв: 'творож',
  кур: 'куриц',
  греч: 'гречнев',
  простокв: 'простоквашино',
  вкусвил: 'вкусвилл',
  prostokvashino: 'простоквашино',
  miratorg: 'мираторг',
  danone: 'данон',
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
  пельмени: 'пельмен',
  сырники: 'сырник',
  ряженка: 'ряжен',
  сметана: 'сметан',
  vkusvill: 'вкусвилл',
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
const vocabulary = [...new Set(index.flatMap((item) => item.words))].sort();
function oneEdit(a: string, b: string) {
  if (a === b) return true;
  if (a.length === b.length) {
    const diff = [...a].map((c, i) => (c === b[i] ? -1 : i)).filter((i) => i >= 0);
    return (
      diff.length === 1 ||
      (diff.length === 2 &&
        diff[1] === diff[0] + 1 &&
        a[diff[0]] === b[diff[1]] &&
        a[diff[1]] === b[diff[0]])
    );
  }
  const shorter = a.length < b.length ? a : b,
    longer = a.length < b.length ? b : a;
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  return shorter.slice(i) === longer.slice(i + 1);
}
const cache = new Map<string, CatalogProduct[]>();
export function searchCatalog(query: string, category = '', form = '') {
  const normalized = normalizeFoodQuery(query).slice(0, 240);
  const key = JSON.stringify([normalized, category, form]);
  const cached = cache.get(key);
  if (cached) return [...cached];
  const tokens = [...new Set(normalized.split(' ').filter(Boolean).map(term))];
  let ranked = index.filter(
    ({ product, words }) =>
      (!category || product.category === category) &&
      (!form || product.form === form) &&
      tokens.every((token) =>
        words.some((word) => (/\d/.test(token) ? word === token : word.startsWith(token))),
      ),
  );
  // Fuzzy fallback only when the ordinary search found nothing. Never fuzz barcodes or numbers.
  if (!ranked.length && tokens.some((t) => /^[а-яa-z]{4,}$/u.test(t))) {
    const alternatives = tokens.map((token) => {
      if (!/^[а-яa-z]{4,}$/u.test(token)) return new Set([token]);
      const candidates = vocabulary.filter(
        (word) => Math.abs(word.length - token.length) <= 1 && oneEdit(token, word),
      );
      return new Set([token, ...candidates.slice(0, 12)]);
    });
    ranked = index.filter(
      ({ product, words }) =>
        (!category || product.category === category) &&
        (!form || product.form === form) &&
        alternatives.every((options) => words.some((w) => options.has(w))),
    );
  }
  const score = (item: (typeof index)[number]) =>
    (item.name === normalized ? 1000 : item.name.startsWith(normalized) ? 200 : 0) +
    (item.position < curatedData.length ? 20 : item.product.source.provider === 'off' ? 10 : 0);
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
