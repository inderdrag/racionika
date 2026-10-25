import { expect, test } from './fixtures';
import { DEMO_MEAL } from '../../server/src/providers/mock';
import type { MealAnalysis } from '@racionika/shared';
async function prepare(
  page: import('@playwright/test').Page,
  responder: (payload: { hint: string }) => MealAnalysis,
) {
  await page.addInitScript(() => sessionStorage.setItem('racionika.token.0.3.0', 'test-token'));
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
  await page.route(/\/v1\/analyze-(text|meal)$/, (r) =>
    r.fulfill({
      json: {
        analysis: responder(r.request().postDataJSON()),
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
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
}
async function textAnalyze(page: import('@playwright/test').Page) {
  await page.getByLabel('Что вы съели?').fill('Тестовая контрольная порция');
  await page.getByRole('button', { name: 'Определить КБЖУ', exact: true }).click();
}
test('этикетка сохраняет ккал, не переписывает их по 4/4/9', async ({ page }) => {
  const a = structuredClone(DEMO_MEAL);
  a.dish_name = 'Батончик';
  a.ingredients = [
    {
      ...a.ingredients[0],
      name: 'Батончик с клетчаткой',
      grams: 45,
      grams_range: [45, 45],
      per_100g: { kcal: 180, protein: 20, fat: 4, carbs: 8 },
    },
  ];
  await prepare(page, () => a);
  await textAnalyze(page);
  await expect(page.locator('.result-kcal')).toContainText('81');
  await expect(page.getByRole('button', { name: 'Повторить разбор' })).toHaveCount(0);
  await page.locator('.analysis-check summary').click();
  await expect(page.locator('.analysis-check')).toContainText('значения не изменены');
  await page.getByLabel('Приём пищи для блюда').selectOption('snack');
  await page.getByRole('button', { name: 'Сохранить блюдо', exact: true }).click();
  await page.reload();
  await expect(page.locator('.calorie-orbit strong')).toHaveText('81');
});
test('повтор нельзя сохранить, удаление лишней строки исправляет итог', async ({ page }) => {
  const a = structuredClone(DEMO_MEAL);
  a.ingredients.push({ ...a.ingredients[0] });
  await prepare(page, () => a);
  await textAnalyze(page);
  await expect(page.getByRole('alert')).toContainText('Возможный повтор');
  await expect(page.getByRole('button', { name: 'Сохранить блюдо', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Удалить продукт 3', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.result-kcal')).toContainText('482');
  await page.getByLabel('Масса ингредиента 1', { exact: true }).fill('300');
  await expect(page.getByRole('button', { name: 'Сохранить блюдо', exact: true })).toBeEnabled();
  await expect(page.locator('.result-kcal')).toContainText('729');
});
test('уточнение — новый запрос, согласие повторно не требуется, добавки не угадываются', async ({
  page,
}) => {
  let calls = 0;
  await prepare(page, (payload) => {
    calls++;
    const a = structuredClone(DEMO_MEAL);
    if (payload.hint.includes('рис 100 г')) {
      a.ingredients[1].grams = 100;
      a.ingredients[1].grams_range = [100, 100];
    }
    return a;
  });
  await textAnalyze(page);
  await expect(page.locator('.ingredient-title')).toHaveCount(2);
  await page.locator('.analysis-check summary').click();
  await page.getByLabel('Уточнение', { exact: true }).fill('Готовый рис 100 г, без масла');
  await page.getByRole('button', { name: 'Повторить разбор', exact: true }).click();
  await expect(page.locator('.result-grams')).toContainText('250');
  await expect(page.locator('.result-kcal')).toContainText('378');
  expect(calls).toBe(2);
  await expect(page.locator('.ingredient-title')).toHaveCount(2);
  await expect(page.getByRole('dialog').locator('.consent')).toHaveCount(0);
});
test('одинаковое фото не добавляется дважды, фото-результат позволяет убрать соус', async ({
  page,
}) => {
  let imageCount = 0;
  let encodedImage = '';
  const a = structuredClone(DEMO_MEAL);
  a.ingredients.push({
    name: 'Соус с упаковки',
    grams: 20,
    grams_range: [20, 20],
    per_100g: { kcal: 240, protein: 1, fat: 20, carbs: 14 },
    confidence: 1,
  });
  await prepare(page, () => a);
  page.on('request', (r) => {
    if (r.url().includes('/v1/analyze-meal')) {
      imageCount = r.postDataJSON().images.length;
      encodedImage = r.postDataJSON().images[0].data;
    }
  });
  await page.getByRole('button', { name: 'По фото', exact: true }).click();
  const buffer = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2000;
      canvas.height = 1500;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 2000, 1500);
      ctx.fillStyle = 'black';
      ctx.font = '80px Arial';
      ctx.fillText('Тестовая этикетка — не реальное блюдо', 80, 300);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  await page.locator('input[type=file]').setInputFiles([
    { name: 'meal1.png', mimeType: 'image/png', buffer },
    { name: 'meal2.png', mimeType: 'image/png', buffer },
  ]);
  await expect(page.locator('.photo-grid img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Определить КБЖУ', exact: true }).click();
  await expect(page.locator('.result-kcal')).toContainText('530');
  expect(imageCount).toBe(1);
  const width = await page.evaluate(
    (data) =>
      new Promise<number>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image.naturalWidth);
        image.src = 'data:image/jpeg;base64,' + data;
      }),
    encodedImage,
  );
  expect(width).toBe(1280);
  await page.getByRole('button', { name: 'Удалить продукт 3', exact: true }).click();
  await expect(page.locator('.result-kcal')).toContainText('482');
});
