import { expect, test } from '@playwright/test';

const ADMIN = 'http://localhost:5174';

// Both tests build an in-browser demo database; running them one at a time keeps them fast and stable.
test.describe.configure({ mode: 'serial' });

test('platform operator manages tenants without seeing resident data', async ({ page }) => {
  await page.goto(ADMIN);
  await page.getByRole('button', { name: 'Use the demo operator account' }).click({ timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Businesses', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/30-admin-overview.png', fullPage: true });

  await page.getByRole('navigation').getByRole('link', { name: 'Tenants' }).click();
  await page.getByRole('link', { name: 'Lakeview Hostel (demo)' }).click();
  await expect(page.getByText('Resident details, bills and payments of this business are not accessible')).toBeVisible();

  await page.getByRole('button', { name: 'Suspend' }).click();
  await page.getByLabel(/Reason/).fill('Testing suspension flow');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Status updated')).toBeVisible();
  await expect(page.getByText('Suspended', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Reactivate' }).click();
  await page.getByLabel(/Reason/).fill('Issue resolved');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/31-admin-tenant.png', fullPage: true });

  await page.getByRole('navigation').getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByText('admin.tenant_status_changed').first()).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Plans' }).click();
  await expect(page.getByText('Default for sign-ups')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/32-admin-plans.png', fullPage: true });
});

test('a regular owner account is refused by the admin app', async ({ page }) => {
  await page.goto(ADMIN);
  await expect(page.getByRole('heading', { name: 'Platform operator sign-in' })).toBeVisible({ timeout: 90_000 });
  await page.getByLabel('Email').fill('owner@demo.pgsaas.local');
  await page.getByLabel('Password').fill('demo-owner-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('No platform access')).toBeVisible({ timeout: 60_000 });
});
