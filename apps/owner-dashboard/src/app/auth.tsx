import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthSession } from '@pg/api-client';
import { useBackend } from '@pg/api-client/react';
import { useSessionStore } from './stores';

type AuthState =
  | { status: 'loading'; session: null }
  | { status: 'signed_out'; session: null }
  | { status: 'signed_in'; session: AuthSession };

interface AuthContextValue {
  state: AuthState;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Tracks the auth session. Whenever the signed-in user changes (sign-out or a
 * different account), every cached query is dropped so no data from the
 * previous session can be shown.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = useBackend();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null });
  const lastUser = useRef<string | null>(null);

  const apply = useCallback(
    (session: AuthSession | null) => {
      const userId = session?.userId ?? null;
      if (userId !== lastUser.current) {
        queryClient.clear();
        if (lastUser.current !== null) useSessionStore.getState().reset();
        lastUser.current = userId;
      }
      setState(session ? { status: 'signed_in', session } : { status: 'signed_out', session: null });
    },
    [queryClient],
  );

  useEffect(() => {
    let active = true;
    auth
      .getSession()
      .then((s) => active && apply(s))
      .catch(() => active && apply(null));
    const unsubscribe = auth.onChange((s) => apply(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth, apply]);

  const signOut = useCallback(async () => {
    await auth.signOut();
    queryClient.clear();
    useSessionStore.getState().reset();
    apply(null);
  }, [auth, apply, queryClient]);

  const value = useMemo(() => ({ state, signOut }), [state, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
