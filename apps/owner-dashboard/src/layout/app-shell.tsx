import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  BarChart3,
  BedDouble,
  Bell,
  Building2,
  ChevronsUpDown,
  CreditCard,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { ROLE_LABELS, formatINR, relativeDays, type Permission } from '@pg/shared';
import { useBackend, useDashboard, useProperties } from '@pg/api-client/react';
import { cn } from '@pg/ui-web/utils';
import { Button } from '@pg/ui-web/ui/button';
import { Select } from '@pg/ui-web/ui/form-controls';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip } from '@pg/ui-web/ui/overlays';
import { Avatar } from '@pg/ui-web/ui/surfaces';
import { GlobalDialogs } from '@/features/global-dialogs';
import { useAuth } from '@/app/auth';
import { useDialogs, useSessionStore } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';
import { Logo } from './brand';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  end?: boolean;
}

const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/app/properties', label: 'Properties', icon: Building2 },
      { to: '/app/rooms', label: 'Rooms & Beds', icon: BedDouble },
      { to: '/app/residents', label: 'Residents', icon: Users },
    ],
  },
  {
    section: 'Money',
    items: [
      { to: '/app/rent', label: 'Rent Management', icon: FileText, permission: 'finance.read' },
      { to: '/app/payments', label: 'Payments', icon: CreditCard, permission: 'finance.read' },
      { to: '/app/deposits', label: 'Deposits', icon: Wallet, permission: 'finance.read' },
      { to: '/app/expenses', label: 'Expenses', icon: Receipt, permission: 'finance.read' },
      { to: '/app/reports', label: 'Reports', icon: BarChart3, permission: 'finance.read' },
    ],
  },
  { items: [{ to: '/app/settings', label: 'Settings', icon: Settings }] },
];

