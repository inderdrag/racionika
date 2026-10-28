import { expect, type Page } from '@playwright/test';

export async function mockCamera(page: Page, denied = false) {
  await page.evaluate((deny) => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        if (deny) throw new DOMException('Нет доступа к камере.', 'NotAllowedError');
        const canvas = document.createElement('canvas');
        canvas.width = 2000;
        canvas.height = 1500;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ddd';
        ctx.fillRect(0, 0, 2000, 1500);
        ctx.fillStyle = '#333';
        ctx.fillRect(400, 300, 1000, 700);
        const stream = canvas.captureStream(5);
        (window as unknown as { cameraTracks: MediaStreamTrack[] }).cameraTracks =
          stream.getTracks();
        return stream;
      },
    });
  }, denied);
}
export async function captureFood(page: Page) {
  await mockCamera(page);
  await page.getByRole('button', { name: 'Сфотографировать продукт', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Камера', exact: true })
    .getByRole('button', { name: 'Сфотографировать', exact: true })
    .click();
}
// Create a local catalog entry through the public UI, then exercise its existing editor.
export async function openEntryEditor(page: Page) {
  await page
    .getByRole('searchbox', { name: 'Поиск продуктов', exact: true })
    .fill('Рис белый длиннозёрный приготовленный');
  await page.locator('[data-product-id="usda-168878"]').click();
  await page.getByLabel('Куда добавить', { exact: true }).selectOption('lunch');
  await page.getByRole('button', { name: 'Добавить в дневник', exact: true }).click();
  await page.locator('.meal-edit').filter({ hasText: 'Рис белый длиннозёрный' }).click();
  await expect(page.getByLabel('Название', { exact: true })).toBeVisible();
}
