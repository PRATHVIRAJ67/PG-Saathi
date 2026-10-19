import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Client-only UI state. Server data lives in TanStack Query. The selected
 * tenant is a preference that is re-validated against the user's memberships
 * on every load — it never grants access by itself.
 */
interface SessionState {
  activeTenantId: string | null;
  propertyByTenant: Record<string, string | null>;
  sidebarCollapsed: boolean;
  setActiveTenant: (tenantId: string | null) => void;
  setProperty: (tenantId: string, propertyId: string | null) => void;
  toggleSidebar: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      activeTenantId: null,
      propertyByTenant: {},
      sidebarCollapsed: false,
      setActiveTenant: (tenantId) => set({ activeTenantId: tenantId }),
      setProperty: (tenantId, propertyId) => set((s) => ({ propertyByTenant: { ...s.propertyByTenant, [tenantId]: propertyId } })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      reset: () => set({ activeTenantId: null, propertyByTenant: {} }),
    }),
    {
      name: 'pg-saas-session',
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return sessionStorage;
        }
      }),
    },
  ),
);

export type GlobalDialog =
  | { kind: 'record-payment'; residentId?: string }
  | { kind: 'add-resident' }
  | { kind: 'add-expense' }
  | { kind: 'add-property' }
  | { kind: 'add-rooms'; propertyId?: string }
  | { kind: 'assign-bed'; residentId?: string; bedId?: string }
  | { kind: 'generate-rent' }
  | { kind: 'create-invoice'; residentId?: string };

interface DialogState {
  dialog: GlobalDialog | null;
  open: (dialog: GlobalDialog) => void;
  close: () => void;
}

/** Quick actions open these from anywhere (header, overview, detail pages). */
export const useDialogs = create<DialogState>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));
