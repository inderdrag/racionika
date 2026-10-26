import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
async function settings(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Напоминания и поддержка' })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class TestNotification {
      static permission = 'granted';
      static async requestPermission() {
        return 'granted';
      }
    }
    Object.defineProperty(window, 'Notification', { value: TestNotification, configurable: true });
  });
});
test('дни недели, конкретное время и повторы сохраняются после перезапуска', async ({ page }) => {
  await settings(page);
  await page.getByLabel('Напоминать о еде', { exact: true }).check();
  await page.getByLabel('Расписание еды', { exact: true }).selectOption('times');
  await page.getByLabel('Время еды 1', { exact: true }).fill('08:30');
  await page.getByLabel('Время еды 2', { exact: true }).fill('13:15');
  await page.getByLabel('Время еды 3', { exact: true }).fill('18:45');
  await page.getByRole('checkbox', { name: 'Сб', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Вс', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Сохранить напоминания', exact: true }).click();
  await expect(page.locator('.notification-settings .notice')).toContainText('Сохранено.');
  await page.reload();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.getByLabel('Время еды 2', { exact: true })).toHaveValue('13:15');
  await expect(page.getByRole('checkbox', { name: 'Вс', exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Повторять, если еда не записана', { exact: true })).toBeChecked();
  await expect(page.locator('.schedule-preview')).toContainText('08:30, 13:15, 18:45');
});
test('пустые дни и еда во время сна не заменяют сохранённое расписание', async ({ page }) => {
  await settings(page);
  for (const day of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'])
    await page.getByRole('checkbox', { name: day, exact: true }).uncheck();
  await page.getByRole('button', { name: 'Сохранить напоминания', exact: true }).click();
  await expect(page.locator('.notification-settings .notice')).toContainText(
    'Выберите хотя бы один день',
  );
  expect(await page.evaluate(() => localStorage.getItem('racionika.reminders'))).toBeNull();
  await page.getByRole('checkbox', { name: 'Пн', exact: true }).check();
  await page.getByLabel('Напоминать о еде', { exact: true }).check();
  await page.getByLabel('Расписание еды', { exact: true }).selectOption('times');
  await page.getByLabel('Время еды 1', { exact: true }).fill('23:00');
  await page.getByRole('button', { name: 'Сохранить напоминания', exact: true }).click();
  await expect(page.locator('.notification-settings .notice')).toContainText('попадает на сон');
  expect(await page.evaluate(() => localStorage.getItem('racionika.reminders'))).toBeNull();
});
test('время можно добавлять и убирать, слишком близкие приёмы отклоняются', async ({ page }) => {
  await settings(page);
  await page.getByLabel('Напоминать о еде', { exact: true }).check();
  await page.getByLabel('Расписание еды', { exact: true }).selectOption('times');
  await page.getByRole('button', { name: 'Добавить время', exact: true }).click();
  await expect(page.getByLabel('Время еды 4', { exact: true })).toBeVisible();
  await page.getByLabel('Время еды 4', { exact: true }).fill('08:15');
  await page.getByRole('button', { name: 'Сохранить напоминания', exact: true }).click();
  await expect(page.locator('.notification-settings .notice')).toContainText(
    'интервал не меньше часа',
  );
  await page.getByRole('button', { name: 'Удалить время 4', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить напоминания', exact: true }).click();
  await expect(page.locator('.notification-settings .notice')).toContainText('Сохранено.');
});
test('можно отключить повтор и учёт нормы независимо от самих напоминаний', async ({ page }) => {
  await settings(page);
  await page.getByLabel('Напоминать о еде', { exact: true }).check();
  await page.getByLabel('Напоминать о воде', { exact: true }).check();
  await page.getByLabel('Повторять, если еда не записана', { exact: true }).uncheck();
  await page
    .getByLabel('Не напоминать после выполнения нормы еды или воды', { exact: true })
    .uncheck();
  await page.getByRole('button', { name: 'Сохранить напоминания', exact: true }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('racionika.reminders')!),
  );
  expect(stored).toMatchObject({
    meals: true,
    water: true,
    mealFollowups: false,
    stopWhenGoal: false,
  });
});
test('узкий экран и тест доставки не выдают браузер за закрытое Android-приложение', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await settings(page);
  await page.getByLabel('Напоминать о еде', { exact: true }).check();
  await page.getByLabel('Расписание еды', { exact: true }).selectOption('times');
  await page.getByText('Проверка на телефоне', { exact: true }).click();
  await page.getByRole('button', { name: 'Тестовое уведомление', exact: true }).click();
  await expect(page.locator('.notification-settings .notice')).toContainText('только на Android');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
