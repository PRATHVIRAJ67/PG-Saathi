import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { Compass, LogOut } from 'lucide-react';
import { useMyContext } from '@pg/api-client/react';
import { Button } from '@pg/ui-web/ui/button';
import { EmptyState, ErrorState } from '@pg/ui-web/common';
import { AppShell } from '@/layout/app-shell';
import { Splash } from '@/layout/brand';
import { useAuth } from './auth';
import { useSessionStore } from './stores';
import { WorkspaceProvider, resolveActiveWorkspace } from './workspace';
import { AuthCallbackPage, ForgotPasswordPage, ResetPasswordPage, SignInPage, SignUpPage, VerifyEmailPage } from '@/features/auth/auth-pages';
import { OnboardingPage } from '@/features/onboarding/onboarding-page';
import { OverviewPage } from '@/features/overview/overview-page';
import { PropertiesPage, PropertyDetailPage } from '@/features/properties/properties-pages';
import { RoomsPage } from '@/features/rooms/rooms-page';
import { ResidentsPage } from '@/features/residents/residents-page';
import { ResidentDetailPage } from '@/features/residents/resident-detail-page';
import { InvoiceDetailPage, RentPage } from '@/features/rent/rent-pages';
import { PaymentDetailPage, PaymentsPage } from '@/features/payments/payments-pages';
import { DepositsPage } from '@/features/deposits/deposits-page';
import { ExpensesPage } from '@/features/expenses/expenses-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { AcceptInvitationPage } from '@/features/invitations/accept-invitation-page';
import { ResidentPortalPage } from '@/features/portal/resident-portal-page';
import { RequirePermission } from './require-permission';

function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <Splash />;
  if (state.status === 'signed_out') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return <Outlet />;
}

function RedirectIfSignedIn() {
  const { state } = useAuth();
  const [params] = useSearchParams();
  if (state.status === 'loading') return <Splash />;
  if (state.status === 'signed_in') {
    const next = params.get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/app'} replace />;
  }
  return <Outlet />;
}

/** Decides where a signed-in user belongs, based on verified memberships. */
function AppGate() {
  const me = useMyContext();
  const preferred = useSessionStore((s) => s.activeTenantId);
  const { signOut } = useAuth();

  if (me.isPending) return <Splash message="Loading your workspace…" />;
  if (me.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div>
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }
  const ctx = me.data;
  const active = resolveActiveWorkspace(ctx, preferred);
  if (!active) {
    return <Navigate to={ctx.resident_links.length > 0 ? '/portal' : '/onboarding'} replace />;
  }
  if (!active.onboarding_completed_at && active.role === 'owner') {
    return <Navigate to="/onboarding" replace />;
  }
  return (
    <WorkspaceProvider me={ctx}>
      <AppShell />
    </WorkspaceProvider>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you are looking for doesn’t exist or has moved."
        action={
          <Button asChild>
            <a href="/app">Go to dashboard</a>
          </Button>
        }
      />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RedirectIfSignedIn />}>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/invite/:token" element={<AcceptInvitationPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/portal" element={<ResidentPortalPage />} />
        <Route path="/app" element={<AppGate />}>
          <Route index element={<OverviewPage />} />
          <Route path="properties" element={<PropertiesPage />} />
          <Route path="properties/:propertyId" element={<PropertyDetailPage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="residents" element={<ResidentsPage />} />
          <Route path="residents/:residentId" element={<ResidentDetailPage />} />
          <Route element={<RequirePermission permission="finance.read" />}>
            <Route path="rent" element={<RentPage />} />
            <Route path="rent/:invoiceId" element={<InvoiceDetailPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="payments/:paymentId" element={<PaymentDetailPage />} />
            <Route path="deposits" element={<DepositsPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:tab" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
