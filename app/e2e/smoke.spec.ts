import { expect, test } from '@playwright/test';
test('ручная запись, пересчёт, вода и перезагрузка', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Хороший день для себя' })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Овсяная каша');
  await page.getByLabel('Масса порции, г').fill('150');
  await page.getByLabel('Калории, ккал').fill('100');
  await page.getByLabel('Белки, г').fill('3');
  await page.getByLabel('Жиры, г').fill('2');
  await page.getByLabel('Углеводы, г').fill('17.5');
  await page.getByRole('button', { name: 'Сохранить запись' }).click();
  await expect(page.locator('.calorie-orbit strong')).toHaveText('150');
  await page.getByRole('button', { name: '+200', exact: true }).click();
  await expect(page.locator('.water .section-head>strong')).toHaveText('200 мл');
  await page.reload();
  await expect(page.locator('.calorie-orbit strong')).toHaveText('150');
  await expect(page.locator('.water .section-head>strong')).toHaveText('200 мл');
  await page.getByRole('button', { name: /^Овсяная каша/ }).click();
  await page.getByLabel('Масса порции, г').fill('200');
  await page.getByRole('button', { name: 'Сохранить запись' }).click();
  await expect(page.locator('.calorie-orbit strong')).toHaveText('200');
});
test('ИИ не выдаётся за работающий', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Наставник', exact: true }).click();
  await expect(page.getByText('Наставник ещё учится')).toBeVisible();
  await expect(
    page.getByText(
      'ИИ не подключён в этой технической сборке. Фото и сообщения никуда не отправляются.',
    ),
  ).toBeVisible();
});
test('экран 360×640 без горизонтального переполнения', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
