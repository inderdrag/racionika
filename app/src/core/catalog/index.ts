import { CatalogProductSchema, type CatalogProduct } from './types';
import data from './usda.json';
export const catalog: CatalogProduct[] = data.map((item) => CatalogProductSchema.parse(item));
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
  курица: 'курин',
  курицу: 'курин',
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
};
export function searchCatalog(query: string, category = '', form = '') {
  const tokens = normalizeFoodQuery(query)
    .split(' ')
    .filter(Boolean)
    .map((word) => aliases[word] ?? word);
  return catalog
    .filter((product) => {
      if ((category && product.category !== category) || (form && product.form !== form))
        return false;
      const text = normalizeFoodQuery(
        `${product.name} ${product.preparation} ${product.source.description} ${product.id} ${product.form === 'cooked' ? 'приготовленный' : ''}`,
      );
      return tokens.every((token) => text.split(' ').some((word) => word.startsWith(token)));
    })
    .sort((a, b) => {
      const q = normalizeFoodQuery(query);
      const score = (p: CatalogProduct) => Number(normalizeFoodQuery(p.name).startsWith(q));
      return score(b) - score(a) || a.name.localeCompare(b.name, 'ru');
    });
}
