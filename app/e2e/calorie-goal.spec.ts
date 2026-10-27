import { openEntryEditor } from './product-helpers';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { APP_VERSION } from '@racionika/shared';
// These UI tests mock the provider, not authentication; do not spend production-style rate limits.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (version) =>
      sessionStorage.setItem(`racionika.token.${version}`, 'ui-calorie-fixture-not-a-real-token'),
    APP_VERSION,
  );
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
async function edit(page: Page) {
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить данные профиля', exact: true }).click();
}
async function saveCustom(page: Page, calories: string) {
  await edit(page);
  await page.getByLabel('Расчёт калорий', { exact: true }).selectOption('custom');
  await page.getByLabel('Моя цель, ккал в день', { exact: true }).fill(calories);
  await page.getByRole('button', { name: 'Рассчитать мой план', exact: true }).click();
  await expect(page.locator('.plan-preview > strong')).toContainText(calories);
  const confirmation = page.getByRole('checkbox', {
    name: 'Понимаю, что выбрал цель ниже расчётной.',
    exact: true,
  });
  if (await confirmation.count()) await confirmation.check();
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
}
test('своя цель сохраняется, меняет БЖУ и передаётся наставнику', async ({ page }) => {
  await page.goto('/');
  await saveCustom(page, '2000');
  await expect(page.locator('.daily-calorie-goal')).toContainText('2000');
  await expect(page.locator('.goal-macros')).toHaveText('Б 128 г · Ж 62 г · У 233 г');
  await page.reload();
  await expect(page.locator('.energy-copy')).toContainText('2000 ккал');
  await expect(page.locator('.macros')).toContainText('из 233 г');
  await page.route('**/v1/config', (route) =>
    route.fulfill({
      json: {
        mode: 'demo',
        provider: 'anymodel',
        access_code_required: false,
        min_app_version: '0.2.0',
        maintenance: false,
      },
    }),
  );
  let body: { summary: string } | undefined;
  await page.route('**/v1/coach', (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        reply: { text: 'Ответ для теста' },
        demo: true,
        usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
        daily: {
          analyses: 0,
          analysis_limit: 40,
          lookups: 0,
          lookup_limit: 40,
          chat: 1,
          chat_limit: 40,
          resets_at: '2026-10-26T00:00:00Z',
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Наставник', exact: true }).click();
  await page.getByLabel('Сообщение', { exact: true }).fill('Что съесть на ужин?');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByText('Ответ для теста', { exact: true })).toBeVisible();
  await expect.poll(() => body?.summary).toBeTruthy();
  const summary = JSON.parse(body!.summary);
  expect(summary.plan.calories).toBe(2000);
  expect(summary.plan.carbs).toBe(233);
  expect(summary.plan.source).toBe('custom');
  await edit(page);
  await page.getByLabel('Расчёт калорий', { exact: true }).selectOption('automatic');
  await page.getByRole('button', { name: 'Рассчитать мой план', exact: true }).click();
  await expect(page.locator('.plan-preview > strong')).toContainText('2136');
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('racionika.profile')!).customCalories,
    ),
  ).toBeUndefined();
});
test('кольцо 0 → 50 → 100%, превышение не ломает шкалу и удаление уменьшает её', async ({
  page,
}) => {
  await page.goto('/');
  await saveCustom(page, '2000');
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  const ring = page.getByRole('progressbar', { name: 'Калории за день' });
  await expect(ring).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('.ring-fill')).toHaveAttribute('stroke-dasharray', '0 100');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await openEntryEditor(page);
  await page.getByLabel('Название', { exact: true }).fill('Тестовая порция');
  await page.getByLabel('Масса порции, г').fill('500');
  await page.getByLabel('Калории, ккал').fill('200');
  await page.getByLabel('Белки, г').fill('10');
  await page.getByLabel('Жиры, г').fill('0');
  await page.getByLabel('Углеводы, г').fill('40');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(ring).toHaveAttribute('aria-valuenow', '50');
  await expect(page.locator('.ring-fill')).toHaveAttribute('stroke-dasharray', '50 100');
  await page.getByRole('button', { name: /^Тестовая порция/ }).click();
  await page.getByLabel('Масса порции, г').fill('1100');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(ring).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('.ring-fill')).toHaveAttribute('stroke-dasharray', '100 100');
  await expect(page.locator('.energy-copy')).toContainText('200 ккал сверх цели');
  await page.reload();
  await expect(page.getByRole('progressbar', { name: 'Калории за день' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить Тестовая порция', exact: true }).click();
  await expect(ring).toHaveAttribute('aria-valuenow', '0');
});
test('слишком низкая цель не сохраняется, предел темпа остаётся безопасным', async ({ page }) => {
  await page.goto('/');
  await edit(page);
  await page.getByLabel('Моя цель', { exact: true }).selectOption('lose');
  await page.getByLabel('Целевой вес, кг').fill('70');
  await expect(page.getByLabel('Темп, кг в неделю')).toHaveAttribute('max', '1');
  await page.getByLabel('Расчёт калорий', { exact: true }).selectOption('custom');
  await expect(page.getByLabel('Темп, кг в неделю')).toHaveCount(0);
  await page.getByLabel('Моя цель, ккал в день', { exact: true }).fill('1500');
  await page.getByRole('button', { name: 'Рассчитать мой план', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('не ниже 1602');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('racionika.profile')!).customCalories,
    ),
  ).toBeUndefined();
});

