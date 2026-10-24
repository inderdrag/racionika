import { expect, test } from '@playwright/test';
test('основная навигация доступна', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Хороший день для себя' })).toBeVisible();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Дневник питания' })).toBeVisible();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Экспортировать JSON' })).toBeVisible();
});
test('настольная рамка без переполнения', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
