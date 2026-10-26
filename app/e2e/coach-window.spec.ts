import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const id = '12345678-1234-4234-8234-123456789abc';
const longReply = 'Пример ответа наставника. Порции и меню ориентировочные.\n\n'.repeat(55);
async function setup(page: Page, width = 390, font = 100) {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => {
    sessionStorage.setItem('racionika.token.0.3.0', 'chat-window-test');
    localStorage.setItem('racionika.coachContextConsent', 'v1');
  });
  await page.route('**/v1/config', (route) =>
    route.fulfill({
      json: {
        mode: 'real',
        provider: 'anymodel',
        maintenance: false,
        access_code_required: false,
        min_app_version: '0.2.0',
      },
    }),
  );
  await page.goto('/');
  await page.evaluate((font) => {
    document.documentElement.style.fontSize = `${font}%`;
    document.documentElement.dataset.native = 'true';
  }, font);
  await page.getByRole('button', { name: 'Наставник', exact: true }).click();
  await expect(page.locator('.coach-card')).toContainText('Опирается на дневник');
}
async function dimensions(page: Page) {
  return page.evaluate(() => ({
    card: document.querySelector('.coach-card')!.getBoundingClientRect().height,
    history: document.querySelector('.chat-history')!.getBoundingClientRect().height,
    page: document.documentElement.scrollHeight,
  }));
}
async function atEnd(page: Page) {
  return page
    .locator('.chat-history')
    .evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop < 5);
}
for (const size of [
  { width: 390, font: 100 },
  { width: 320, font: 200 },
]) {
  test(`чат не растягивает карточку и страницу: ${size.width}px, текст ${size.font}%`, async ({
    page,
  }) => {
    await setup(page, size.width, size.font);
    let done = false;
    await page.route('**/v1/coach/jobs', (r) => r.fulfill({ json: { id } }));
    await page.route(`**/v1/coach/jobs/${id}`, (r) =>
      r.fulfill({
        json: {
          id,
          status: done ? 'done' : 'running',
          text: longReply,
          streamed: true,
          demo: false,
        },
      }),
    );
    await page.getByLabel('Сообщение', { exact: true }).fill('Помоги с меню');
    const before = await dimensions(page);
    await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect(page.locator('.coach-live')).toContainText('Пример ответа');
    expect(await dimensions(page)).toEqual(before);
    await expect.poll(() => atEnd(page)).toBe(true);
    const history = page.getByRole('region', { name: 'Переписка с наставником' });
    expect(await history.evaluate((el) => el.scrollHeight > el.clientHeight * 3)).toBe(true);
    done = true;
    await expect(page.getByRole('button', { name: 'Очистить историю' })).toBeEnabled();
    expect(await dimensions(page)).toEqual(before);
    await expect(page.getByLabel('Сообщение', { exact: true })).toBeEmpty();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await history.evaluate((el) => el.scrollTo(0, 0));
    await expect.poll(() => atEnd(page)).toBe(false);
    await page.getByRole('button', { name: 'Очистить историю' }).click();
    await expect(page.locator('.chat-message')).toHaveCount(0);
    expect(await dimensions(page)).toEqual(before);
  });
}
test('поток не сбрасывает прокрутку при чтении старых сообщений', async ({ page }) => {
  await setup(page);
  let chunk = longReply,
    polls = 0;
  await page.route('**/v1/coach/jobs', (r) => r.fulfill({ json: { id } }));
  await page.route(`**/v1/coach/jobs/${id}`, (r) => {
    polls++;
    return r.fulfill({ json: { id, status: 'running', text: chunk, streamed: true, demo: false } });
  });
  await page.route(`**/v1/coach/jobs/${id}/cancel`, (r) => r.fulfill({ json: {} }));
  await page.getByLabel('Сообщение', { exact: true }).fill('Помоги');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.coach-live')).toContainText('Пример ответа');
  await expect.poll(() => atEnd(page)).toBe(true);
  const history = page.getByRole('region', { name: 'Переписка с наставником' });
  await history.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event('scroll'));
  });
  const pageTop = await page.evaluate(() => window.scrollY);
  const count = polls;
  chunk += '\nНовая часть ответа.';
  await expect.poll(() => polls).toBeGreaterThan(count);
  await expect(page.locator('.coach-live')).toContainText('Новая часть ответа.');
  expect(await history.evaluate((el) => el.scrollTop)).toBeLessThan(5);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageTop);
  await page.getByRole('button', { name: 'Остановить ответ' }).click();
  await expect(page.locator('.coach-stop-note')).toHaveCount(1);
});
test('сохранённая история прокручивается клавиатурой и остаётся в окне после перезапуска', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('racionika');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chatMessages', 'readwrite');
      for (let i = 0; i < 80; i++)
        tx.objectStore('chatMessages').add({
          id: crypto.randomUUID(),
          createdAt: new Date(Date.UTC(2026, 9, 25, 0, i)).toISOString(),
          role: i % 2 ? 'assistant' : 'user',
          text: `Сообщение ${i}. ` + 'Сохранённая переписка. '.repeat(20),
        });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Наставник', exact: true }).click();
  await expect(page.locator('.chat-message')).toHaveCount(50);
  await expect.poll(() => atEnd(page)).toBe(true);
  const history = page.getByRole('region', { name: 'Переписка с наставником' });
  await history.focus();
  await page.keyboard.press('Control+Home');
  await expect.poll(() => history.evaluate((el) => el.scrollTop)).toBe(0);
  await page.keyboard.press('PageDown');
  await expect.poll(() => history.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});
