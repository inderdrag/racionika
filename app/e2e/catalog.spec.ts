import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
async function open(page: Page) {
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'База продуктов', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'База продуктов', exact: true })).toBeVisible();
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
  await expect(page.getByText('505 продуктов и вариантов · USDA · без интернета')).toBeVisible();
  await page.getByLabel('Поиск продуктов', { exact: true }).fill('Рис белый длиннозёрный');
  await page.getByLabel('Вид', { exact: true }).selectOption('cooked');
  await expect(page.locator('.catalog-results li')).toHaveCount(1);
  await page.locator('.catalog-pick').click();
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
  await page.getByLabel('Поиск продуктов', { exact: true }).fill('Рис белый длиннозёрный');
  await page.getByLabel('Вид', { exact: true }).selectOption('cooked');
  await page.locator('.catalog-pick').click();
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
  await page.getByLabel('Поиск продуктов', { exact: true }).fill('Киноа');
  await page.getByLabel('Вид', { exact: true }).selectOption('cooked');
  await page.locator('.catalog-pick').click();
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('breakfast');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await page.locator('.diary-entry details summary').click();
  await page.getByRole('button', { name: 'В избранное', exact: true }).click();
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
test('внешний поиск только по кнопке; неполные данные не выбираются и требуется сверка упаковки', async ({
  page,
}) => {
  let calls = 0;
  let url = '';
  await page.route(/^https:\/\/(world|search)\.openfoodfacts\.org\//, (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type,user-agent',
        },
      });
    calls++;
    url = route.request().url();
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: route.request().url().includes('search.openfoodfacts.org')
        ? {
            hits: [
              { code: '3017620422003', product_name: 'Тестовая паста', brands: ['Тест'] },
              { code: 'not-a-code', product_name: 'Некорректный ID' },
            ],
          }
        : {
            status: 1,
            product: {
              code: '3017620422003',
              product_name: 'Тестовая паста',
              nutrition_data_per: '100g',
              nutriments: {
                'energy-kcal_100g': 500,
                proteins_100g: 10,
                fat_100g: 30,
                carbohydrates_100g: 40,
              },
            },
          },
    });
  });
  await page.goto('/');
  await open(page);
  await page.getByRole('button', { name: 'В интернете', exact: true }).click();
  await page.getByLabel('Поиск продуктов', { exact: true }).fill('шоколадная паста');
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Найти в интернете', exact: true }).click();
  await expect(page.locator('.catalog-results li')).toHaveCount(1);
  expect(calls).toBe(1);
  expect(new URL(url).searchParams.get('q')).toBe('шоколадная паста');
  await page.locator('.catalog-pick').click();
  await expect(
    page.getByRole('button', { name: 'Добавить в дневник', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('snack');
  await page.getByRole('checkbox', { name: /Сверил КБЖУ/ }).check();
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.locator('.diary-entry')).toContainText('Open Food Facts');
});
test('недоступный внешний сервис не мешает вернуться к офлайн-базе; пустой поиск и узкий экран', async ({
  page,
}) => {
  await page.route(/^https:\/\/(world|search)\.openfoodfacts\.org\//, (r) =>
    r.fulfill({
      status: r.request().method() === 'OPTIONS' ? 204 : 503,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type,user-agent',
      },
      body: '',
    }),
  );
  await page.goto('/');
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  await page.getByLabel('Поиск продуктов', { exact: true }).fill('абракадабраням');
  await expect(page.getByText('Ничего не найдено. Попробуйте другое название.')).toBeVisible();
  await page.getByRole('button', { name: 'В интернете', exact: true }).click();
  await page.getByRole('button', { name: 'Найти в интернете', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('недоступен');
  await page.getByRole('button', { name: 'На телефоне', exact: true }).click();
  await page.getByLabel('Поиск продуктов', { exact: true }).fill('гречка');
  await expect(page.locator('.catalog-results li')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await expect(page.getByRole('button', { name: 'База продуктов', exact: true })).toBeVisible();
});