export function DemoBanner() {
  const { mode, demo } = useBackend();
  if (mode === 'supabase' || !demo) return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-navy-900 px-4 py-1.5 text-center text-xs text-white/90 print:hidden">
      <FlaskConical className="size-3.5 shrink-0 text-accent-200" aria-hidden />
      <span>
        <strong className="font-semibold text-white">Demo mode</strong> — sample data in your browser only. Not saved to any server.
      </span>
      {demo.reset && (
        <button onClick={() => void demo.reset?.()} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-accent-200 underline-offset-2 hover:underline">
          <RotateCcw className="size-3" aria-hidden /> Reset
        </button>
      )}
    </div>
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { can } = useCurrentWorkspace();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {NAV.map((group, i) => {
        const items = group.items.filter((item) => !item.permission || can(item.permission));
        if (items.length === 0) return null;
        return (
          <div key={i}>
            {group.section && !collapsed && <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group.section}</p>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900',
                        isActive && 'bg-accent-50 text-accent-800 hover:bg-accent-50 hover:text-accent-800',
                        collapsed && 'justify-center px-0',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn('size-[18px] shrink-0', isActive ? 'text-accent-600' : 'text-gray-400 group-hover:text-gray-600')} aria-hidden />
                        {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
                      </>
                    )}
                  </NavLink>
                );
                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip content={item.label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { me, workspace, switchTenant, role } = useCurrentWorkspace();
  const many = me.workspaces.length > 1;
  const body = (
    <div className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left', many && 'hover:bg-gray-100')}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-600 text-xs font-semibold text-white">
        {workspace.name.slice(0, 2).toUpperCase()}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-gray-900">{workspace.name}</span>
          <span className="block text-xs text-gray-500">{ROLE_LABELS[role]}</span>
        </span>
      )}
      {!collapsed && many && <ChevronsUpDown className="size-4 text-gray-400" aria-hidden />}
    </div>
  );
  if (!many) return <div className="px-3">{body}</div>;
  return (
    <div className="px-3">
      <Menu>
        <MenuTrigger className="w-full" aria-label="Switch workspace">
          {body}
        </MenuTrigger>
        <MenuContent align="start" className="w-64">
          <MenuLabel>Workspaces</MenuLabel>
          {me.workspaces.map((w) => (
            <MenuItem key={w.tenant_id} onSelect={() => switchTenant(w.tenant_id)}>
              <span className="flex-1 truncate">{w.name}</span>
              {w.tenant_id === workspace.tenant_id && <Check className="!text-accent-600" />}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
}

function PropertySelector() {
  const { tenantId, propertyId, setPropertyId } = useCurrentWorkspace();
  const properties = useProperties(tenantId);
  if (!properties.data || properties.data.length < 2) return null;
  return (
    <div className="hidden w-56 md:block">
      <Select value={propertyId ?? ''} onChange={(e) => setPropertyId(e.target.value || null)} aria-label="Property filter" className="h-8 text-[13px]">
        <option value="">All properties</option>
        {properties.data.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

function QuickActions() {
  const { can } = useCurrentWorkspace();
  const open = useDialogs((s) => s.open);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="accent" size="sm">
          <Plus /> <span className="hidden sm:inline">New</span>
        </Button>
      </MenuTrigger>
      <MenuContent className="w-52">
        {can('finance.write') && <MenuItem onSelect={() => open({ kind: 'record-payment' })}><CreditCard /> Record payment</MenuItem>}
        {can('residents.write') && <MenuItem onSelect={() => open({ kind: 'add-resident' })}><Users /> Add resident</MenuItem>}
        {can('residents.write') && <MenuItem onSelect={() => open({ kind: 'assign-bed' })}><BedDouble /> Assign bed</MenuItem>}
        {can('finance.write') && <MenuItem onSelect={() => open({ kind: 'add-expense' })}><Receipt /> Add expense</MenuItem>}
        {can('properties.write') && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => open({ kind: 'add-property' })}><Building2 /> Add property</MenuItem>
            <MenuItem onSelect={() => open({ kind: 'add-rooms' })}><Plus /> Add rooms</MenuItem>
          </>
        )}
        {!can('residents.write') && !can('finance.write') && <MenuItem disabled>No actions for your role</MenuItem>}
      </MenuContent>
    </Menu>
  );
}

/** Live "needs attention" list derived from current records (no scheduled notifications exist). */
function AttentionPanel() {
  const { tenantId, propertyId } = useCurrentWorkspace();
  const dash = useDashboard(tenantId, propertyId);
  const d = dash.data;
  const items: { title: string; detail: string; to: string }[] = [];
  if (d?.finance) {
    if (d.finance.overdue_paise > 0) items.push({ title: `${formatINR(d.finance.overdue_paise)} overdue`, detail: 'Rent past its due date', to: '/app/rent?status=overdue' });
    if (d.finance.stays_without_invoice > 0)
      items.push({ title: `${d.finance.stays_without_invoice} residents not billed this month`, detail: 'Generate this month’s rent', to: '/app/rent' });
  }
  for (const m of d?.upcoming_move_outs ?? []) {
    items.push({ title: `${m.full_name} moving out ${relativeDays(m.expected_move_out_date, d!.today)}`, detail: m.property_name, to: `/app/residents/${m.resident_id}` });
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Needs attention${items.length ? ` (${items.length})` : ''}`} className="relative">
          <Bell />
          {items.length > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger-600 ring-2 ring-white" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">Needs attention</p>
          <p className="text-xs text-gray-500">Based on your current records</p>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-gray-500">You’re all caught up.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
            {items.map((item, i) => (
              <li key={i}>
                <NavLink to={item.to} className="block px-4 py-3 hover:bg-gray-50">
                  <p className="text-[13px] font-medium text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.detail}</p>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const { me } = useCurrentWorkspace();
  const { signOut } = useAuth();
  const name = me.user.full_name || me.user.email || 'Account';
  return (
    <Menu>
      <MenuTrigger className="rounded-full focus-visible:outline-2 focus-visible:outline-accent-600" aria-label="Account menu">
        <Avatar name={name} />
      </MenuTrigger>
      <MenuContent className="w-60">
        <div className="px-2 py-2">
          <p className="truncate text-[13px] font-semibold text-gray-900">{name}</p>
          {me.user.email && <p className="truncate text-xs text-gray-500">{me.user.email}</p>}
        </div>
        <MenuSeparator />
        <MenuItem asChild>
          <NavLink to="/app/settings">
            <Settings /> Settings
          </NavLink>
        </MenuItem>
        {me.is_platform_admin && (
          <MenuItem disabled>
            <ShieldCheck /> Platform admin (use the admin app)
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function AppShell() {
  const collapsed = useSessionStore((s) => s.sidebarCollapsed);
  const toggle = useSessionStore((s) => s.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-200 lg:flex print:hidden',
            collapsed ? 'w-[68px]' : 'w-60',
          )}
        >
          <div className={cn('flex h-14 items-center border-b border-gray-100', collapsed ? 'justify-center' : 'justify-between px-4')}>
            <Logo collapsed={collapsed} />
            {!collapsed && (
              <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Collapse sidebar">
                <PanelLeftClose />
              </Button>
            )}
          </div>
          <div className="pt-3">
            <WorkspaceSwitcher collapsed={collapsed} />
          </div>
          <SidebarNav collapsed={collapsed} />
          {collapsed && (
            <div className="border-t border-gray-100 p-3">
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Expand sidebar" className="w-full">
                <PanelLeftOpen />
              </Button>
            </div>
          )}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal aria-label="Navigation">
            <div className="absolute inset-0 bg-navy-950/40 animate-fade-in" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-lg animate-slide-up">
              <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4">
                <Logo />
                <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                  <X />
                </Button>
              </div>
              <div className="pt-3">
                <WorkspaceSwitcher collapsed={false} />
              </div>
              <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/70 sm:px-6 print:hidden">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <MenuIcon />
            </Button>
            <PropertySelector />
            <div className="ml-auto flex items-center gap-1.5">
              <QuickActions />
              <AttentionPanel />
              <div className="ml-1.5">
                <UserMenu />
              </div>
            </div>
          </header>
          <main key={location.pathname.split('/')[2] ?? 'overview'} className="mx-auto w-full max-w-[1400px] flex-1 animate-fade-in px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
            <Outlet />
          </main>
        </div>
      </div>
      <GlobalDialogs />
    </div>
  );
}
