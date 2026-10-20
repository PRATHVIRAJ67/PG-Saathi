import { expect, test } from '@playwright/test';

// The resident app rendered through react-native-web at phone size. Native
// behaviour still needs a device/emulator check; this verifies layout & flows.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const MOBILE = 'http://localhost:5175';

test('resident app: home, bills, bill detail with UPI pay, payments, profile', async ({ page }) => {
  await page.goto(MOBILE);
  await expect(page.getByText('Welcome to PG Sathi')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Open sample resident' }).click();

  await expect(page.getByText(/Good (morning|afternoon|evening), Arjun/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Room 101 · Bed A/)).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/screenshots/40-resident-home.png' });

  await page.getByRole('tab', { name: 'Bills' }).click();
  await page.getByText('All bills').click();
  const bill = page.getByText(/^Rent · /).first();
  await expect(bill).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/41-resident-bills.png' });
  await bill.click();
  await expect(page.getByText('Balance')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screenshots/42-resident-bill.png' });
  await page.goBack();

  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByText('Total paid')).toBeVisible();
  await expect(page.getByText(/RCT-/).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/43-resident-payments.png' });

  await page.getByRole('tab', { name: 'Profile' }).click();
  await expect(page.getByText('Stay history')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/44-resident-profile.png' });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('resident app: there is no sign-up and no owner screens', async ({ page }) => {
  await page.goto(MOBILE);
  await expect(page.getByText('Welcome to PG Sathi')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Create your account/)).toHaveCount(0);
  await expect(page.getByText(/Ask your PG owner/)).toBeVisible();
});
