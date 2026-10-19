import { createAdminService, createDataService, createSupabaseBackend } from '@pg/api-client';
import { unavailableStorage, type Backend } from '@pg/api-client/react';

export type BootResult =
  | { ok: true; backend: Backend }
  | { ok: false; reason: 'not_configured' | 'error'; message: string };

const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim(),
  supabaseKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim(),
  enableDemo: import.meta.env.VITE_ENABLE_DEMO === 'true',
};

/**
 * Chooses the backend explicitly:
 *  - Supabase when configured (production and real development).
 *  - Demo mode (PGlite in the browser) only when Supabase is not configured,
 *    and in production builds only if VITE_ENABLE_DEMO=true.
 * There is never a silent fallback from Supabase to demo data.
 */
export async function bootBackend(onProgress: (message: string) => void): Promise<BootResult> {
  try {
    if (env.supabaseUrl && env.supabaseKey) {
      const sb = createSupabaseBackend({ url: env.supabaseUrl, anonKey: env.supabaseKey });
      return {
        ok: true,
        backend: {
          mode: 'supabase',
          data: createDataService(sb.transport),
          admin: createAdminService(sb.transport),
          auth: sb.auth,
          storage: sb.storage,
        },
      };
    }
    if (import.meta.env.PROD && !env.enableDemo) {
      return {
        ok: false,
        reason: 'not_configured',
        message: 'This deployment is missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      };
    }
    const { createBrowserDemoBackend } = await import('./demo-backend');
    return { ok: true, backend: await createBrowserDemoBackend(onProgress) };
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

export { unavailableStorage };
