import { useState } from 'react';
import { Navigate } from 'react-router';
import { Home, LogOut } from 'lucide-react';
import { useMyContext, useResident } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, formatDate, formatINR, formatMonth } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Card, CardHeader, Skeleton } from '@pg/ui-web/ui/surfaces';
import { Select } from '@pg/ui-web/ui/form-controls';
import { EmptyState, ErrorState, InvoiceStatusBadge, StatCard } from '@pg/ui-web/common';
import { Logo, Splash } from '@/layout/brand';
import { DemoBanner } from '@/layout/app-shell';
import { useAuth } from '@/app/auth';

/**
 * Read-only view for residents who accepted an app invitation. RLS limits
 * everything here to their own resident record.
 */
export function ResidentPortalPage() {
  const me = useMyContext();
  const { signOut } = useAuth();
  const [index, setIndex] = useState(0);
  const link = me.data?.resident_links[index];
  const resident = useResident(link?.tenant_id, link?.resident_id);

  if (me.isPending) return <Splash />;
  if (me.data && me.data.resident_links.length === 0) return <Navigate to="/app" replace />;
  const r = resident.data;
  const stay = r?.stays.find((s) => s.status === 'active');

  return (
    <div className="min-h-dvh bg-background">
      <DemoBanner />
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Logo />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {(me.data?.resident_links.length ?? 0) > 1 && (
          <Select value={index} onChange={(e) => setIndex(Number(e.target.value))} aria-label="Accommodation">
            {me.data!.resident_links.map((l, i) => (
              <option key={l.resident_id} value={i}>
                {l.tenant_name}
              </option>
            ))}
          </Select>
        )}
        <div>
          <p className="text-[13px] text-gray-500">{link?.tenant_name}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Hi {link?.resident_name.split(' ')[0]}</h1>
          {stay && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-gray-600">
              <Home className="size-4" /> {stay.property_name} · Room {stay.room_name} / Bed {stay.bed_label}
            </p>
          )}
        </div>
        {resident.isError ? (
          <ErrorState error={resident.error} />
        ) : !r ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Amount due" tone={r.balance?.overdue_paise ? 'danger' : 'default'} value={formatINR(r.balance?.outstanding_paise ?? 0)} footer={r.balance?.overdue_paise ? `${formatINR(r.balance.overdue_paise)} overdue` : 'Nothing overdue'} />
              <StatCard label="Deposit held" value={formatINR(r.deposit ? r.deposit.collected_paise - r.deposit.refunded_paise - r.deposit.deducted_paise : 0)} />
            </div>
            <Card>
              <CardHeader title="Bills" />
              {r.invoices.length === 0 ? (
                <EmptyState compact icon={Home} title="No bills yet" />
              ) : (
                <ul className="divide-y divide-gray-100">
                  {r.invoices.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-gray-900">{i.period_start ? `Rent · ${formatMonth(i.period_start)}` : i.invoice_number}</span>
                        <span className="text-xs text-gray-500">Due {formatDate(i.due_date)}</span>
                      </span>
                      <InvoiceStatusBadge status={i.payment_status} />
                      <span className="tabular w-24 text-right font-medium">{formatINR(i.total_paise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Payments" />
              {r.payments.length === 0 ? (
                <EmptyState compact icon={Home} title="No payments recorded yet" />
              ) : (
                <ul className="divide-y divide-gray-100">
                  {r.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-gray-900">{p.receipt_number}</span>
                        <span className="text-xs text-gray-500">
                          {formatDate(p.paid_on)} · {PAYMENT_METHOD_LABELS[p.method]}
                          {p.status === 'voided' && ' · voided'}
                        </span>
                      </span>
                      <span className="tabular font-medium text-success-700">{formatINR(p.amount_paise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
