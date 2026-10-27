import { test, expect } from './fixtures';
import { captureFood, mockCamera } from './product-helpers';
import { DEMO_MEAL } from '../../server/src/providers/mock';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('racionika.token.0.3.0', 'camera-test-token'),
  );
  await page.route('**/v1/config', (r) =>
    r.fulfill({
      json: {
        mode: 'real',
        provider: 'anymodel',
        access_code_required: false,
        min_app_version: '0.2.0',
        maintenance: false,
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
});
test('один снимок автоматически запускает один разбор и освобождает камеру', async ({ page }) => {
  let requests = 0;
  await page.route('**/v1/analyze-meal', (r) => {
    requests++;
    const payload = r.request().postDataJSON();
    expect(payload.images).toHaveLength(1);
    expect(payload.images[0].mimeType).toBe('image/jpeg');
    expect(payload.hint).toBe('');
    return r.fulfill({
      json: {
        analysis: DEMO_MEAL,
        demo: false,
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
    });
  });
  await captureFood(page);
  await expect(page.locator('.result-kcal')).toContainText('482');
  expect(requests).toBe(1);
  expect(
    await page.evaluate(() =>
      (window as unknown as { cameraTracks: MediaStreamTrack[] }).cameraTracks.every(
        (t) => t.readyState === 'ended',
      ),
    ),
  ).toBe(true);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Определить КБЖУ' })).toHaveCount(0);
});
test('отмена съёмки останавливает камеру, не запрашивает конфигурацию и возвращает поиск', async ({
  page,
}) => {
  let requests = 0;
  page.on('request', (r) => {
    if (r.url().includes('/v1/')) requests++;
  });
  await mockCamera(page);
  await page.getByRole('button', { name: 'Сфотографировать продукт' }).click();
  await page
    .getByRole('dialog', { name: 'Камера', exact: true })
    .getByRole('button', { name: 'Отмена', exact: true })
    .click();
  await expect(page.getByRole('searchbox', { name: 'Поиск продуктов' })).toBeEnabled();
  expect(requests).toBe(0);
  expect(
    await page.evaluate(() =>
      (window as unknown as { cameraTracks: MediaStreamTrack[] }).cameraTracks.every(
        (t) => t.readyState === 'ended',
      ),
    ),
  ).toBe(true);
});
test('закрытие во время запроса не открывает запоздалый результат', async ({ page }) => {
  await page.route('**/v1/analyze-meal', async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await r.abort().catch(() => undefined);
  });
  const request = page.waitForRequest('**/v1/analyze-meal');
  await captureFood(page);
  await request;
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Поиск продуктов' })).toBeEnabled();
  await page.waitForTimeout(1400); // Wait beyond the deliberately delayed response.
  await expect(page.locator('.result-kcal')).toHaveCount(0);
});
