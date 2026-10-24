import { test, expect } from '@playwright/test';

test('PWA install: manifest + tombol install', async ({ page }) => {
  await page.goto('/');
  const m = await page.evaluate(async () => {
    const r = await fetch('./manifest.json').then(r => r.json());
    return { id: r.id, maskable: r.icons.filter((i: any) => i.purpose === 'maskable').length };
  });
  expect(m.id).toBe('./');
  expect(m.maskable).toBe(1);
  await expect(page.locator('#nav-install')).toBeVisible();
  await page.locator('#nav-install').click();
  await expect(page.locator('#toast')).toContainText(/CHROME|LAYAR|TERINSTALL/i);
});
