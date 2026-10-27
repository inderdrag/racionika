import { captureFood, openEntryEditor } from './product-helpers';
import { DEMO_MEAL } from '../../server/src/providers/mock';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
const tabs = ['Главная', 'Дневник', 'Наставник', 'Прогресс', 'Профиль'];
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('racionika.token.0.3.0', 'layout-test-token'),
  );
  await page.route('**/v1/config', (route) =>
    route.fulfill({
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
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}
async function fits(page: Page) {
  const issues = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'main .card, main input:not([type=file]), main select, main textarea, main button, main p, main h1, nav button, dialog[open] p, dialog[open] button, dialog[open] input:not([type=file]), dialog[open] select',
      ),
    ]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return false;
        const bounds = r.left < -1 || r.right > innerWidth + 1;
        const textOverflow =
          !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) &&
          el.clientWidth > 0 &&
          el.scrollWidth > el.clientWidth + 2;
        return bounds || textOverflow;
      })
      .map((el) => ({
        tag: el.tagName,
        cls: el.className,
        text: el.textContent?.slice(0, 60),
        width: el.clientWidth,
        content: el.scrollWidth,
      })),
  );
  expect(issues).toEqual([]);
}
for (const size of [
  { width: 320, height: 568, font: 100 },
  { width: 360, height: 640, font: 100 },
  { width: 390, height: 844, font: 100 },
  { width: 412, height: 915, font: 100 },
  { width: 320, height: 568, font: 200 },
  { width: 390, height: 844, font: 200 },
  { width: 640, height: 360, font: 200 },
  { width: 768, height: 1024, font: 150 },
])
  test(`основные экраны ${size.width}×${size.height}, текст ${size.font}%`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.evaluate(
      (font) => (document.documentElement.style.fontSize = `${font}%`),
      size.font,
    );
    expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      `${(16 * size.font) / 100}px`,
    );
    for (const tab of tabs) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await expect(page.locator('#page-title')).toBeFocused();
      await fits(page);
    }
  });
for (const theme of ['light', 'dark'])
  test(`WCAG A/AA, основные экраны, тема ${theme}`, async ({ page }) => {
    test.setTimeout(90000); // Five full axe scans, including extra analysis pages.
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const tab of tabs) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await accessible(page);
    }
  });
test('клавиатура: переход к содержимому, фокус диалога и возврат после Escape', async ({
  page,
}) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'К содержимому', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Добавить еду', exact: true });
  await opener.click();
  await page.keyboard.press('Shift+Tab');
  expect(await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement))).toBe(
    true,
  );
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});
test('диалоги при крупном тексте и коротком экране: разбор, ручной ввод и каталог', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/');
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await fits(page);
  await accessible(page);
  await openEntryEditor(page);
  await fits(page);
  await accessible(page);
  await page
    .getByRole('button', { name: 'Сохранить запись', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: 'Сохранить запись', exact: true }),
  ).toBeInViewport();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Поиск продуктов', exact: true }).fill('гречка');
  await fits(page);
  await accessible(page);
});
test('системная светлая/тёмная тема, принудительные цвета и уменьшение движения', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  const home = page.locator('.phone');
  const dark = await home.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  expect(await home.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(dark);
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByRole('combobox', { name: 'Тема', exact: true }).selectOption('light');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme)).toBe(
    'light',
  );
  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active', reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  expect(
    await page.locator('.ring-fill').evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe('0s');
  await fits(page);
});

for (const size of [
  { width: 740, height: 360 },
  { width: 800, height: 1280 },
])
  test(`широкий APK ${size.width}×${size.height} без рекламного макета`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    // Exercise only native layout; real Capacitor APIs still require an Android phone.
    await page.evaluate(() => {
      document.documentElement.dataset.native = 'true';
      document.documentElement.style.fontSize = '150%';
    });
    await expect(page.locator('.desktop-note')).toBeHidden();
    expect(await page.locator('.phone').evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe(
      '0px',
    );
    for (const tab of tabs) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await fits(page);
    }
  });

test('результат разбора с крупным текстом: продукты, граммовка, итог и сохранение', async ({
  page,
}) => {
  // This case checks layout, not provider integration or server rate limits.
  await page.route('**/v1/analyze-meal', (route) =>
    route.fulfill({
      json: {
        analysis: DEMO_MEAL,
        demo: true,
        usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null },
        daily: {
          analyses: 1,
          analysis_limit: 40,
          lookups: 0,
          lookup_limit: 100,
          chat: 0,
          chat_limit: 50,
          resets_at: '2026-12-01T00:00:00Z',
        },
      },
    }),
  );
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.dataset.native = 'true';
    document.documentElement.style.fontSize = '200%';
  });
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await captureFood(page);
  await expect(page.getByRole('heading', { name: 'Разбор блюда', exact: true })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Приём пищи для блюда', exact: true })
    .selectOption('lunch');
  await page.getByLabel('Масса ингредиента 1', { exact: true }).fill('200');
  await fits(page);
  await accessible(page);
  await page
    .getByRole('button', { name: 'Сохранить демозапись', exact: true })
    .scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Сохранить демозапись', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Обед', exact: true })).toContainText('курица');
});
