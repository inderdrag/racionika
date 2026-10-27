import { captureFood } from './product-helpers';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function profile(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
}
async function downloadJson(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать JSON', exact: true }).click();
  return readFile((await (await download).path())!);
}
async function importFile(page: Page, data: unknown) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
}
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
test('единицы сохраняются: вода в литрах, вес в фунтах; БД остаётся метрической', async ({
  page,
}) => {
  await profile(page);
  await page.getByRole('combobox', { name: 'Единицы веса', exact: true }).selectOption('lb');
  await page.getByRole('combobox', { name: 'Единицы воды', exact: true }).selectOption('l');
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await page.getByLabel('Свой объём, л', { exact: true }).fill('0.25');
  await page.getByRole('button', { name: 'Добавить воду', exact: true }).click();
  await expect(page.locator('.water .section-head')).toContainText('0,25');
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await page.getByLabel('Вес сегодня, фунт.', { exact: true }).fill('220.5');
  await page.getByRole('button', { name: 'Сохранить вес', exact: true }).click();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  const backup = JSON.parse((await downloadJson(page)).toString());
  expect(backup.waterLogs[0].ml).toBe(250);
  expect(backup.weightLogs[0].kg).toBeCloseTo(100.018, 2);
  expect(backup.profile.weight).toBe(80);
  await page.reload();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Единицы воды', exact: true })).toHaveValue('l');
  await expect(page.getByRole('combobox', { name: 'Единицы веса', exact: true })).toHaveValue('lb');
});
test('редактирование профиля в фунтах не меняет исходный вес при неизменном поле', async ({
  page,
}) => {
  await profile(page);
  await page.getByRole('combobox', { name: 'Единицы веса', exact: true }).selectOption('lb');
  await page.getByRole('button', { name: 'Изменить данные профиля', exact: true }).click();
  await expect(page.getByLabel('Вес, фунт.', { exact: true })).toHaveValue('176.4');
  await page.getByRole('button', { name: 'Рассчитать мой план', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('racionika.profile')!).weight),
  ).toBe(80);
});
test('качество по умолчанию применяется к новому разбору без лишних настроек перед снимком', async ({
  page,
}) => {
  await profile(page);
  await page
    .getByRole('combobox', { name: 'Качество распознавания по умолчанию', exact: true })
    .selectOption('accurate');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: 'Качество', exact: true }),
  ).toHaveCount(0);
  const request = page.waitForRequest((r) => r.url().includes('/v1/analyze-meal'));
  await captureFood(page);
  expect((await request).postDataJSON().quality).toBe('accurate');
  await expect(page.locator('.result-kcal')).toBeVisible();
});
test('CSV в UTF-8 за выбранные даты и пустые дни не превращаются в нули', async ({ page }) => {
  await profile(page);
  await page.getByLabel('С даты', { exact: true }).fill('2026-10-01');
  await page.getByLabel('По дату', { exact: true }).fill('2026-10-31');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить CSV', exact: true }).click();
  const file = await download,
    bytes = await readFile((await file.path())!);
  expect(file.suggestedFilename()).toBe('racionika-days-2026-10-01-2026-10-31.csv');
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect(bytes.toString()).toBe(
    '\uFEFF"Дата";"Калории, ккал";"Белки, г";"Жиры, г";"Углеводы, г";"Вода, мл";"Вес, кг"\r\n',
  );
});
test('v5 проверяет checksum, не подменяет профиль без выбора и не переносит согласия', async ({
  page,
}) => {
  await profile(page);
  const backup = JSON.parse((await downloadJson(page)).toString());
  expect(backup.schemaVersion).toBe(5);
  expect(backup.integrity.digest).toHaveLength(64);
  await importFile(page, { ...backup, profile: { ...backup.profile, name: 'Изменено' } });
  await expect(page.getByRole('button', { name: 'Подтвердить импорт', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('status')).toContainText('Данные не изменены');
  await importFile(page, backup);
  await expect(page.getByText('Контрольная сумма проверена.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Восстановить профиль: Тест', { exact: true })).not.toBeChecked();
  await expect(
    page.getByLabel('Восстановить единицы, качество ИИ и тему', { exact: true }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Подтвердить импорт', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('racionika.aiConsent'))).toBe('v2');
});
test('старые копии принимаются и профиль/настройки восстанавливаются только явно', async ({
  page,
}) => {
  await profile(page);
  const old = JSON.parse((await downloadJson(page)).toString());
  old.schemaVersion = 4;
  delete old.integrity;
  old.profile.name = 'Из копии';
  old.preferences.weightUnit = 'lb';
  old.theme = 'dark';
  await importFile(page, old);
  await page.getByRole('button', { name: 'Подтвердить импорт', exact: true }).click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('racionika.profile')!).name),
  ).toBe('Тест');
  await importFile(page, old);
  await page.getByLabel('Восстановить профиль: Из копии', { exact: true }).check();
  await page.getByLabel('Восстановить единицы, качество ИИ и тему', { exact: true }).check();
  await page.getByRole('button', { name: 'Подтвердить импорт', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Из копии', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Единицы веса', exact: true })).toHaveValue('lb');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
test('лицензии читаются без сети; длинный текст не расширяет экран', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await profile(page);
  await context.setOffline(true);
  await page.getByText('О приложении и лицензии', { exact: true }).click();
  await page
    .locator('.licenses details')
    .filter({ has: page.locator('summary').filter({ hasText: '@fontsource/manrope' }) })
    .locator('summary')
    .click();
  await expect(
    page.locator('.licenses pre').filter({ hasText: 'SIL OPEN FONT LICENSE' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('ошибка сохранения настроек откатывает реальные таблицы импорта и профиль', async ({
  page,
}) => {
  await profile(page);
  const backup = JSON.parse((await downloadJson(page)).toString());
  backup.schemaVersion = 4;
  delete backup.integrity;
  backup.profile.name = 'Не сохранять';
  backup.waterLogs = [
    { id: 'rollback-water', day: '2026-10-24', ml: 250, createdAt: '2026-10-24T12:00:00Z' },
  ];
  await importFile(page, backup);
  await page.getByLabel('Восстановить профиль: Не сохранять', { exact: true }).check();
  await page.getByLabel('Восстановить единицы, качество ИИ и тему', { exact: true }).check();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'racionika.preferences') throw new Error('Тест: нет места');
      return original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Подтвердить импорт', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Тест: нет места');
  const data = JSON.parse((await downloadJson(page)).toString());
  expect(data.waterLogs).toEqual([]);
  expect(data.profile.name).toBe('Тест');
});
test('CSV выбирает даты, считает порции и защищает названия/заметки от формул', async ({
  page,
}) => {
  await profile(page);
  const template = {
    grams: 150,
    per100: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
    createdAt: '2026-10-24T12:00:00Z',
    mealType: 'lunch',
    eatenTime: '12:30',
    note: '@formula',
  };
  await importFile(page, {
    schemaVersion: 4,
    foodEntries: [
      { ...template, id: 'one', day: '2026-10-24', name: '=danger' },
      { ...template, id: 'two', day: '2026-10-25', name: 'Не в отчёте' },
    ],
    waterLogs: [],
  });
  await page.getByRole('button', { name: 'Подтвердить импорт', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Записи восстановлены');
  await page.getByRole('combobox', { name: 'Вид отчёта', exact: true }).selectOption('meals');
  await page.getByLabel('С даты', { exact: true }).fill('2026-10-24');
  await page.getByLabel('По дату', { exact: true }).fill('2026-10-24');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить CSV', exact: true }).click();
  const text = (await readFile((await (await download).path())!)).toString();
  expect(text).toContain('"Обед";"12:30";"\'=danger";"150";"195"');
  expect(text).toContain('"\'@formula"');
  expect(text).not.toContain('Не в отчёте');
});
