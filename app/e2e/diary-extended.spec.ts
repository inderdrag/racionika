import { captureFood, openEntryEditor } from './product-helpers';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { APP_VERSION } from '@racionika/shared';
import { DEMO_MEAL } from '../../server/src/providers/mock';
// UI scenarios reuse a known demo configuration instead of spending the shared
// server's per-IP allowance on repeated configuration warmups. Production limits stay intact.
test.beforeEach(async ({ page }) => {
  await page.route('**/v1/config', (route) =>
    route.fulfill({
      json: {
        mode: 'demo',
        access_code_required: false,
        min_app_version: '0.2.0',
        provider: 'anthropic',
        maintenance: false,
      },
    }),
  );
});
async function meal(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await openEntryEditor(page);
  await page.getByLabel('Название', { exact: true }).fill('Овсянка');
  await page.getByLabel('Калории, ккал').fill('100');
  await page.getByLabel('Белки, г').fill('5');
  await page.getByLabel('Жиры, г').fill('2');
  await page.getByLabel('Углеводы, г').fill('15');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
}
async function actions(page: Page) {
  const item = page.locator('.diary-entry').first().locator('details');
  if (!(await item.evaluate((el) => el.hasAttribute('open'))))
    await item.locator('summary').click();
}
async function details(page: Page) {
  await actions(page);
  await page.getByRole('button', { name: 'Время и заметка', exact: true }).click();
  await page.getByRole('combobox', { name: 'Приём пищи', exact: true }).selectOption('breakfast');
  await page.getByLabel('Время еды', { exact: true }).fill('08:15');
  await page.getByLabel('Заметка', { exact: true }).fill('Домашний завтрак');
  await page.getByRole('button', { name: 'Сохранить детали' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Завтрак', exact: true })).toContainText(
    'Домашний завтрак',
  );
}
test('категория, время и заметка сохраняются, правка порции их не стирает', async ({ page }) => {
  await meal(page);
  await details(page);
  await page.reload();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  const breakfast = page.getByRole('region', { name: 'Завтрак', exact: true });
  await expect(breakfast).toContainText('08:15');
  await expect(breakfast).toContainText('Домашний завтрак');
  await expect(breakfast).toContainText('100 ккал');
  await breakfast.locator('.meal-edit').click();
  await page.getByLabel('Масса порции, г').fill('200');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(breakfast).toContainText('200 ккал');
  await expect(breakfast).toContainText('Домашний завтрак');
  await expect(breakfast).toContainText('08:15');
});
test('копирование на дату создаёт отдельную запись и сохраняет исходную', async ({ page }) => {
  await meal(page);
  await details(page);
  await actions(page);
  await page.getByRole('button', { name: 'Копировать на дату' }).click();
  await page.getByLabel('Дата добавления').fill('2026-11-12');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.locator('.meals li')).toHaveCount(1);
  await page.getByLabel('Дата дневника').fill('2026-11-12');
  await expect(page.locator('.meals li')).toHaveCount(1);
  await expect(page.locator('.meals li')).toContainText('Домашний завтрак');
  await page.locator('.meal-edit').click();
  await page.getByLabel('Название', { exact: true }).fill('Копия овсянки');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await page.getByLabel('Дата дневника').fill(new Date().toLocaleDateString('sv-SE'));
  await expect(page.locator('.meals li')).toContainText('Овсянка');
  await expect(page.locator('.meals li')).not.toContainText('Копия овсянки');
});
test('избранное переживает удаление исходной записи и добавляется без ИИ', async ({ page }) => {
  await meal(page);
  await actions(page);
  await page.locator('.diary-entry .favorite-heart').click();
  await expect(page.locator('.library-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Удалить Овсянка', exact: true }).click();
  await expect(page.locator('.meals li')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.library-list li')).toHaveCount(1);
  let requests = 0;
  await page.route('**/v1/analyze-meal', (route) => {
    requests++;
    return route.abort();
  });
  await page.getByRole('button', { name: 'Добавить Овсянка из списка' }).click();
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('lunch');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Обед', exact: true })).toContainText('Овсянка');
  expect(requests).toBe(0);
  await page.locator('.library-list .favorite-heart').click();
  await expect(page.locator('.library-list li')).toHaveCount(0);
  await expect(page.locator('.meals li')).toHaveCount(1);
});
test('недавние позволяют повторить блюдо, одинаковый рецепт не дублируется в списке', async ({
  page,
}) => {
  await meal(page);
  await page.getByRole('button', { name: 'Недавние', exact: true }).click();
  await expect(page.locator('.library-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Добавить Овсянка из списка' }).click();
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('lunch');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await expect(page.locator('.meals li')).toHaveCount(2);
  await expect(page.locator('.library-list li')).toHaveCount(1);
});
test('детали и избранное сохраняются в экспорте и восстанавливаются после удаления', async ({
  page,
}) => {
  await meal(page);
  await details(page);
  await actions(page);
  await page.locator('.diary-entry .favorite-heart').click();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать JSON' }).click();
  const file = await download;
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile((await file.path())!);
  const data = JSON.parse(bytes.toString());
  expect(data.schemaVersion).toBe(5);
  expect(data.favoriteDishes).toHaveLength(1);
  expect(data.foodEntries[0].mealType).toBe('breakfast');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить Овсянка', exact: true }).click();
  await page.locator('.library-list .favorite-heart').click();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: bytes });
  await page.getByRole('button', { name: 'Подтвердить импорт' }).click();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Завтрак', exact: true })).toContainText(
    'Домашний завтрак',
  );
  await expect(page.locator('.library-list li')).toHaveCount(1);
});
test('миграция v3 → v4 сохраняет все старые таблицы', async ({ page }) => {
  // Seed the old database before React/liveQuery can reopen the new schema.
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'document'
      ? route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Migration fixture</title>',
        })
      : route.continue(),
  );
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('racionika');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('racionika', 30);
      request.onupgradeneeded = () => {
        for (const name of ['foodEntries', 'waterLogs', 'weightLogs', 'chatMessages', 'aiCache']) {
          const s = request.result.createObjectStore(name, {
            keyPath: name === 'aiCache' ? 'hash' : 'id',
          });
          s.createIndex('createdAt', 'createdAt');
          if (['foodEntries', 'waterLogs', 'weightLogs'].includes(name))
            s.createIndex('day', 'day');
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const d = request.result;
        const tx = d.transaction(
          ['foodEntries', 'waterLogs', 'weightLogs', 'chatMessages', 'aiCache'],
          'readwrite',
        );
        const base = { day: '2026-10-24', createdAt: '2026-10-24T12:00:00Z' };
        tx.objectStore('foodEntries').put({
          ...base,
          id: 'old',
          name: 'Старая еда',
          grams: 100,
          per100: { kcal: 100, protein: 5, fat: 2, carbs: 15 },
        });
        tx.objectStore('waterLogs').put({ ...base, id: 'water', ml: 200 });
        tx.objectStore('weightLogs').put({ ...base, id: 'weight', kg: 80 });
        tx.objectStore('chatMessages').put({
          id: 'chat',
          createdAt: base.createdAt,
          role: 'user',
          text: 'Тест',
        });
        tx.objectStore('aiCache').put({ hash: 'cache', createdAt: 1, response: { fixture: true } });
        tx.oncomplete = () => {
          d.close();
          resolve();
        };
        tx.onerror = () => {
          d.close();
          reject(tx.error);
        };
      };
    });
  });
  await page.unroute('**/*');
  await page.reload();
  await page.getByLabel('Дата дневника').fill('2026-10-24');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.locator('.meals li')).toContainText('Старая еда');
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await expect(page.locator('.water .section-head > strong')).toHaveText('200 мл');
  const counts = await page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const r = indexedDB.open('racionika');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const d = r.result;
          const names = Array.from(d.objectStoreNames);
          const tx = d.transaction(names, 'readonly');
          const out: Record<string, number> = {};
          for (const name of names) {
            const q = tx.objectStore(name).count();
            q.onsuccess = () => (out[name] = q.result);
          }
          tx.oncomplete = () => {
            d.close();
            resolve(out);
          };
        };
      }),
  );
  expect(counts).toEqual({
    foodEntries: 1,
    waterLogs: 1,
    weightLogs: 1,
    chatMessages: 1,
    aiCache: 1,
    favoriteDishes: 0,
  });
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Без категории', exact: true })).toContainText(
    'Старая еда',
  );
});
test('все четыре категории работают, отмена и очистка заметки безопасны', async ({ page }) => {
  await meal(page);
  await actions(page);
  for (const [value, label] of [
    ['breakfast', 'Завтрак'],
    ['lunch', 'Обед'],
    ['dinner', 'Ужин'],
    ['snack', 'Перекус'],
  ]) {
    await actions(page);
    await page.getByRole('button', { name: 'Время и заметка', exact: true }).click();
    await page.getByRole('combobox', { name: 'Приём пищи', exact: true }).selectOption(value);
    await page.getByLabel('Заметка', { exact: true }).fill('Тест');
    await page.getByRole('button', { name: 'Сохранить детали' }).click();
    await expect(page.getByRole('region', { name: label, exact: true })).toContainText('Овсянка');
  }
  await actions(page);
  await page.getByRole('button', { name: 'Время и заметка', exact: true }).click();
  await page.getByLabel('Заметка', { exact: true }).fill('Несохранённый текст');
  await page.keyboard.press('Escape');
  await expect(page.locator('.diary-note')).toHaveText('Тест');
  await page.getByRole('button', { name: 'Время и заметка', exact: true }).click();
  await page.getByLabel('Заметка', { exact: true }).fill('');
  await page.getByLabel('Время еды', { exact: true }).fill('');
  await page.getByRole('combobox', { name: 'Приём пищи', exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Сохранить детали' }).click();
  await expect(page.locator('.diary-note')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Без категории', exact: true })).toContainText(
    'Овсянка',
  );
});
test('блюдо ИИ сохраняет детали при правке состава и копируется без нового анализа', async ({
  page,
}) => {
  // This test covers local recipe editing/copying, not authentication/provider integration.
  await page.addInitScript(
    (version) =>
      sessionStorage.setItem(`racionika.token.${version}`, 'ui-fixture-not-a-real-token'),
    APP_VERSION,
  );
  await page.route('**/v1/analyze-meal', (route) =>
    route.fulfill({
      json: {
        analysis: DEMO_MEAL,
        demo: true,
        usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
        daily: {
          analyses: 1,
          analysis_limit: 40,
          lookups: 0,
          lookup_limit: 100,
          chat: 0,
          chat_limit: 40,
          resets_at: '2026-10-26T00:00:00Z',
        },
      },
    }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await captureFood(page);
  await page.getByRole('combobox', { name: 'Приём пищи для блюда' }).selectOption('lunch');
  await page.getByRole('button', { name: 'Сохранить демозапись' }).click();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await details(page);
  await page.locator('.meal-edit').click();
  await expect(page.getByRole('dialog').getByLabel('Заметка', { exact: true })).toHaveCount(0);
  await page.getByLabel('Масса ингредиента 1', { exact: true }).fill('300');
  await expect(page.getByRole('combobox', { name: 'Приём пищи для блюда' })).toHaveValue(
    'breakfast',
  );
  await page.getByRole('button', { name: 'Сохранить демозапись' }).click();
  await expect(page.locator('.diary-note')).toHaveText('Домашний завтрак');
  await expect(page.getByRole('region', { name: 'Завтрак', exact: true })).toContainText(
    '729 ккал',
  );
  await actions(page);
  await page.getByRole('button', { name: 'Копировать на дату' }).click();
  await page.getByLabel('Дата добавления').fill('2026-11-13');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await page.getByLabel('Дата дневника').fill('2026-11-13');
  await expect(page.locator('.calorie-orbit strong')).toHaveText('729');
  await expect(page.locator('.diary-note')).toHaveText('Домашний завтрак');
});
