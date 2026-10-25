import { z } from 'zod';
import { NutrientsSchema } from '@racionika/shared';
export const CatalogSourceSchema = z
  .object({
    provider: z.enum(['usda', 'off']),
    id: z.string().regex(/^\d{5,14}$/),
    description: z.string().min(1).max(500),
    release: z.string().max(80),
  })
  .strict();
export type CatalogSource = z.infer<typeof CatalogSourceSchema>;
export const CatalogProductSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: z.string().min(1).max(160),
    category: z.string().min(1).max(80),
    form: z.enum(['raw', 'cooked', 'dry', 'frozen', 'canned', 'ready']),
    preparation: z.string().min(1).max(120),
    per100: NutrientsSchema,
    source: CatalogSourceSchema,
  })
  .strict();
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;
export const formLabels: Record<CatalogProduct['form'], string> = {
  raw: 'Сырой',
  cooked: 'Готовый',
  dry: 'Сухой',
  frozen: 'Замороженный',
  canned: 'Консервы',
  ready: 'Прочее',
};
export function catalogSourceUrl(source: CatalogSource) {
  const checked = CatalogSourceSchema.parse(source);
  return checked.provider === 'usda'
    ? `https://fdc.nal.usda.gov/food-details/${checked.id}/nutrients`
    : `https://world.openfoodfacts.org/product/${checked.id}`;
}
