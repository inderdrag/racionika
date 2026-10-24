import { expect, test } from '@playwright/test';
test('ручной ввод как запасной путь, вода и перезагрузка', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'Внести КБЖУ вручную' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Овсяная каша');
  await page.getByLabel('Масса порции, г').fill('150');
  await page.getByLabel('Калории, ккал').fill('100');
  await page.getByLabel('Белки, г').fill('3');
  await page.getByLabel('Жиры, г').fill('2');
  await page.getByLabel('Углеводы, г').fill('17.5');
  await page.getByRole('button', { name: 'Сохранить запись' }).click();
  await expect(page.locator('.calorie-orbit strong')).toHaveText('150');
  await page.getByRole('button', { name: '+200', exact: true }).click();
  await page.reload();
  await expect(page.locator('.calorie-orbit strong')).toHaveText('150');
  await expect(page.locator('.water .section-head>strong')).toHaveText('200 мл');
});
test('описание → состав → локальный пересчёт → сохранение', async ({ page }) => {
  let requests = 0;
  page.on('request', (req) => {
    if (req.url().includes('/v1/analyze-text')) requests++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await expect(page.getByText('ДЕМО: фиксированный пример, без распознавания')).toBeVisible();
  await page.getByLabel('Что вы съели?').fill('Курица с рисом');
  await page.locator('.consent input').check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Определить КБЖУ', exact: true })
    .click();
  await expect(page.locator('.result-kcal')).toContainText('527');
  await page.getByLabel('Масса ингредиента 1', { exact: true }).fill('300');
  await expect(page.locator('.result-kcal')).toContainText('794');
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Сохранить демозапись' }).click();
  await expect(page.locator('.calorie-orbit strong')).toHaveText('794');
  await expect(page.getByText(/330|480/).first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.calorie-orbit strong')).toHaveText('794');
  await page.getByRole('button', { name: /^Демо: курица с рисом/ }).click();
  await expect(page.getByLabel('Масса ингредиента 1', { exact: true })).toHaveValue('300');
});
test('фото: сжатие JPEG, согласие, пометка демо', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'По фото', exact: true }).click();
  const png = await page.screenshot();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Фото блюда 1')).toBeVisible();
  await page.locator('.consent input').check();
  const request = page.waitForRequest((req) => req.url().includes('/v1/analyze-meal'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Определить КБЖУ', exact: true })
    .click();
  const payload = (await request).postDataJSON();
  expect(payload.images[0].mimeType).toBe('image/jpeg');
  expect(Buffer.from(payload.images[0].data, 'base64')[0]).toBe(255);
  await expect(page.getByRole('button', { name: 'Сохранить демозапись' })).toBeVisible();
});
test('наставник не выдаёт демо за настоящую рекомендацию', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Наставник', exact: true }).click();
  await expect(page.getByText('ДЕМО: фиксированный тестовый ответ, не совет ИИ.')).toBeVisible();
  await page.getByLabel('Сообщение', { exact: true }).fill('Что добавить к обеду?');
  await page.locator('.consent input').check();
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByText('Демо-наставник', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Наставник', exact: true }).click();
  await expect(page.getByText('Демо-наставник', { exact: true })).toBeVisible();
});
test('нет отправки без согласия и нет переполнения на 360×640', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByLabel('Что вы съели?').fill('Два яйца');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Определить КБЖУ', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('подтвердите');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .getByRole('dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});
test('повтор того же описания использует локальный кеш', async ({ page }) => {
  let requests = 0;
  page.on('request', (req) => {
    if (req.url().includes('/v1/analyze-text')) requests++;
  });
  await page.goto('/');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
    await page.getByLabel('Что вы съели?').fill('Курица с рисом');
    await page.locator('.consent input').check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Определить КБЖУ', exact: true })
      .click();
    await expect(page.locator('.result-kcal')).toContainText('527');
    if (i === 1) await expect(page.getByText(/Кеш не расходует запрос/)).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  }
  expect(requests).toBe(1);
});
test('lookup ингредиента и автодобавки пересчитываются', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByLabel('Что вы съели?').fill('Курица с рисом');
  await page.locator('.consent input').check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Определить КБЖУ', exact: true })
    .click();
  await expect(page.locator('.result-kcal')).toContainText('527');
  await page.getByLabel('Уровень автодобавок').selectOption('0');
  await expect(page.locator('.result-kcal')).toContainText('482');
  await page.getByLabel('Добавить ингредиент', { exact: true }).fill('яблоко');
  await page.getByRole('button', { name: 'Найти КБЖУ через ИИ' }).click();
  await expect(page.getByLabel('Название ингредиента 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить демозапись' })).toBeVisible();
});
test('серверная ошибка квоты понятна и ручной ввод остаётся', async ({ page }) => {
  await page.route('**/v1/analyze-text', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'quota_exceeded',
          message_ru: 'Лимит ИИ на сегодня исчерпан. Ручной ввод доступен.',
        },
      }),
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByLabel('Что вы съели?').fill('Два яйца');
  await page.locator('.consent input').check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Определить КБЖУ', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Лимит ИИ');
  await page.getByRole('button', { name: 'Внести КБЖУ вручную' }).click();
  await expect(page.getByLabel('Калории, ккал')).toBeVisible();
});
test('ответ «не еда» не сохраняется в дневник', async ({ page }) => {
  await page.route('**/v1/analyze-text', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.analysis = {
      ...body.analysis,
      is_food: false,
      ingredients: [],
      dish_name: '',
      warnings: [],
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByLabel('Что вы съели?').fill('Стул');
  await page.locator('.consent input').check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Определить КБЖУ', exact: true })
    .click();
  await expect(
    page.getByText(
      'На изображении не распознана еда. Попробуйте другое фото или текстовое описание.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить демозапись' })).toHaveCount(0);
});
