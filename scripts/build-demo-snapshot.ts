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
import { createPgliteTransport, createDemoAuth, openDatabase, seedDemoWorkspace } from '@pg/demo-db';

import type { DemoSnapshot } from '@pg/api-client';
import { todayISO } from '@pg/shared';

/** Demo-only resident login recorded into the mobile snapshot. */
const DEMO_RESIDENT = { email: 'resident@demo.pgsaas.local', password: 'demo-resident-2026' };

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
  // The mobile app is for residents: record what a resident sees.
  const residentRow = await db.query<{ id: string; tenant_id: string }>(
    "select id, tenant_id from public.residents where full_name = 'Arjun Mehta'",
  );
  const resident = residentRow.rows[0];
  if (!resident) throw new Error('Demo resident not found');
  const residentUserId = await auth.createUser({ email: DEMO_RESIDENT.email, password: DEMO_RESIDENT.password, fullName: 'Arjun Mehta', confirmed: true });
  await db.query('insert into public.resident_user_links (tenant_id, resident_id, user_id) values ($1, $2, $3)', [resident.tenant_id, resident.id, residentUserId]);

  const transport = createPgliteTransport(db, () => residentUserId);
  const calls: DemoSnapshot['calls'] = [];
  const record = async <T>(fn: string, args: Record<string, unknown> = {}) => {
    const result = await transport.call<T>(fn, args);
    calls.push({ fn, args, result });
    return result;
  };

  await record('my_context');
  const detail = await record<{ invoices: { id: string }[]; payments: { id: string }[] }>('get_resident', { p_resident_id: resident.id });
  for (const i of detail.invoices) await record('get_invoice', { p_invoice_id: i.id });
  for (const p of detail.payments) await record('get_payment', { p_payment_id: p.id });

  const snapshot: DemoSnapshot = { generated_at: new Date().toISOString(), today: todayISO(), user_id: residentUserId, email: DEMO_RESIDENT.email, calls };
  const out = join(root, 'apps', 'mobile', 'src', 'demo', 'snapshot.json');
  writeFileSync(out, JSON.stringify(snapshot));
  console.log(`Wrote ${calls.length} recorded calls to ${out}`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
