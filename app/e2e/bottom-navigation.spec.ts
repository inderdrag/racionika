import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function navVisible(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  const box = await nav.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  for (const name of ['Главная', 'Дневник', 'Наставник', 'Прогресс', 'Профиль'])
    await expect(nav.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
  const main = await page.locator('main').boundingBox();
  expect(main!.y + main!.height).toBeLessThanOrEqual(box!.y + 1);
  return box!;
}
for (const layout of [
  { width: 390, height: 844, native: false, font: 100 },
  { width: 320, height: 568, native: true, font: 200 },
  { width: 740, height: 360, native: true, font: 100 },
  { width: 800, height: 1280, native: true, font: 150 },
]) {
  test(`панель видна при прокрутке и переключении: ${JSON.stringify(layout)}`, async ({ page }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.route('**/v1/config', (r) =>
      r.fulfill({
        json: {
          mode: 'demo',
          provider: 'anymodel',
          maintenance: false,
          access_code_required: false,
          min_app_version: '0.2.0',
        },
      }),
    );
    await page.goto('/');
    await page.evaluate(({ native, font }) => {
      if (native) document.documentElement.dataset.native = 'true';
      document.documentElement.style.fontSize = `${font}%`;
    }, layout);
    await page.getByRole('button', { name: 'Профиль', exact: true }).click();
    const top = await navVisible(page);
    const main = page.locator('main');
    await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const bottom = await navVisible(page);
    expect(bottom.y).toBeCloseTo(top.y, 1);
    await expect(page.getByText('Разрешения приложения', { exact: true })).toBeInViewport();
    await main.evaluate((el) => el.scrollTo(0, el.scrollHeight / 2));
    await navVisible(page);
    await main.evaluate((el) => el.scrollTo(0, 0));
    await navVisible(page);
    for (const name of ['Дневник', 'Главная', 'Наставник', 'Прогресс', 'Профиль']) {
      await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
      await expect(
        page.getByRole('navigation').getByRole('button', { name, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await navVisible(page);
    }
    if (layout.width === 390) await page.screenshot({ path: '/data/bottom-nav-profile.png' });
  });
}
test('панель остаётся видна после смены ориентации', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => (document.documentElement.dataset.native = 'true'));
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.locator('main').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.setViewportSize({ width: 844, height: 390 });
  await navVisible(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await navVisible(page);
});
