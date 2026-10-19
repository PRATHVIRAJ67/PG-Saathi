import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { createAdminService, createDataService, newIdempotencyKey, AppError } from '@pg/api-client';
import { createDemoAuth, createPgliteTransport, openDatabase, type SqlFile } from '@pg/demo-db';
import { expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..');

export function loadMigrations(): SqlFile[] {
  const dir = join(supabaseDir, 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
}

export function loadSeed(): SqlFile {
  return { name: 'seed.sql', sql: readFileSync(join(supabaseDir, 'seed.sql'), 'utf8') };
}

export type Api = ReturnType<typeof createDataService>;

/**
 * Fresh database with the real migrations and production seed (plans only).
 * Each identity gets its own API client whose calls run as that user under
 * RLS, exactly as through PostgREST.
 */
export async function createTestBackend() {
  const db = await openDatabase({ migrations: loadMigrations(), seeds: [loadSeed()] });
  const auth = createDemoAuth(db);

  const as = (userId: string | null) => createDataService(createPgliteTransport(db, () => userId));
  const adminAs = (userId: string | null) => createAdminService(createPgliteTransport(db, () => userId));

  async function user(email: string, options: { confirmed?: boolean; fullName?: string } = {}) {
    const id = await auth.createUser({ email, password: 'test-password-1', fullName: options.fullName, confirmed: options.confirmed ?? true });
    return { id, email, api: as(id), admin: adminAs(id) };
  }

  /** Owner with a provisioned workspace, one property, one room of N beds. */
  async function owner(email: string, businessName: string, beds = 3) {
    const u = await user(email, { fullName: `${businessName} Owner` });
    const tenantId = await u.api.provisionWorkspace({ requestId: newIdempotencyKey(), businessName });
    const propertyId = await u.api.createProperty(tenantId, { name: `${businessName} Main` });
    await u.api.createRooms(propertyId, [{ name: '101', rent_paise: 8_000_00, deposit_paise: 16_000_00, bed_count: beds }]);
    const rooms = await u.api.listRooms(tenantId, propertyId);
    return { ...u, tenantId, propertyId, rooms, bedIds: rooms[0]!.beds.map((b) => b.id) };
  }

  /** Runs raw SQL as an authenticated user (bypassing the RPC layer) to test RLS directly. */
  async function sqlAs<T = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
      await tx.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [
        userId ? 'authenticated' : 'anon',
        JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' }),
      ]);
      return (await tx.query<T>(sql, params)).rows;
    });
  }

  return { db, auth, as, adminAs, user, owner, sqlAs };
}

export type TestBackend = Awaited<ReturnType<typeof createTestBackend>>;

export async function expectAppError(promise: Promise<unknown>, code: string | string[]) {
  const codes = Array.isArray(code) ? code : [code];
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(codes).toContain((error as AppError).code);
    return error as AppError;
  }
  throw new Error(`Expected AppError ${codes.join('|')} but the call succeeded`);
}

export async function expectSqlError(promise: Promise<unknown>, pattern?: RegExp) {
  try {
    await promise;
  } catch (error) {
    if (pattern) expect((error as Error).message).toMatch(pattern);
    return;
  }
  throw new Error('Expected SQL to fail but it succeeded');
}

export async function countRows(db: PGlite, sql: string, params: unknown[] = []): Promise<number> {
  const res = await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params);
  return res.rows[0]!.n;
}
