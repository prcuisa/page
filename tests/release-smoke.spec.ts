import { test, expect } from '@playwright/test';
for (const width of [360, 768, 1440]) {
  test(`guest dashboard and centered authentication at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Masuk / Daftar', exact: true }).click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    const box = await modal.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(2);
    expect(Math.abs(box!.y + box!.height / 2 - 450)).toBeLessThan(2);
    expect(box!.height).toBeLessThanOrEqual(876);
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('/tools/invoice-quotation');
    await expect(page).toHaveURL(/\/login/);
  });
}

for (const width of [390, 820, 1180, 1440]) {
  test(`Connect checkbox and schedule geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/preview/connect');
    const checks = page.locator('.connect-check input[type=checkbox]');
    expect(await checks.count()).toBeGreaterThanOrEqual(6);
    for (const check of await checks.all()) {
      const box = await check.boundingBox();
      expect(box!.width).toBe(20);
      expect(box!.height).toBe(20);
    }
    const fields = page.locator('.connect-fields');
    const parent = await fields.boundingBox();
    const time = await fields.locator('input').boundingBox();
    const zone = await fields.locator('select').boundingBox();
    expect(time!.x + time!.width).toBeLessThanOrEqual(parent!.x + parent!.width + 1);
    expect(zone!.x + zone!.width).toBeLessThanOrEqual(parent!.x + parent!.width + 1);
    if (width > 760) expect(zone!.x - time!.x - time!.width).toBeGreaterThanOrEqual(19);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
