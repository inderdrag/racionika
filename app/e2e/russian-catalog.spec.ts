import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
test.beforeEach(async ({ page }) => {
  await page.route('**/v1/config', (r) =>
    r.fulfill({
      json: {
        mode: 'demo',
        access_code_required: false,
        min_app_version: '0.2.0',
        provider: 'anymodel',
        maintenance: false,
      },
    }),
  );
});
test('российский продукт офлайн: поиск, бренд, источник, избранное и дневник', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByLabel('Поиск продуктов').fill('Творог Простоквашино');
  await expect(page.locator('.catalog-pick').first()).toContainText('Простоквашино');
  await expect(page.locator('.catalog-attribution')).toContainText('Open Food Facts');
  await page.getByLabel('Поиск продуктов').fill('4600605027721');
  await page.locator('[data-product-id="off-4600605027721"]').click();
  await page.getByLabel('Масса, г', { exact: true }).fill('200');
  await expect(page.locator('.catalog-total strong')).toContainText('242');
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('breakfast');
  await page.locator('.catalog-source summary').click();
  await expect(page.locator('.catalog-source')).toContainText('Данные сообщества');
  await expect(page.getByRole('link', { name: 'Открыть источник ↗' })).toHaveAttribute(
    'href',
    'https://world.openfoodfacts.org/product/4600605027721',
  );
  await page.locator('.catalog-selection .favorite-heart').click();
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Завтрак', exact: true })).toContainText('242');
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.diary-entry')).toContainText('Простоквашино');
  await expect(page.locator('.library-list')).toContainText('Простоквашино');
});
test('открытая часть базы экспортируется целиком с лицензией, без дневника', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByText('О приложении и лицензии', { exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт открытой базы' }).click();
  const file = await downloading;
  const data = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(data.products).toHaveLength(7368);
  expect(data.license).toContain('/odbl/');
  expect(
    data.products.every((p: { source: { provider: string } }) => p.source.provider === 'off'),
  ).toBe(true);
  expect(data).not.toHaveProperty('profile');
  expect(data).not.toHaveProperty('foodEntries');
});
for (const native of [false, true])
  test(`кнопка плавает без фоновой полосы, native=${native}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/');
    if (native) await page.evaluate(() => (document.documentElement.dataset.native = 'true'));
    await page.getByRole('button', { name: 'Дневник', exact: true }).click();
    const button = page.getByRole('button', { name: 'Добавить еду', exact: true });
    const before = (await button.boundingBox())!;
    const main = page.locator('main');
    const anchor = await page.locator('.diary-add-anchor').evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      background: getComputedStyle(el).backgroundColor,
    }));
    expect(anchor.height).toBe(0);
    expect(anchor.background).toBe('rgba(0, 0, 0, 0)');
    const mainBox = (await main.boundingBox())!;
    const navBox = (await page.getByRole('navigation').boundingBox())!;
    expect(mainBox.y + mainBox.height).toBeCloseTo(navBox.y, 0);
    expect(
      await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('main'), {
        x: before.x - 6,
        y: before.y + 10,
      }),
    ).toBe(true);
    await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const after = (await button.boundingBox())!;
    expect(after.y).toBeCloseTo(before.y, 1);
    expect(after.x).toBeCloseTo(before.x, 1);
    await expect(button).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath(`diary-floating-${native}.png`) });
    await page.getByRole('button', { name: 'Главная', exact: true }).click();
    await expect(button).toHaveCount(0);
  });
