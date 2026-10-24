import { test as base, expect } from '@playwright/test';
export const test = base.extend<{ seedProfile: void }>({
  seedProfile: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        if (!localStorage.getItem('racionika.profile')) {
          localStorage.setItem(
            'racionika.profile',
            JSON.stringify({
              version: 1,
              name: 'Тест',
              sex: 'male',
              age: 30,
              height: 180,
              weight: 80,
              activity: '1.2',
              goal: 'maintain',
              targetWeight: 80,
              pace: 0.5,
              individualCare: false,
              updatedAt: '2026-10-24T12:00:00Z',
            }),
          );
          localStorage.setItem('racionika.aiConsent', 'v2');
        }
      });
      await use();
    },
    { auto: true },
  ],
});
export { expect };
