import { expect, test } from '@playwright/test';

/**
 * Owner gives a resident an app login from the dashboard, then that resident
 * signs in and sees only their own records (demo mode: real migrations in
 * PGlite in the browser).
 */
test('owner creates a resident app login; the resident signs in to their own portal', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Open the sample workspace' }).click({ timeout: 90_000 });
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Demo/ })).toBeVisible({ timeout: 60_000 });

  await page.goto('/app/residents');
  await page.getByRole('link', { name: /Karthik Rao/ }).click();
  await expect(page.getByRole('heading', { name: /Karthik Rao/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Give app login' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Resident’s email/).fill('karthik@example.com');
  const password = await dialog.locator('#al-pass').inputValue();
  expect(password).toMatch(/^Ps-.{4}-.{4}-.{4}$/);
  await dialog.getByRole('button', { name: 'Create login' }).click();
  await expect(dialog.getByText('Login created')).toBeVisible();
  await expect(dialog.getByText('karthik@example.com')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/50-owner-app-login.png' });
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/Has app login/)).toBeVisible();

  // Sign out, then sign in as the resident.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Email').fill('karthik@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: /Hi Karthik/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Bills')).toBeVisible();
  // A resident cannot open the owner dashboard.
  await page.goto('/app/residents');
  await expect(page).toHaveURL(/\/portal/);
});
