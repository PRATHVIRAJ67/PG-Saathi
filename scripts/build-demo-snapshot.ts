/**
 * Records the read-only demo snapshot used by the mobile app when Supabase is
 * not configured. It boots the real migrations in PGlite, runs the same demo
 * seed as the web apps, and records the responses of read functions.
 *
 *   npm run demo:snapshot
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPgliteTransport, createDemoAuth, openDatabase, seedDemoWorkspace, DEMO_ACCOUNT } from '@pg/demo-db';
import type { DemoSnapshot } from '@pg/api-client';
import { todayISO } from '@pg/shared';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

async function main() {
  const db = await openDatabase({
    migrations: readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') })),
    seeds: [{ name: 'seed.sql', sql: readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8') }],
  });
  const auth = createDemoAuth(db);
  const seeded = await seedDemoWorkspace(db, auth);
  if (!seeded) throw new Error('Seed did not run');
  const transport = createPgliteTransport(db, () => seeded.userId);
  const calls: DemoSnapshot['calls'] = [];
  const record = async <T>(fn: string, args: Record<string, unknown> = {}) => {
    const result = await transport.call<T>(fn, args);
    calls.push({ fn, args, result });
    return result;
  };
  const t = seeded.tenantId;

  await record('my_context');
  await record('get_workspace', { p_tenant_id: t });
  await record('list_plans');
  await record('am_i_platform_admin');
  const properties = await record<{ id: string }[]>('list_properties', { p_tenant_id: t, p_include_archived: false });
  await record('list_rooms', { p_tenant_id: t, p_property_id: null });
  await record('dashboard_summary', { p_tenant_id: t, p_property_id: null, p_month: null });
  for (const p of properties) {
    await record('get_property', { p_property_id: p.id });
    await record('dashboard_summary', { p_tenant_id: t, p_property_id: p.id, p_month: null });
  }
  for (const status of ['current', 'active', 'unassigned', 'moved_out', 'archived', 'all']) {
    await record('list_residents', { p_tenant_id: t, p_params: { status, limit: 500 } });
  }
  const residents = await transport.call<{ rows: { id: string }[] }>('list_residents', { p_tenant_id: t, p_params: { status: 'all', limit: 500 } });
  for (const r of residents.rows) await record('get_resident', { p_resident_id: r.id });

  const invoices = await record<{ rows: { id: string }[] }>('list_invoices', { p_tenant_id: t, p_params: { status: 'all', limit: 500 } });
  for (const i of invoices.rows) await record('get_invoice', { p_invoice_id: i.id });
  for (const status of ['live', 'voided', 'all']) {
    await record('list_payments', { p_tenant_id: t, p_params: { status, limit: 500 } });
  }
  const payments = await transport.call<{ rows: { id: string }[] }>('list_payments', { p_tenant_id: t, p_params: { status: 'all', limit: 500 } });
  for (const p of payments.rows) await record('get_payment', { p_payment_id: p.id });
  await record('list_expenses', { p_tenant_id: t, p_params: { limit: 500 } });
  await record('list_deposits', { p_tenant_id: t, p_params: {} });
  await record('list_charge_templates', { p_tenant_id: t });
  await record('list_members', { p_tenant_id: t });

  const snapshot: DemoSnapshot = { generated_at: new Date().toISOString(), today: todayISO(), user_id: seeded.userId, email: DEMO_ACCOUNT.email, calls };
  const out = join(root, 'apps', 'mobile', 'src', 'demo', 'snapshot.json');
  writeFileSync(out, JSON.stringify(snapshot));
  console.log(`Wrote ${calls.length} recorded calls to ${out}`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
