import { test, expect } from './fixtures';
test('добавить еду можно только в Дневнике, без дублей и постоянных предупреждений', async ({
  page,
}) => {
  await page.goto('/');
  for (const tab of ['Главная', 'Наставник', 'Прогресс', 'Профиль']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Добавить еду', exact: true })).toHaveCount(0);
    await expect(page.locator('.diary-meals, .disclaimer')).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'ИИ и приватность' })).toHaveCount(0);
  await expect(page.locator('.daily-calorie-goal')).toContainText('2136');
  await expect(
    page.getByRole('button', { name: 'Изменить данные профиля', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Добавить еду', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Определить КБЖУ', exact: true })).toHaveCount(0);
});
test('сохранение и удаление не оставляют навязчивых статусов', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'Внести КБЖУ вручную' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Тест без баннера');
  await page.getByLabel('Масса порции, г').fill('100');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(page.locator('.meals li')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Удалить Тест без баннера', exact: true }).click();
  await expect(page.locator('.meals li')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
});
