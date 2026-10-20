import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AuthSession } from '@pg/api-client';
import { queryKeys, useBackend, useMyContext } from '@pg/api-client/react';
import type { ResidentLink } from '@pg/shared';

interface Prefs {
  /** Which PG to show when a resident has stayed in more than one. */
  activeResidentId: string | null;
  setActiveResident: (id: string | null) => void;
  reset: () => void;
}

/** Device preference only; access is re-validated against the user's links on every load. */
export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      activeResidentId: null,
      setActiveResident: (id) => set({ activeResidentId: id }),
      reset: () => set({ activeResidentId: null }),
    }),
    { name: 'pg-sathi-resident-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

type AuthState = { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; session: AuthSession };
const AuthContext = createContext<{ state: AuthState; signOut: () => Promise<void> } | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = useBackend();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const lastUser = useRef<string | null>(null);

  const apply = useCallback(
    (session: AuthSession | null) => {
      const id = session?.userId ?? null;
      if (id !== lastUser.current) {
        // A different (or no) user: drop every cached query.
        queryClient.clear();
        if (lastUser.current) usePrefs.getState().reset();
        lastUser.current = id;
      }
      setState(session ? { status: 'signed_in', session } : { status: 'signed_out' });
    },
    [queryClient],
  );

  useEffect(() => {
    void auth.getSession().then(apply, () => apply(null));
    return auth.onChange(apply);
  }, [auth, apply]);

  const signOut = useCallback(async () => {
    await auth.signOut();
    apply(null);
  }, [auth, apply]);

  return <AuthContext.Provider value={useMemo(() => ({ state, signOut }), [state, signOut])}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** The resident record (and PG) this signed-in user is linked to. */
export function useResidentContext() {
  const me = useMyContext();
  const queryClient = useQueryClient();
  const preferred = usePrefs((s) => s.activeResidentId);
  const setActive = usePrefs((s) => s.setActiveResident);
  const links: ResidentLink[] = me.data?.resident_links ?? [];
  const link = links.find((l) => l.resident_id === preferred) ?? links[0];
  return {
    me,
    links,
    link,
    tenantId: link?.tenant_id ?? null,
    residentId: link?.resident_id ?? null,
    switchTo: (residentId: string) => {
      if (link) queryClient.removeQueries({ queryKey: queryKeys.tenant(link.tenant_id) });
      setActive(residentId);
    },
  };
}
