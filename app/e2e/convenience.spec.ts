import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
async function open(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
}
const rice = '[data-product-id="usda-168878"]';
test('серия продуктов, прошлые порции, умный поиск и реактивный календарь без сети', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await context.setOffline(true);
  await open(page);
  const search = page.getByLabel('Поиск продуктов', { exact: true });
  await search.fill('рис белый длиннозёрный приготовленный');
  await page.locator(rice).click();
  await page.getByLabel('Масса, г', { exact: true }).fill('150');
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('lunch');
  await page.getByRole('button', { name: 'Добавить и продолжить', exact: true }).click();
  await expect(search).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Добавлено: 1');
  await search.fill('рис');
  await expect(page.locator('.catalog-pick').first()).toHaveAttribute(
    'data-product-id',
    'usda-168878',
  );
  await page.locator(rice).click();
  await expect(page.getByLabel('Масса, г', { exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Последняя порция: 150 г' }).click();
  await expect(page.getByLabel('Масса, г', { exact: true })).toHaveValue('150');
  await expect(page.getByLabel('Куда добавить', { exact: true })).toHaveValue('lunch');
  await page.getByLabel('Единица порции').selectOption({ label: 'Стакан (US cup) ≈ 158 г' });
  await page.getByLabel('Количество', { exact: true }).fill('2');
  await expect(page.getByLabel('Масса, г', { exact: true })).toHaveValue('316');
  await page.getByLabel('Вес одной меры, г').fill('160');
  await expect(page.getByLabel('Масса, г', { exact: true })).toHaveValue('320');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.locator('.diary-entry')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Обед', exact: true })).toContainText('611');
  await page.locator('.calendar-toggle').click();
  await expect(page.locator('.calendar-day[data-recorded="true"]')).toHaveCount(1);
  await expect(page.locator('.calendar-day[aria-pressed="true"]')).toHaveAttribute(
    'data-recorded',
    'true',
  );
  await page.getByRole('button', { name: 'Следующий день', exact: true }).click();
  await expect(page.locator('.diary-entry')).toHaveCount(0);
  await page.getByRole('button', { name: 'Предыдущий день', exact: true }).click();
  await expect(page.locator('.diary-entry')).toHaveCount(2);
  await page.getByRole('button', { name: 'Следующий день', exact: true }).click();
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(page.locator('.diary-entry')).toHaveCount(2);
  await open(page);
  await search.fill('творк');
  await expect(page.locator('.catalog-pick').first()).toContainText(/творо/i);
  await search.fill('творог prostokvashino');
  await expect(page.locator('[data-product-id="off-4600605027721"]')).toBeVisible();
});
test('календарь помещается на узком экране и работает с клавиатурой', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.locator('.calendar-toggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.diary-calendar')).toBeVisible();
  const month = await page.locator('.calendar-month strong').textContent();
  await page.getByRole('button', { name: 'Предыдущий месяц', exact: true }).click();
  await expect(page.locator('.calendar-month strong')).not.toHaveText(month!);
  await page.getByRole('button', { name: 'Следующий месяц', exact: true }).click();
  await expect(page.locator('.calendar-month strong')).toHaveText(month!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('несколько компонентов остаются черновиком до сохранения всего блюда', async ({ page }) => {
  await page.goto('/');
  await open(page);
  await page
    .getByLabel('Поиск продуктов', { exact: true })
    .fill('Рис белый длиннозёрный приготовленный');
  await page.locator(rice).click();
  await page.getByRole('button', { name: '＋ Добавить продукт', exact: true }).click();
  const composer = page.locator('.meal-composer');
  await composer.getByLabel('Куда добавить', { exact: true }).selectOption('dinner');
  await composer.getByRole('button', { name: '＋ Добавить продукт', exact: true }).click();
  const picker = page.locator('.product-dialog').last();
  await picker.getByLabel('Поиск продуктов', { exact: true }).fill('Киноа приготовленный');
  await picker.locator('[data-product-id="usda-168917"]').click();
  await picker.getByLabel('Масса, г', { exact: true }).fill('50');
  await picker.getByRole('button', { name: 'Добавить и продолжить', exact: true }).click();
  await expect(picker.getByLabel('Поиск продуктов', { exact: true })).toBeVisible();
  await expect(page.locator('.diary-entry')).toHaveCount(0);
  await picker.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(composer.locator('.catalog-total')).toContainText('190');
  await expect(composer.getByLabel('Единица порции')).toHaveCount(0);
  await composer.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.locator('.diary-entry')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Ужин', exact: true })).toContainText('190');
});

for (const font of [100, 200])
  test(`календарь доступен при шрифте ${font}%`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.evaluate((font) => {
      document.documentElement.style.fontSize = `${font}%`;
    }, font);
    await page.getByRole('button', { name: 'Дневник', exact: true }).click();
    await page.locator('.calendar-toggle').click();
    const result = await new AxeBuilder({ page })
      .include('.diary-date')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    expect(
      await page.locator('.diary-date').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`calendar-${font}.png`) });
    await page.locator('.calendar-day').first().click();
    await expect(page.locator('.calendar-toggle')).toBeFocused();
  });
