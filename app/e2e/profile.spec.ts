import { test, expect } from '@playwright/test';
// UI tests do not consume the shared server configuration request quota.
test.beforeEach(async ({ page }) => {
  await page.route('**/v1/config', (route) =>
    route.fulfill({
      json: {
        mode: 'demo',
        provider: 'anymodel',
        access_code_required: false,
        min_app_version: '0.2.0',
        maintenance: false,
      },
    }),
  );
});
async function register(page: import('@playwright/test').Page, consent = true) {
  await page.goto('/');
  await page.getByLabel('Имя', { exact: true }).fill('Алекс');
  await page.getByLabel('Пол для расчёта').selectOption('male');
  await page.getByLabel('Возраст, лет').fill('30');
  await page.getByLabel('Рост, см').fill('180');
  await page.getByLabel('Вес, кг', { exact: true }).fill('80');
  await page.getByRole('combobox', { name: 'Активность', exact: true }).selectOption('1.2');
  await page.getByLabel('Моя цель').selectOption('lose');
  await page.getByLabel('Целевой вес, кг').fill('70');
  await page.getByLabel('Темп, кг в неделю').fill('0.5');
  await page.getByRole('button', { name: 'Рассчитать мой план' }).click();
  await expect(page.getByRole('heading', { name: 'Ваш личный план' })).toBeVisible();
  await expect(page.locator('.plan-preview > strong')).toContainText('1602');
  await expect(page.getByRole('button', { name: 'Начать', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('racionika.profile'))).toBeNull();
  await page.getByRole('checkbox', { name: /Включить ИИ/ }).check();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Хороший день для себя' })).toBeVisible();
  if (!consent) {
    await page.evaluate(() => localStorage.removeItem('racionika.aiConsent'));
    await page.reload();
  }
}
test('первый вход: профиль, безопасная норма и одно согласие без кодов', async ({ page }) => {
  await register(page);
  await expect(page.locator('.energy-copy')).toContainText('1602 ккал');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Хороший день для себя' })).toBeVisible();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await expect(
    page.getByRole('dialog').locator('input[type=checkbox], input[type=password]'),
  ).toHaveCount(0);
  await page.getByLabel('Что вы съели?').fill('Курица с рисом');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Определить КБЖУ', exact: true })
    .click();
  await expect(page.locator('.result-kcal')).toContainText('482');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Наставник', exact: true }).click();
  await expect(
    page.locator('.coach-card input[type=checkbox], .coach-card input[type=password]'),
  ).toHaveCount(0);
  await page.getByLabel('Сообщение', { exact: true }).fill('Поддержи меня');
  const request = page.waitForRequest('**/v1/coach');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  const body = (await request).postDataJSON();
  expect(body.goal).toBe('lose');
  expect(JSON.parse(body.summary).profile.name).toBe('Алекс');
  await expect(page.getByText('Демо-наставник', { exact: true })).toBeVisible();
});
test('локальный дневник без согласия, отзыв в настройках блокирует новые запросы', async ({
  page,
}) => {
  await register(page, false);
  let requests = 0;
  page.on('request', (req) => {
    if (req.url().includes('/v1/analyze-text')) requests++;
  });
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByLabel('Что вы съели?').fill('Рис');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Определить КБЖУ', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Профиле');
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByText('Разрешения приложения', { exact: true }).click();
  await page.getByLabel('Использовать ИИ', { exact: true }).check();
  await expect(page.getByLabel('Использовать ИИ', { exact: true })).toBeChecked();
  await page.getByLabel('Использовать ИИ', { exact: true }).uncheck();
  await page.reload();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByText('Разрешения приложения', { exact: true }).click();
  await expect(page.getByLabel('Использовать ИИ', { exact: true })).not.toBeChecked();
});
test('настройки сна и интервала показывают только дневное расписание', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что пока не готово' })).toHaveCount(0);
  await page.getByLabel('Напоминать о еде').check();
  await page.getByLabel('Еда каждые, часов').fill('5');
  await page.getByLabel('Ложусь спать').fill('22:00');
  await page.getByLabel('Просыпаюсь').fill('08:00');
  await expect(page.locator('.schedule-preview')).toContainText('08:00, 13:00, 18:00');
  await page.getByLabel('Ложусь спать').fill('18:00');
  await expect(page.locator('.schedule-preview')).toContainText('08:00, 13:00.');
});
test('импорт старого JSON подтверждается и не создаёт дублей', async ({ page }) => {
  await register(page);
  const backup = {
    schemaVersion: 2,
    foodEntries: [
      {
        id: 'legacy-rice',
        name: 'Рис из копии',
        day: await page.locator('input[aria-label="Дата дневника"]').inputValue(),
        grams: 100,
        per100: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
        createdAt: '2026-10-24T12:00:00Z',
      },
    ],
    waterLogs: [],
  };
  const file = {
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  };
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Профиль', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByRole('heading', { name: 'Проверка перед импортом' })).toBeVisible();
    await page.getByRole('button', { name: 'Подтвердить импорт' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Записи восстановлены' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Дневник', exact: true }).click();
    await expect(page.locator('.meals li')).toHaveCount(1);
    await expect(page.locator('.calorie-orbit strong')).toHaveText('130');
  }
});
test('запись веса и профиль сохраняются после перезапуска', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await page.getByLabel('Вес сегодня, кг').fill('79.5');
  await page.getByRole('button', { name: 'Сохранить вес', exact: true }).click();
  await expect(page.locator('.weight-history')).toContainText('79,5 кг');
  await page.reload();
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await expect(page.locator('.weight-history')).toContainText('79,5 кг');
});
test('цель калорий заметна в Профиле, пересчитывается и сохраняется на Главной', async ({
  page,
}) => {
  await register(page, false);
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.locator('.calorie-goal-card')).toContainText('1602');
  await expect(
    page.getByText('Учитывать масло и добавки в новых блюдах', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Изменить данные профиля' }).click();
  await page.getByRole('combobox', { name: 'Моя цель', exact: true }).selectOption('maintain');
  await page.getByRole('button', { name: 'Рассчитать мой план' }).click();
  await expect(page.locator('.plan-preview > strong')).toContainText('2136');
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await expect(page.locator('.energy-copy')).toContainText('2136 ккал');
  await page.reload();
  await expect(page.locator('.energy-copy')).toContainText('2136 ккал');
});
