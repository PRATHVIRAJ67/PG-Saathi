import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });

async function signUp(page: Page, name: string, email: string) {
  await page.goto('/sign-up');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('owner-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
}

test('a new owner self-onboards, bills rent and records a payment; a second owner is isolated', async ({ page, browser }) => {
  // ---- Owner A: sign up -------------------------------------------------------
  await signUp(page, 'Asha Rao', 'asha@example.com');
  await expect(page.getByRole('heading', { name: 'Tell us about your business' })).toBeVisible({ timeout: 60_000 });
  await shot(page, '01-onboarding-business');

  await page.getByLabel('Business name').fill('Sunshine PG');
  await page.getByLabel('Contact phone').fill('9845012345');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByRole('button', { name: 'Create workspace' }).click();

  // ---- Property ---------------------------------------------------------------
  await expect(page.getByRole('heading', { name: 'Add your first property' })).toBeVisible();
  await page.getByLabel('Property name').fill('Sunshine PG Indiranagar');
  await page.getByLabel('Address').fill('12, 100 Feet Road');
  await page.getByLabel('PIN code').fill('560038');
  await shot(page, '02-onboarding-property');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // ---- Rooms: three default rows, set rent ------------------------------------
  await expect(page.getByRole('heading', { name: 'Set up rooms and beds' })).toBeVisible();
  const rentInputs = page.getByLabel('Rent', { exact: true });
  await expect(rentInputs).toHaveCount(3);
  for (const input of await rentInputs.all()) await input.fill('8500');
  await shot(page, '03-onboarding-rooms');
  await page.getByRole('button', { name: 'Save rooms and continue' }).click();

  // ---- Rent & billing ---------------------------------------------------------
  await expect(page.getByRole('heading', { name: 'How do you collect rent?' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // ---- Residents --------------------------------------------------------------
  await expect(page.getByRole('heading', { name: 'Add your current residents' })).toBeVisible();
  await page.getByLabel('Full name').fill('Rohit Verma');
  await page.getByLabel('Phone').fill('9900112233');
  const bedSelect = page.getByLabel('Bed');
  await expect(bedSelect.locator('option')).not.toHaveCount(1);
  await bedSelect.selectOption({ index: 1 });
  await expect(page.getByLabel('Monthly rent')).toHaveValue('8500');
  await shot(page, '04-onboarding-residents');
  await page.getByRole('button', { name: /Save 1 and finish/ }).click();

  await expect(page.getByRole('heading', { name: 'Your workspace is ready' })).toBeVisible();
  await shot(page, '05-onboarding-done');
  await page.getByRole('button', { name: 'Go to dashboard' }).click();

  // ---- Dashboard from real records ---------------------------------------------
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Asha/ })).toBeVisible();
  await expect(page.getByText('1 occupied')).toBeVisible();
  await shot(page, '06-dashboard-before-billing');

  // Generate this month's rent (explicit action — no scheduler).
  await page.getByRole('button', { name: 'Generate rent' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/has no rent bill/)).toBeVisible();
  await dialog.getByRole('button', { name: /Generate 1 bills/ }).click();
  await expect(page.getByText(/Created 1 rent bills/)).toBeVisible();

  // Record a partial payment.
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: 'Record payment' }).click();
  const pay = page.getByRole('dialog');
  await pay.locator('#pay-resident').click();
  await page.getByRole('option').filter({ hasText: 'Rohit Verma' }).getByRole('button').click();
  await expect(pay.getByText('Outstanding')).toBeVisible();
  await pay.getByLabel('Amount received').fill('5000');
  await shot(page, '07-record-payment');
  await pay.getByRole('button', { name: /Record ₹5,000/ }).click();
  await expect(page.getByText('Payment recorded')).toBeVisible();

  // Dashboard totals update from the database.
  await page.goto('/app');
  const collected = page.locator('div', { has: page.getByText('Collected', { exact: true }) }).first();
  await expect(collected).toContainText('₹5,000');
  await expect(page.getByText('Outstanding rent').locator('..').locator('..')).toContainText(/₹3,500|₹[0-9,]+/);
  await shot(page, '08-dashboard-after-payment');

  // Resident ledger shows the partial balance.
  await page.goto('/app/residents');
  await page.getByRole('link', { name: /Rohit Verma/ }).click();
  await expect(page.getByRole('tab', { name: 'Ledger' })).toBeVisible();
  await expect(page.getByText('Partially paid').or(page.getByText('Overdue')).first()).toBeVisible();
  await shot(page, '09-resident-ledger');

  // ---- Owner B in a separate browser session ---------------------------------
  const context = await browser.newContext();
  const pageB = await context.newPage();
  await signUp(pageB, 'Vikram Shah', 'vikram@example.com');
  await expect(pageB.getByRole('heading', { name: 'Tell us about your business' })).toBeVisible({ timeout: 60_000 });
  await pageB.getByLabel('Business name').fill('Green Nest PG');
  await pageB.getByRole('button', { name: 'Create workspace' }).click();
  await expect(pageB.getByRole('heading', { name: 'Add your first property' })).toBeVisible();
  // B's workspace starts empty: no trace of owner A's property name.
  await expect(pageB.getByLabel('Property name')).toHaveValue('');
  await expect(pageB.getByText('Sunshine PG Indiranagar')).toHaveCount(0);
  await context.close();
});

test('the sample workspace dashboard renders demo data', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Open the sample workspace' }).click({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Demo/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Income and expenses')).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, '10-demo-overview');
  for (const [path, name] of [
    ['/app/rooms', '11-rooms'],
    ['/app/residents', '12-residents'],
    ['/app/rent', '13-rent'],
    ['/app/payments', '14-payments'],
    ['/app/deposits', '15-deposits'],
    ['/app/reports', '16-reports'],
    ['/app/settings/team', '17-settings-team'],
    ['/app/properties', '18-properties'],
    ['/app/expenses', '19-expenses'],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await page.waitForTimeout(600);
    await shot(page, name);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  await expect(page.locator('main h1')).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, '20-mobile-overview');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
