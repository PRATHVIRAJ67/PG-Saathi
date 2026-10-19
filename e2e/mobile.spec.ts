import { expect, test } from '@playwright/test';

// The Expo app rendered through react-native-web at phone size. Native
// behaviour still needs a device/emulator check; this verifies layout & flows.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const MOBILE = 'http://localhost:5175';

test('mobile demo: home, residents, resident detail, read-only writes', async ({ page }) => {
  await page.goto(MOBILE);
  await page.getByRole('button', { name: 'Open sample workspace' }).click({ timeout: 60_000 });
  await expect(page.getByText(/Good (morning|afternoon|evening), Demo/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/screenshots/40-mobile-home.png', fullPage: false });

  await page.getByRole('tab', { name: 'Residents' }).click();
  await expect(page.getByText('Arjun Mehta')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/41-mobile-residents.png' });
  await page.getByText('Arjun Mehta').click();
  await expect(page.getByText('Current stay')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screenshots/42-mobile-resident.png' });

  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.getByText('Amount received').waitFor();
  await page.getByLabel('Amount received').fill('500');
  await page.getByRole('button', { name: 'Record payment' }).last().click();
  await expect(page.getByText(/read-only/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/43-mobile-payment-readonly.png' });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('mobile demo: properties and payments tabs render', async ({ page }) => {
  await page.goto(MOBILE);
  await page.getByRole('button', { name: 'Open sample workspace' }).click({ timeout: 60_000 });
  await page.getByRole('tab', { name: 'Properties' }).click();
  const card = page.getByRole('button', { name: 'Sunrise Residency (demo)', exact: true });
  await expect(card).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/44-mobile-properties.png' });
  await card.click();
  await expect(page.getByText('Rooms & beds', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/45-mobile-property.png' });
  await page.goBack();
  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByText(/RCT-/).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/46-mobile-payments.png' });
});
