import { createDemoBackend, type SqlFile } from '@pg/demo-db';
import { unavailableStorage, type Backend } from '@pg/api-client/react';
import seedSql from '../../../../supabase/seed.sql?raw';

const migrationModules = import.meta.glob('../../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function toSqlFiles(modules: Record<string, string>): SqlFile[] {
  return Object.entries(modules)
    .map(([path, sql]) => ({ name: path.split('/').pop()!, sql }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function browserStorage() {
  try {
    const probe = '__pg_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  }
}

export async function createBrowserDemoBackend(onProgress: (message: string) => void): Promise<Backend> {
  const demo = await createDemoBackend({
    migrations: toSqlFiles(migrationModules),
    seeds: [{ name: 'seed.sql', sql: seedSql }],
    databaseName: 'pg-saas-owner-demo',
    storage: browserStorage(),
    onProgress,
  });
  return {
    mode: 'demo',
    data: demo.data,
    admin: demo.admin,
    auth: demo.auth,
    storage: unavailableStorage,
    residentAccess: demo.residentAccess,
    demo: {
      description:
        'Demo mode: the real database schema is running inside your browser with fictional sample data. Nothing is sent to a server, and data stays on this device.',
      sampleAccount: demo.sampleAccount,
      reset: async () => {
        await demo.reset();
        window.location.assign('/');
      },
    },
  };
}
