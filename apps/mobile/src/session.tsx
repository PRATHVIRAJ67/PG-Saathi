import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AuthSession } from '@pg/api-client';
import { queryKeys, useBackend, useMyContext } from '@pg/api-client/react';
import { can, type Permission, type WorkspaceSummary } from '@pg/shared';

interface Prefs {
  activeTenantId: string | null;
  propertyByTenant: Record<string, string | null>;
  setActiveTenant: (id: string | null) => void;
  setProperty: (tenantId: string, propertyId: string | null) => void;
  reset: () => void;
}

/** Device preferences only; access is always re-validated against memberships. */
export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      activeTenantId: null,
      propertyByTenant: {},
      setActiveTenant: (id) => set({ activeTenantId: id }),
      setProperty: (tenantId, propertyId) => set((s) => ({ propertyByTenant: { ...s.propertyByTenant, [tenantId]: propertyId } })),
      reset: () => set({ activeTenantId: null, propertyByTenant: {} }),
    }),
    { name: 'pg-saas-prefs', storage: createJSONStorage(() => AsyncStorage) },
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

/** Active workspace, chosen from the user's verified memberships. */
export function useWorkspaceContext() {
  const me = useMyContext();
  const queryClient = useQueryClient();
  const preferred = usePrefs((s) => s.activeTenantId);
  const setActive = usePrefs((s) => s.setActiveTenant);
  const propertyByTenant = usePrefs((s) => s.propertyByTenant);
  const setProperty = usePrefs((s) => s.setProperty);
  const workspaces = me.data?.workspaces ?? [];
  const workspace: WorkspaceSummary | undefined = workspaces.find((w) => w.tenant_id === preferred) ?? workspaces[0];
  const tenantId = workspace?.tenant_id ?? null;
  return {
    me,
    workspace,
    tenantId,
    role: workspace?.role ?? null,
    can: (p: Permission) => can(workspace?.role, p),
    propertyId: tenantId ? (propertyByTenant[tenantId] ?? null) : null,
    setPropertyId: (id: string | null) => tenantId && setProperty(tenantId, id),
    switchTenant: (id: string) => {
      if (tenantId) queryClient.removeQueries({ queryKey: queryKeys.tenant(tenantId) });
      setActive(id);
    },
  };
}
