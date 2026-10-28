import { it, expect } from 'vitest';
import { exportOpenFoodFactsCatalog } from './export';
it('отдаёт всю открытую часть базы с лицензией, без личных данных', () => {
  const data = JSON.parse(exportOpenFoodFactsCatalog());
  expect(data.products).toHaveLength(7368);
  expect(
    data.products.every((p: { source: { provider: string } }) => p.source.provider === 'off'),
  ).toBe(true);
  expect(data.license).toContain('/odbl/');
  expect(Object.keys(data).sort()).toEqual(
    ['format', 'attribution', 'license', 'contentsLicense', 'source', 'products'].sort(),
  );
});
