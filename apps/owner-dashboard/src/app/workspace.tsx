import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { can, type Permission, type TenantRole, type UserContext, type WorkspaceSummary } from '@pg/shared';
import { queryKeys, useProperties, useWorkspace } from '@pg/api-client/react';
import { useSessionStore } from './stores';

interface WorkspaceContextValue {
  me: UserContext;
  tenantId: string;
  workspace: WorkspaceSummary;
  role: TenantRole;
  can: (permission: Permission) => boolean;
  switchTenant: (tenantId: string) => void;
  /** Selected property filter (null = all properties). */
  propertyId: string | null;
  setPropertyId: (propertyId: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** Picks the active workspace from the user's verified memberships. */
export function resolveActiveWorkspace(me: UserContext, preferred: string | null): WorkspaceSummary | null {
  if (me.workspaces.length === 0) return null;
  return me.workspaces.find((w) => w.tenant_id === preferred) ?? me.workspaces[0]!;
}

export function WorkspaceProvider({ me, children }: { me: UserContext; children: ReactNode }) {
  const queryClient = useQueryClient();
  const preferred = useSessionStore((s) => s.activeTenantId);
  const setActiveTenant = useSessionStore((s) => s.setActiveTenant);
  const propertyByTenant = useSessionStore((s) => s.propertyByTenant);
  const setProperty = useSessionStore((s) => s.setProperty);

  const workspace = resolveActiveWorkspace(me, preferred)!;
  const tenantId = workspace.tenant_id;

  // Drop a remembered property that no longer exists in this tenant.
  const properties = useProperties(tenantId);
  const storedProperty = propertyByTenant[tenantId] ?? null;
  const propertyId = storedProperty && properties.data && !properties.data.some((p) => p.id === storedProperty) ? null : storedProperty;

  const switchTenant = useCallback(
    (next: string) => {
      if (next === tenantId) return;
      // Remove cached data of the workspace being left; the next one loads fresh.
      queryClient.removeQueries({ queryKey: queryKeys.tenant(tenantId) });
      setActiveTenant(next);
    },
    [queryClient, setActiveTenant, tenantId],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      me,
      tenantId,
      workspace,
      role: workspace.role,
      can: (p) => can(workspace.role, p),
      switchTenant,
      propertyId,
      setPropertyId: (id) => setProperty(tenantId, id),
    }),
    [me, tenantId, workspace, switchTenant, propertyId, setProperty],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useCurrentWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useCurrentWorkspace must be used within WorkspaceProvider');
  return ctx;
}

/** Full workspace record (settings, plan, usage) for the active tenant. */
export function useActiveWorkspaceDetails() {
  const { tenantId } = useCurrentWorkspace();
  return useWorkspace(tenantId);
}
