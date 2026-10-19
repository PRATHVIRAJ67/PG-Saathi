import { Outlet } from 'react-router';
import { Lock } from 'lucide-react';
import type { Permission } from '@pg/shared';
import { EmptyState } from '@pg/ui-web/common';
import { useCurrentWorkspace } from './workspace';

/**
 * Hides pages the current role cannot use. This is a UX guard only — the
 * database functions enforce the same rules for every request.
 */
export function RequirePermission({ permission }: { permission: Permission }) {
  const { can, role } = useCurrentWorkspace();
  if (!can(permission)) {
    return (
      <EmptyState
        icon={Lock}
        title="You don’t have access to this page"
        description={`Your role (${role}) cannot view this section. Ask the workspace owner if you need access.`}
      />
    );
  }
  return <Outlet />;
}