test('подтверждение цели ниже расчётной обязательно и сбрасывается после нового расчёта', async ({
  page,
}) => {
  await page.goto('/');
  await edit(page);
  await page.getByLabel('Расчёт калорий', { exact: true }).selectOption('custom');
  await page.getByLabel('Моя цель, ккал в день', { exact: true }).fill('2000');
  await page.getByRole('button', { name: 'Рассчитать мой план', exact: true }).click();
  const save = page.getByRole('button', { name: 'Сохранить профиль', exact: true });
  const confirm = page.getByRole('checkbox', {
    name: 'Понимаю, что выбрал цель ниже расчётной.',
    exact: true,
  });
  await expect(confirm).not.toBeChecked();
  await expect(save).toBeDisabled();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('racionika.profile')!).customCalories,
    ),
  ).toBeUndefined();
  await confirm.check();
  await expect(save).toBeEnabled();
  await confirm.uncheck();
  await expect(save).toBeDisabled();
  await confirm.check();
  await page.getByRole('button', { name: 'Изменить параметры', exact: true }).click();
  await page.getByLabel('Моя цель, ккал в день', { exact: true }).fill('1900');
  await page.getByRole('button', { name: 'Рассчитать мой план', exact: true }).click();
  await expect(confirm).not.toBeChecked();
  await expect(save).toBeDisabled();
  await confirm.check();
  await save.click();
  await page.reload();
  await expect(page.locator('.energy-copy')).toContainText('1900 ккал');
});

test('автоматическая и более высокая ручная цель не требуют лишней галочки', async ({ page }) => {
  await page.goto('/');
  await edit(page);
  await page.getByRole('button', { name: 'Рассчитать мой план', exact: true }).click();
  const confirm = page.getByRole('checkbox', {
    name: 'Понимаю, что выбрал цель ниже расчётной.',
    exact: true,
  });
  const save = page.getByRole('button', { name: 'Сохранить профиль', exact: true });
  await expect(confirm).toHaveCount(0);
  await expect(save).toBeEnabled();
  await page.getByRole('button', { name: 'Изменить параметры', exact: true }).click();
  await page.getByLabel('Расчёт калорий', { exact: true }).selectOption('custom');
  await page.getByLabel('Моя цель, ккал в день', { exact: true }).fill('2300');
  await page.getByRole('button', { name: 'Рассчитать мой план', exact: true }).click();
  await expect(page.locator('.plan-preview > strong')).toContainText('2300');
  await expect(confirm).toHaveCount(0);
  await expect(save).toBeEnabled();
});

test('женский профиль может сохранить 1300 только при допустимом персональном расчёте', async ({
  page,
}) => {
  await page.goto('/');
  await edit(page);
  await page.getByLabel('Пол для расчёта').selectOption('female');
  await page.getByLabel('Возраст, лет').fill('55');
  await page.getByLabel('Рост, см').fill('150');
  await page.getByLabel('Вес, кг', { exact: true }).fill('65');
  await page.getByLabel('Расчёт калорий', { exact: true }).selectOption('custom');
  const value = page.getByLabel('Моя цель, ккал в день', { exact: true });
  await expect(value).toHaveAttribute('min', '1300');
  await value.fill('1300');
  await page.getByRole('button', { name: 'Рассчитать мой план', exact: true }).click();
  await expect(page.locator('.plan-preview > strong')).toContainText('1300');
  await page
    .getByRole('checkbox', { name: 'Понимаю, что выбрал цель ниже расчётной.', exact: true })
    .check();
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await page.reload();
  await expect(page.locator('.energy-copy')).toContainText('1300 ккал');
});
