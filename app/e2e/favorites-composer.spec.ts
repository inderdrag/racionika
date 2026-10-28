import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { captureFood } from './product-helpers';
import { DEMO_MEAL } from '../../server/src/providers/mock';
import type { Page } from '@playwright/test';
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Поиск продуктов' })
    .fill('Рис белый длиннозёрный приготовленный');
  await page.locator('.catalog-pick').click();
}
async function like(page: Page) {
  await open(page);
  const heart = page.locator('.catalog-selection .favorite-heart');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('.library-list li')).toHaveCount(1);
}
test.beforeEach(async ({ page }) => {
  // Recognition is mocked here; do not consume the real registration rate limit.
  await page.addInitScript(() =>
    sessionStorage.setItem('racionika.token.0.3.0', 'favorites-ui-test-token'),
  );
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
test('heart saves without a diary entry, keeps state across portions and reload, plus opens grams and meal', async ({
  page,
  context,
}) => {
  await like(page);
  await expect(page.locator('.diary-entry')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.library-list .favorite-heart')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await context.setOffline(true);
  await page.locator('.library-list button.secondary').click();
  const dialog = page.locator('.meal-composer');
  await expect(dialog.getByLabel('Куда добавить', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Масса порции, г', { exact: true }).fill('150');
  await expect(dialog.locator('.catalog-total')).toContainText('195');
  await expect(
    dialog.locator('.favorite-title').first().locator('.favorite-heart'),
  ).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByLabel('Куда добавить', { exact: true }).selectOption('lunch');
  await dialog.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Обед', exact: true })).toContainText('195');
  await expect(page.locator('.diary-entry .favorite-heart')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.library-list small')).toContainText('100 г');
  await page.locator('.diary-entry .favorite-heart').click();
  await expect(page.locator('.library-list li')).toHaveCount(0);
  await expect(page.locator('.diary-entry')).toHaveCount(1);
});
test('search appends into the same recipe, cancels safely, saves once and keeps original favorite', async ({
  page,
}) => {
  await like(page);
  await page.locator('.library-list button.secondary').click();
  const composer = page.locator('.meal-composer');
  await composer.getByLabel('Масса порции, г', { exact: true }).fill('150');
  await composer.getByRole('button', { name: '＋ Добавить продукт', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Поиск продуктов' })).toBeFocused();
  await page.getByRole('searchbox', { name: 'Поиск продуктов' }).fill('Киноа приготовленный');
  await page.locator('.product-dialog').last().locator('.catalog-pick').click();
  const picker = page.locator('.product-dialog').last();
  await picker.getByLabel('Масса, г', { exact: true }).fill('50');
  await expect(picker.getByLabel('Куда добавить', { exact: true })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Добавить продукт', exact: true }).click();
  await expect(composer.locator('.composer-ingredients > li')).toHaveCount(2);
  await expect(composer.locator('.catalog-total')).toContainText('255');
  await expect(page.locator('.diary-entry')).toHaveCount(0);
  await composer.getByRole('button', { name: '＋ Добавить продукт', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(
    composer.getByRole('button', { name: '＋ Добавить продукт', exact: true }),
  ).toBeFocused();
  await expect(composer.locator('.catalog-total')).toContainText('200 г');
  await composer.getByLabel('Куда добавить', { exact: true }).selectOption('dinner');
  await composer.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.locator('.diary-entry')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Ужин', exact: true })).toContainText('255');
  await expect(page.locator('.library-list small')).toContainText('100 г');
  await page.locator('.meal-edit').click();
  await expect(page.locator('.ingredient-list .ingredient')).toHaveCount(2);
});
test('camera in nested picker appends recognition without separately logging it', async ({
  page,
}) => {
  await page.route('**/v1/analyze-meal', (r) =>
    r.fulfill({
      json: {
        analysis: DEMO_MEAL,
        demo: true,
        usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
        daily: {
          analyses: 1,
          analysis_limit: 40,
          lookups: 0,
          lookup_limit: 100,
          chat: 0,
          chat_limit: 40,
          resets_at: '2026-11-01T00:00:00Z',
        },
      },
    }),
  );
  await like(page);
  await page.locator('.library-list button.secondary').click();
  const composer = page.locator('.meal-composer');
  await composer.getByRole('button', { name: '＋ Добавить продукт', exact: true }).click();
  await captureFood(page);
  const result = page.locator('.product-dialog').last();
  await expect(result.getByRole('heading', { name: 'Разбор блюда', exact: true })).toBeVisible();
  await result.getByRole('button', { name: 'Добавить демопродукт', exact: true }).click();
  await expect(composer.locator('.composer-ingredients > li')).toHaveCount(3);
  await expect(page.locator('.diary-entry')).toHaveCount(0);
  await composer.getByLabel('Куда добавить', { exact: true }).selectOption('snack');
  await composer.getByRole('button', { name: 'Сохранить демозапись', exact: true }).click();
  await expect(page.locator('.diary-entry')).toHaveCount(1);
  await expect(page.locator('.diary-entry')).toContainText('ДЕМО');
});
test('new catalog product can be expanded into a recipe before diary save', async ({ page }) => {
  await open(page);
  await page.getByLabel('Масса, г', { exact: true }).fill('150');
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('breakfast');
  await page.getByRole('button', { name: '＋ Добавить продукт', exact: true }).click();
  const composer = page.locator('.meal-composer');
  await expect(composer.getByLabel('Масса порции, г', { exact: true })).toHaveValue('150');
  await expect(composer.getByLabel('Куда добавить', { exact: true })).toHaveValue('breakfast');
  await composer.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.locator('.diary-entry')).toHaveCount(1);
  await expect(page.locator('.diary-entry')).toContainText('USDA');
});
test('hearts beside search results and saved diary entries replace old actions', async ({
  page,
}) => {
  await open(page);
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('snack');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await page.locator('.diary-entry .favorite-heart').click();
  await expect(page.locator('.library-list li')).toHaveCount(1);
  await page.locator('.diary-entry summary').click();
  await expect(page.getByRole('button', { name: 'В избранное', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Убрать', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Поиск продуктов' })
    .fill('Рис белый длиннозёрный приготовленный');
  await expect(page.locator('.catalog-result-row .favorite-heart')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('.catalog-result-row .favorite-heart').click();
  await expect(page.locator('.catalog-result-row .favorite-heart')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
for (const width of [320, 390])
  test(`favorite composer fits ${width}px with keyboard navigation and theme`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await like(page);
    await page.locator('.library-list button.secondary').click();
    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    const composer = page.locator('.meal-composer');
    await expect(composer).toBeVisible();
    expect(await composer.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await composer.getByLabel('Масса порции, г', { exact: true }).fill('0');
    await expect(
      composer.getByRole('button', { name: 'Добавить в дневник', exact: true }),
    ).toBeDisabled();
    await composer.getByLabel('Масса порции, г', { exact: true }).fill('200');
    await composer.getByLabel('Куда добавить', { exact: true }).selectOption('dinner');
    await expect(composer.locator('.catalog-total')).toContainText('260');
    await page.screenshot({ path: `/data/favorites-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(composer).toHaveCount(0);
    await expect(page.locator('.library-list button.secondary')).toBeFocused();
  });

test('favorite composer is accessible and new compositions survive JSON export', async ({
  page,
}) => {
  await like(page);
  await page.locator('.library-list button.secondary').click();
  const composer = page.locator('.meal-composer');
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await composer.getByRole('button', { name: '＋ Добавить продукт', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Поиск продуктов' }).fill('Киноа приготовленный');
  await page.locator('.product-dialog').last().locator('.catalog-pick').click();
  await page
    .locator('.product-dialog')
    .last()
    .getByRole('button', { name: 'Добавить продукт', exact: true })
    .click();
  await composer.locator('.composer-name summary').click();
  await composer.getByLabel('Название', { exact: true }).fill('Мой обед');
  await composer.locator('.favorite-title').first().locator('.favorite-heart').click();
  await composer.getByLabel('Куда добавить', { exact: true }).selectOption('lunch');
  await composer.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.locator('.library-list li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать JSON' }).click();
  const file = await downloaded;
  const fs = await import('node:fs/promises');
  const data = JSON.parse(await fs.readFile((await file.path())!, 'utf8'));
  const meal = data.foodEntries.find((e: { name: string }) => e.name === 'Мой обед');
  expect(meal.grams).toBe(200);
  expect(meal.analysis.ingredients).toHaveLength(2);
  expect(
    data.favoriteDishes.find((f: { entry: { name: string } }) => f.entry.name === 'Мой обед').entry
      .analysis.ingredients,
  ).toHaveLength(2);
  await page.locator('input[type=file][accept*="json"]').setInputFiles((await file.path())!);
  await expect(page.locator('.import-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить импорт' }).click();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.diary-entry')).toHaveCount(1);
  await expect(page.locator('.library-list li')).toHaveCount(2);
});
