import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAdminService,
  createDataService,
  createOnlinePaymentsClient,
  createSnapshotAuth,
  createSnapshotTransport,
  createSupabaseBackend,
  unavailableOnlinePayments,
  type DemoSnapshot,
} from '@pg/api-client';
import { unavailableStorage, type Backend } from '@pg/api-client/react';

/**
 * Supabase when EXPO_PUBLIC_SUPABASE_* are set. Otherwise an explicit,
 * read-only demo built from a recorded snapshot of the sample workspace
 * (PGlite cannot run on Hermes). Never a silent fallback.
 */
export function createBackend(): Backend {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (url && key) {
    const sb = createSupabaseBackend({ url, anonKey: key, storage: AsyncStorage, detectSessionInUrl: false });
    // Online rent payments (owner's Razorpay) go through the PG Sathi payments service.
    const paymentsUrl = process.env.EXPO_PUBLIC_RESIDENT_API_URL?.trim();
    return {
      mode: 'supabase',
      data: createDataService(sb.transport),
      admin: createAdminService(sb.transport),
      auth: sb.auth,
      storage: sb.storage,
      onlinePayments: paymentsUrl
        ? createOnlinePaymentsClient(paymentsUrl, async () => (await sb.client.auth.getSession()).data.session?.access_token ?? null)
        : unavailableOnlinePayments,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const snapshot = require('./demo/snapshot.json') as DemoSnapshot;
  const transport = createSnapshotTransport(snapshot);
  const KEY = 'pg-saas-mobile-demo-session';
  return {
    mode: 'demo-snapshot',
    data: createDataService(transport),
    admin: createAdminService(transport),
    auth: createSnapshotAuth(snapshot, {
      load: async () => (await AsyncStorage.getItem(KEY)) === '1',
      save: async (v) => (v ? AsyncStorage.setItem(KEY, '1') : AsyncStorage.removeItem(KEY)),
    }),
    storage: unavailableStorage,
    demo: {
      description: `Read-only demo · sample data recorded ${snapshot.today}`,
      readOnly: true,
      sampleAccount: { email: snapshot.email, password: '' },
    },
  };
}
