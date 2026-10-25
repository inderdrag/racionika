import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
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
async function openProgress(page: Page) {
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мой вес', exact: true })).toBeVisible();
}
async function seeded(page: Page, custom = false) {
  await page.goto('/');
  await expect(page.locator('.energy-copy')).toBeVisible();
  await page.evaluate(async (custom) => {
    const profile = JSON.parse(localStorage.getItem('racionika.profile')!);
    profile.updatedAt = '2020-01-01T12:00:00Z';
    if (custom) profile.customCalories = 2000;
    localStorage.setItem('racionika.profile', JSON.stringify(profile));
    const date = (ago: number) => {
      const d = new Date();
      d.setDate(d.getDate() - ago);
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-');
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('racionika');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(['foodEntries', 'waterLogs', 'weightLogs'], 'readwrite');
    for (const [ago, kcal, grams] of [
      [0, 200, 150],
      [2, 100, 200],
      [12, 100, 100],
    ] as const) {
      transaction.objectStore('foodEntries').put({
        id: `meal-${ago}`,
        day: date(ago),
        name: 'Тестовая еда',
        grams,
        per100: { kcal, protein: 10, fat: 0, carbs: 40 },
        createdAt: new Date().toISOString(),
      });
      transaction.objectStore('waterLogs').put({
        id: `water-${ago}`,
        day: date(ago),
        ml: ago === 0 ? 1000 : 500,
        createdAt: new Date().toISOString(),
      });
      transaction.objectStore('weightLogs').put({
        id: `weight-${date(ago)}`,
        day: date(ago),
        kg: ago === 0 ? 78 : 80,
        createdAt: new Date().toISOString(),
      });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, custom);
  await page.reload();
  await openProgress(page);
}
test('7/30 дней: средние по записям, точные значения, пропуски и отсутствие переполнения', async ({
  page,
}) => {
  await seeded(page);
  await expect(page.locator('.progress-calories .progress-average strong')).toHaveText('250');
  await expect(page.locator('.progress-water .progress-average strong')).toHaveText('750');
  await expect(page.locator('.progress-weight .progress-average strong')).toHaveText('79');
  await expect(page.locator('.progress-weight .progress-change')).toContainText('-2 кг');
  await page.locator('.progress-calories summary').click();
  await expect(page.locator('.progress-calories tbody tr')).toHaveCount(7);
  await expect(page.locator('.progress-calories tbody tr').last()).toContainText('300');
  await expect(page.locator('.progress-calories tbody tr').nth(1)).toContainText('—');
  await page.getByRole('button', { name: '30 дней', exact: true }).click();
  await expect(page.getByRole('button', { name: '30 дней', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.progress-calories .progress-average strong')).toHaveText('200');
  await expect(page.locator('.progress-calories tbody tr')).toHaveCount(30);
  await expect(page.locator('.progress-chart svg[role=img]')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('новый вес не меняет профиль без подтверждения; отмена и перезагрузка безопасны', async ({
  page,
}) => {
  await page.goto('/');
  await openProgress(page);
  await page.getByLabel('Вес сегодня, кг').fill('78');
  await page.getByRole('button', { name: 'Сохранить вес', exact: true }).click();
  await expect(page.locator('.weight-plan')).toContainText('80 кг → новое взвешивание 78 кг');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('racionika.profile')!).weight),
  ).toBe(80);
  await page.getByRole('button', { name: 'Посмотреть пересчёт', exact: true }).click();
  await expect(page.locator('.weight-plan .plan-preview')).toContainText('2136 → 2112 ккал');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.reload();
  await openProgress(page);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('racionika.profile')!).weight),
  ).toBe(80);
  await page.getByRole('button', { name: 'Посмотреть пересчёт', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить пересчёт', exact: true }).click();
  await expect(page.locator('.weight-plan')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.energy-copy')).toContainText('2112 ккал');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('racionika.profile')!).weight),
  ).toBe(78);
});
test('пересчёт сохраняет ручную цель, обновляет БЖУ; графики работают без интернета', async ({
  page,
  context,
}) => {
  await seeded(page, true);
  await page.getByRole('button', { name: 'Посмотреть пересчёт', exact: true }).click();
  await expect(page.locator('.weight-plan')).toContainText('ручная цель калорий останется прежней');
  await page.getByRole('button', { name: 'Подтвердить пересчёт', exact: true }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: '30 дней', exact: true }).click();
  await expect(page.locator('.progress-calories .progress-average strong')).toHaveText('200');
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await expect(page.locator('.energy-copy')).toContainText('2000 ккал');
  await expect(page.locator('.macros')).toContainText('из 125 г');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('racionika.profile')!).customCalories,
    ),
  ).toBe(2000);
});
test('пустые графики и удаление взвешивания не оставляют фиктивные показатели', async ({
  page,
}) => {
  await page.goto('/');
  await openProgress(page);
  await expect(page.locator('.progress-empty')).toHaveCount(3);
  await page.getByLabel('Вес сегодня, кг').fill('79');
  await page.getByRole('button', { name: 'Сохранить вес', exact: true }).click();
  await expect(page.locator('.progress-weight .progress-average strong')).toHaveText('79');
  await page.locator('.progress-history summary').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /^Удалить вес за/ }).click();
  await expect(page.locator('.progress-weight .progress-empty')).toBeVisible();
  await expect(page.locator('.weight-plan')).toHaveCount(0);
});
test('изменившийся профиль не перезаписывается старым подтверждением', async ({ page }) => {
  await seeded(page);
  await page.getByRole('button', { name: 'Посмотреть пересчёт', exact: true }).click();
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('racionika.profile')!);
    p.weight = 81;
    localStorage.setItem('racionika.profile', JSON.stringify(p));
  });
  await page.getByRole('button', { name: 'Подтвердить пересчёт', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Данные изменились');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('racionika.profile')!).weight),
  ).toBe(81);
});
