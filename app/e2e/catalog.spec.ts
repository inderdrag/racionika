import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
async function open(page: Page) {
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Добавить продукт', exact: true })).toBeVisible();
}
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
test('офлайн-поиск, приготовленный рис, граммовка и категория сохраняются без ИИ', async ({
  page,
  context,
}) => {
  let ai = 0;
  page.on('request', (r) => {
    if (r.url().includes('/v1/analyze-')) ai++;
  });
  await page.goto('/');
  await context.setOffline(true);
  await open(page);
  await page
    .getByLabel('Поиск продуктов', { exact: true })
    .fill('Рис белый длиннозёрный приготовленный');
  await expect(page.locator('[data-product-id="usda-168878"]')).toBeVisible();
  await page.locator('[data-product-id="usda-168878"]').click();
  await page.getByLabel('Масса, г', { exact: true }).fill('150');
  await expect(page.locator('.catalog-total strong')).toContainText('195');
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('lunch');
  await page.locator('.catalog-source summary').click();
  await expect(page.getByRole('link', { name: 'Открыть источник ↗' })).toHaveAttribute(
    'href',
    'https://fdc.nal.usda.gov/food-details/168878/nutrients',
  );
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Обед', exact: true })).toContainText('195');
  await expect(page.locator('.diary-entry')).toContainText('USDA');
  expect(ai).toBe(0);
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Обед', exact: true })).toContainText('195');
});
test('правка порции не теряет точные КБЖУ и источник, правка КБЖУ снимает атрибуцию', async ({
  page,
}) => {
  await page.goto('/');
  await open(page);
  await page
    .getByLabel('Поиск продуктов', { exact: true })
    .fill('Рис белый длиннозёрный приготовленный');
  await page.locator('[data-product-id="usda-168878"]').click();
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('dinner');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await page.locator('.meal-edit').click();
  await expect(page.getByLabel('Белки, г', { exact: true })).toHaveValue('2.69');
  await page.getByLabel('Масса порции, г').fill('200');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(page.locator('.diary-entry')).toContainText('260');
  await expect(page.locator('.diary-entry')).toContainText('USDA');
  await page.locator('.meal-edit').click();
  await page.getByLabel('Белки, г', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(page.locator('.diary-entry')).toContainText('ручной ввод');
  await expect(page.locator('.diary-entry')).not.toContainText('USDA');
});
test('источник проходит экспорт и импорт JSON вместе с дневником и избранным', async ({ page }) => {
  await page.goto('/');
  await open(page);
  await page.getByLabel('Поиск продуктов', { exact: true }).fill('Киноа приготовленный');
  await page.locator('[data-product-id="usda-168917"]').click();
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('breakfast');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await page.locator('.diary-entry details summary').click();
  await page.locator('.diary-entry .favorite-heart').click();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать JSON' }).click();
  const file = await download;
  const path = await file.path();
  expect(path).toBeTruthy();
  const fs = await import('node:fs/promises');
  const data = JSON.parse(await fs.readFile(path!, 'utf8'));
  expect(data.foodEntries[0].catalogSource.id).toBe('168917');
  expect(data.favoriteDishes[0].entry.catalogSource.provider).toBe('usda');
  await page.locator('input[type=file][accept*="json"]').setInputFiles(path!);
  await expect(page.locator('.import-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить импорт' }).click();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.diary-entry')).toContainText('USDA');
});
test('при открытии только строка поиска и камера, ввод никогда не отправляется в сеть', async ({
  page,
  context,
}) => {
  await page.goto('/');
  let network = 0;
  page.on('request', (r) => {
    if (/\/v1\/|openfoodfacts/.test(r.url())) network++;
  });
  await open(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('input')).toHaveCount(1);
  await expect(dialog.locator('select, textarea, input[type=file]')).toHaveCount(0);
  await expect(dialog.getByRole('button')).toHaveCount(2);
  await expect(dialog.getByRole('searchbox')).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Сфотографировать продукт' })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel('Поиск продуктов').fill('неизвестныйпродукт');
  await expect(page.getByText('Ничего не найдено.', { exact: true })).toBeVisible();
  await page.getByLabel('Поиск продуктов').fill('гречка');
  await expect(page.locator('[data-product-id="usda-170685"]')).toBeVisible();
  await expect(page.locator('[data-product-id="usda-170686"]')).toBeVisible();
  await page.getByLabel('Поиск продуктов').press('Enter');
  expect(network).toBe(0);
});
test('камера находится внутри строки справа на узком экране', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await open(page);
  const row = await page.locator('.product-search').boundingBox();
  const camera = await page.getByRole('button', { name: 'Сфотографировать продукт' }).boundingBox();
  const input = await page.getByRole('searchbox', { name: 'Поиск продуктов' }).boundingBox();
  expect(camera!.x).toBeGreaterThan(input!.x + input!.width / 2);
  expect(camera!.x + camera!.width).toBeLessThanOrEqual(row!.x + row!.width);
  expect(camera!.y).toBeGreaterThanOrEqual(input!.y);
  expect(camera!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('product-search-light.png') });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.screenshot({ path: testInfo.outputPath('product-search-dark.png') });
});
test('расширенная USDA база: FNDDS офлайн, оригинал, порция и сохранение', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await context.setOffline(true);
  await open(page);
  await page.getByLabel('Поиск продуктов').fill('Молоко');
  await expect(page.locator('.catalog-pick')).toHaveCount(20);
  await page.getByLabel('Поиск продуктов').fill('2705384');
  await page.locator('[data-product-id="usda-2705384"]').click();
  await expect(
    page.getByRole('heading', { name: 'Молоко, вид не уточнён', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Масса, г', { exact: true }).fill('200');
  await expect(page.locator('.catalog-total strong')).toContainText('104');
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('snack');
  await page.locator('.catalog-source summary').click();
  await expect(page.locator('.catalog-source')).toContainText('Milk, NFS');
  await expect(page.locator('.catalog-source')).toContainText('FNDDS 2021–2023');
  await expect(page.locator('.catalog-source')).toContainText('переведено автоматически');
  await expect(page.getByRole('link', { name: 'Открыть источник ↗' })).toHaveAttribute(
    'href',
    'https://fdc.nal.usda.gov/food-details/2705384/nutrients',
  );
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Перекус', exact: true })).toContainText('104');
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.diary-entry')).toContainText('Молоко, вид не уточнён');
});
