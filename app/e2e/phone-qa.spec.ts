import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
async function manual(page: Page, name = 'Контрольная запись') {
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'Внести КБЖУ вручную' }).click();
  await page.getByLabel('Название', { exact: true }).fill(name);
  await page.getByLabel('Масса порции, г').fill('100');
  await page.getByLabel('Калории, ккал').fill('100');
  await page.getByLabel('Белки, г').fill('5');
  await page.getByLabel('Жиры, г').fill('2');
  await page.getByLabel('Углеводы, г').fill('15');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(page.locator('.meals li')).toContainText(name);
}
function backup(day: string) {
  return {
    schemaVersion: 2,
    foodEntries: [
      {
        id: 'qa-import',
        day,
        name: 'Импортируемая запись',
        grams: 100,
        per100: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
        createdAt: '2026-10-24T12:00:00Z',
      },
    ],
    waterLogs: [],
  };
}
function jsonFile(value: unknown) {
  return {
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  };
}
test('без сети доступны ручной дневник, вода и вес; данные переживают перезапуск', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await context.setOffline(true);
  await manual(page);
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await page.getByRole('button', { name: '+250', exact: true }).click();
  await expect(page.locator('.water .section-head > strong')).toHaveText('250 мл');
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await page.getByLabel('Вес сегодня, кг').fill('79.2');
  await page.getByRole('button', { name: 'Сохранить вес', exact: true }).click();
  await expect(page.locator('.weight-history')).toContainText('79.2 кг');
  await context.setOffline(false); // Browser shell needs HTTP, unlike assets bundled in APK.
  await page.route('**/v1/**', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.meals li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await expect(page.locator('.water .section-head > strong')).toHaveText('250 мл');
  expect(errors).toEqual([]);
});
test('правка профиля сохраняет новую норму после перезагрузки без удаления дневника', async ({
  page,
}) => {
  await page.goto('/');
  await manual(page);
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить данные профиля' }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Проверка профиля');
  await page.getByLabel('Вес, кг', { exact: true }).fill('78.5');
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveAttribute('inputmode', 'decimal');
  await page.getByRole('button', { name: 'Рассчитать мой план' }).click();
  await expect(page.locator('.plan-preview > strong')).toContainText('2118');
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await expect(page.locator('.energy-copy')).toContainText('2118');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.meals li')).toHaveCount(1);
});
test('повреждённый новый JSON убирает старое preview и не меняет дневник', async ({ page }) => {
  await page.goto('/');
  await manual(page);
  const day = await page.getByLabel('Дата дневника').inputValue();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(jsonFile(backup(day)));
  await expect(page.getByRole('button', { name: 'Подтвердить импорт' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{bad'),
  });
  await expect(page.getByRole('status').filter({ hasText: 'Данные не изменены' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Подтвердить импорт' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.meals li')).toHaveCount(1);
  await expect(page.locator('.meals li')).toContainText('Контрольная запись');
});
test('отмена preview JSON не записывает ничего', async ({ page }) => {
  await page.goto('/');
  const day = await page.getByLabel('Дата дневника').inputValue();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(jsonFile(backup(day)));
  await page.getByRole('button', { name: 'Отмена импорта' }).click();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.meals li')).toHaveCount(0);
});
test('JSON-экспорт восстанавливает еду, воду и вес в чистом хранилище', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await manual(page);
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await page.getByRole('button', { name: '+200', exact: true }).click();
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await page.getByLabel('Вес сегодня, кг').fill('79.5');
  await page.getByRole('button', { name: 'Сохранить вес', exact: true }).click();
  await expect(page.locator('.weight-history')).toContainText('79.5 кг');
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать JSON' }).click();
  const file = await download;
  const bytes = await readFile((await file.path())!);
  const value = JSON.parse(bytes.toString());
  expect(value.foodEntries).toHaveLength(1);
  expect(value.waterLogs).toHaveLength(1);
  expect(value.weightLogs).toHaveLength(1);
  expect(value).not.toHaveProperty('token');
  expect(value).not.toHaveProperty('consent');
  const profile = await page.evaluate(() => localStorage.getItem('racionika.profile'));
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await fresh.addInitScript((p) => {
      localStorage.setItem('racionika.profile', p!);
    }, profile);
    const other = await fresh.newPage();
    await other.goto(page.url());
    await other.getByRole('button', { name: 'Профиль', exact: true }).click();
    await other.locator('input[type=file]').setInputFiles({
      name: file.suggestedFilename(),
      mimeType: 'application/json',
      buffer: bytes,
    });
    await other.getByRole('button', { name: 'Подтвердить импорт' }).click();
    await expect(
      other.getByRole('status').filter({ hasText: 'Записи восстановлены' }),
    ).toBeVisible();
    await other.getByRole('button', { name: 'Дневник', exact: true }).click();
    await expect(other.locator('.meals li')).toHaveCount(1);
    await other.getByRole('button', { name: 'Главная', exact: true }).click();
    await expect(other.locator('.water .section-head > strong')).toHaveText('200 мл');
    await other.getByRole('button', { name: 'Прогресс', exact: true }).click();
    await expect(other.locator('.weight-history')).toContainText('79.5 кг');
    await other.getByRole('button', { name: 'Профиль', exact: true }).click();
    await other.getByText('Разрешения приложения', { exact: true }).click();
    await expect(other.getByLabel('Использовать ИИ', { exact: true })).not.toBeChecked();
  } finally {
    await fresh.close();
  }
});
test('ошибка фото понятна; пустой или повреждённый файл не отправляется в ИИ', async ({ page }) => {
  let analyses = 0;
  page.on('request', (r) => {
    if (r.url().includes('/v1/analyze-meal')) analyses++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'По фото', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByRole('alert')).toContainText('Не удалось открыть фото');
  await expect(page.getByAltText('Фото блюда 1')).toHaveCount(0);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Определить КБЖУ', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Добавьте фотографию');
  expect(analyses).toBe(0);
});
test('ограничение трёх фото и удаление выбранного фото не оставляют скрытого запроса', async ({
  page,
}) => {
  await page.goto('/');
  const png = await page.screenshot();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'По фото', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(
    Array.from({ length: 4 }, (_, i) => ({
      name: `meal-${i}.png`,
      mimeType: 'image/png',
      buffer: png,
    })),
  );
  await expect(page.getByRole('alert')).toContainText('до трёх фотографий');
  await expect(page.getByAltText('Фото блюда 1')).toHaveCount(0);
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('Фото блюда 1')).toBeVisible();
  await page.getByRole('button', { name: 'Удалить фото 1', exact: true }).click();
  await expect(page.getByAltText('Фото блюда 1')).toHaveCount(0);
});
test('высота как при открытой клавиатуре: диалог прокручивается и возвращает фокус', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 360 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'Внести КБЖУ вручную' }).click();
  await expect(page.getByLabel('Название', { exact: true })).toBeFocused();
  const button = page.getByRole('button', { name: 'Сохранить запись', exact: true });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Добавить еду', exact: true })).toBeFocused();
});
test('обновление базы v1 → v4 сохраняет старые ручные записи', async ({ page }) => {
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'document'
      ? route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Migration fixture</title>',
        })
      : route.continue(),
  );
  await page.goto('/');
  const day = await page.evaluate(() => {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  });
  await page.evaluate(async (day) => {
    await new Promise<void>((resolve, reject) => {
      const remove = indexedDB.deleteDatabase('racionika');
      remove.onsuccess = () => resolve();
      remove.onerror = () => reject(remove.error);
      remove.onblocked = () => reject(new Error('Old connection blocked migration fixture'));
    });
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('racionika', 10); // Dexie version(1) maps to IndexedDB 10.
      open.onupgradeneeded = () => {
        for (const name of ['foodEntries', 'waterLogs']) {
          const store = open.result.createObjectStore(name, { keyPath: 'id' });
          store.createIndex('day', 'day');
          store.createIndex('createdAt', 'createdAt');
        }
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('foodEntries', 'readwrite');
        tx.objectStore('foodEntries').put({
          id: 'v1-kept',
          day,
          name: 'Старая запись v1',
          grams: 100,
          per100: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
          createdAt: '2026-10-24T12:00:00Z',
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, day);
  await page.unroute('**/*');
  await page.reload();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.meals li')).toContainText('Старая запись v1');
  await expect(page.locator('.calorie-orbit strong')).toHaveText('130');
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await page.getByLabel('Вес сегодня, кг').fill('79');
  await page.getByRole('button', { name: 'Сохранить вес', exact: true }).click();
  await expect(page.locator('.weight-history')).toContainText('79 кг');
});
