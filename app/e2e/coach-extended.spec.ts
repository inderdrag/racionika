import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
const id = '12345678-1234-4234-8234-123456789abc';
const full = 'Завтрак: овсянка и йогурт. Обед: рис и курица. Порции ориентировочные.';
type RequestBody = { mode: string; summary: string; history: unknown[] };
async function setup(page: Page, grant = true) {
  await page.clock.setFixedTime(new Date('2026-10-25T12:00:00Z'));
  await page.addInitScript((grant) => {
    sessionStorage.setItem('racionika.token.0.3.0', 'coach-ui-token');
    if (grant) localStorage.setItem('racionika.coachContextConsent', 'v1');
  }, grant);
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
  await page.goto('/');
  await expect(page.locator('.energy-copy')).toBeVisible();
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Наставник', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Спросить наставника' })).toBeVisible();
}
async function countMessages(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('racionika');
      req.onsuccess = () => resolve(req.result);
    });
    const count = await new Promise<number>((resolve) => {
      const req = db.transaction('chatMessages').objectStore('chatMessages').count();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return count;
  });
}
test('настоящий частичный ответ появляется до конца и полный сохраняется после перезапуска', async ({
  page,
}) => {
  await setup(page);
  let polls = 0,
    body: RequestBody | undefined;
  await page.route('**/v1/coach/jobs', (r) => {
    body = r.request().postDataJSON();
    return r.fulfill({ json: { id } });
  });
  await page.route(`**/v1/coach/jobs/${id}`, (r) =>
    r.fulfill({
      json: {
        id,
        status: ++polls === 1 ? 'running' : 'done',
        text: polls === 1 ? 'Завтрак: овсянка' : full,
        streamed: true,
        demo: false,
      },
    }),
  );
  await open(page);
  await page.getByRole('button', { name: 'Меню на завтра', exact: true }).click();
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.coach-live')).toContainText('Завтрак: овсянка');
  await expect(page.getByRole('button', { name: 'Остановить ответ' })).toBeVisible();
  expect(await countMessages(page)).toBe(0);
  await expect(page.locator('.chat-message.assistant').filter({ hasText: full })).toBeVisible();
  await expect.poll(() => countMessages(page)).toBe(2);
  expect(body?.mode).toBe('tomorrow_menu');
  const summary = JSON.parse(body!.summary);
  expect(summary.menuDay).toBe('2026-10-26');
  expect(summary.days).toHaveLength(7);
  await page.reload();
  await open(page);
  await expect(page.locator('.chat-history')).toContainText(full);
});
test('остановка отменяет серверный запрос и не сохраняет неполный ответ', async ({ page }) => {
  await setup(page);
  let cancelled = false;
  await page.route('**/v1/coach/jobs', (r) => r.fulfill({ json: { id } }));
  await page.route(`**/v1/coach/jobs/${id}`, (r) =>
    r.fulfill({
      json: {
        id,
        status: 'running',
        text: 'Неполный разбор',
        streamed: true,
        demo: false,
      },
    }),
  );
  await page.route(`**/v1/coach/jobs/${id}/cancel`, (r) => {
    cancelled = true;
    return r.fulfill({ json: { id, status: 'cancelled', text: '', streamed: true, demo: false } });
  });
  await open(page);
  await page.getByRole('button', { name: 'Разбор недели', exact: true }).click();
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.coach-live')).toContainText('Неполный разбор');
  await page.getByRole('button', { name: 'Остановить ответ' }).click();
  await expect(page.locator('.coach-stop-note')).toBeVisible();
  expect(cancelled).toBe(true);
  expect(await countMessages(page)).toBe(0);
  await page.reload();
  await open(page);
  await expect(page.locator('.chat-history')).not.toContainText('Неполный разбор');
});
test('старое согласие не расширяется молча; отдельное разрешение сохраняется и отзывается', async ({
  page,
}) => {
  await setup(page, false);
  let body: RequestBody | undefined;
  await page.route('**/v1/coach/jobs', (r) => {
    body = r.request().postDataJSON();
    return r.fulfill({ json: { id } });
  });
  await page.route(`**/v1/coach/jobs/${id}`, (r) =>
    r.fulfill({ json: { id, status: 'done', text: full, streamed: false, demo: false } }),
  );
  await open(page);
  await expect(page.locator('.coach-context-caption')).toHaveText('Контекст: выбранный день');
  await page.getByLabel('Сообщение', { exact: true }).fill('Как проходит день?');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => countMessages(page)).toBe(2);
  expect(JSON.parse(body!.summary).scope).toBe('selected_day');
  expect(JSON.parse(body!.summary).weight.measurements).toEqual([]);
  await page.getByText('Добавить контекст нескольких дней', { exact: true }).click();
  await page.getByRole('button', { name: 'Разрешить контекст 7 дней' }).click();
  await expect(page.locator('.coach-context-caption')).toContainText('вес за 30 дней');
  await page.reload();
  await open(page);
  await expect(page.locator('.coach-context-caption')).toContainText('вес за 30 дней');
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByText('Разрешения приложения', { exact: true }).click();
  await page.getByRole('checkbox', { name: /Контекст наставника/ }).uncheck();
  await open(page);
  await expect(page.locator('.coach-context-caption')).toHaveText('Контекст: выбранный день');
});
test('ошибка после частичного ответа не попадает в историю', async ({ page }) => {
  await setup(page);
  let polls = 0;
  await page.route('**/v1/coach/jobs', (r) => r.fulfill({ json: { id } }));
  await page.route(`**/v1/coach/jobs/${id}`, (r) =>
    r.fulfill({
      json: {
        id,
        status: ++polls === 1 ? 'running' : 'error',
        text: 'Начало ответа',
        streamed: true,
        demo: false,
        ...(polls > 1
          ? { error: { code: 'provider_error', message_ru: 'Временная ошибка ИИ.' } }
          : {}),
      },
    }),
  );
  await page.route(`**/v1/coach/jobs/${id}/cancel`, (r) => r.fulfill({ json: {} }));
  await open(page);
  await page.getByRole('button', { name: 'Вечерний разбор', exact: true }).click();
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Временная ошибка ИИ.');
  await expect(page.locator('.coach-live')).toContainText('неполный ответ');
  expect(await countMessages(page)).toBe(0);
});
test('смена вкладки отменяет текущий ответ', async ({ page }) => {
  await setup(page);
  let cancelled = false;
  await page.route('**/v1/coach/jobs', (r) => r.fulfill({ json: { id } }));
  await page.route(`**/v1/coach/jobs/${id}`, (r) =>
    r.fulfill({ json: { id, status: 'running', text: 'Начало', streamed: true, demo: false } }),
  );
  await page.route(`**/v1/coach/jobs/${id}/cancel`, (r) => {
    cancelled = true;
    return r.fulfill({ json: {} });
  });
  await open(page);
  await page.getByLabel('Сообщение', { exact: true }).fill('Помоги');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.coach-live')).toContainText('Начало');
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await expect.poll(() => cancelled).toBe(true);
  expect(await countMessages(page)).toBe(0);
});
