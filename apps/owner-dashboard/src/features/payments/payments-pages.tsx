import { useDeferredValue, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CreditCard, Printer } from 'lucide-react';
import { useBackend, usePayment, usePayments, useTenantMutation } from '@pg/api-client/react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, endOfMonthISO, formatDate, formatDateTime, formatINR, formatMonth, startOfMonthISO, todayISO, type BusinessDetails, type PaymentMethod } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Select, Textarea } from '@pg/ui-web/ui/form-controls';
import { Badge, Card, Skeleton } from '@pg/ui-web/ui/surfaces';
import { Segmented } from '@pg/ui-web/ui/overlays';
import { Table, TBody, TD, TH, THead, TR } from '@pg/ui-web/ui/table';
import { ConfirmDialog, EmptyState, ErrorState, Field, Money, PageHeader, Pagination, PaymentStatusBadge, SearchInput, StatCard, TableSkeleton } from '@pg/ui-web/common';
import { MonthInput } from '@/components/pickers';
import { LogoMark } from '@/layout/brand';
import { useDialogs } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';

const PAGE = 50;

export function PaymentsPage() {
  const { tenantId, propertyId, can } = useCurrentWorkspace();
  const open = useDialogs((s) => s.open);
  const navigate = useNavigate();
  const [month, setMonth] = useState(startOfMonthISO(todayISO()));
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [status, setStatus] = useState<'live' | 'voided' | 'all'>('live');
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const [offset, setOffset] = useState(0);
  const payments = usePayments(tenantId, {
    from: month,
    to: endOfMonthISO(month),
    method: method || null,
    status,
    property_id: propertyId,
    search: deferred.trim() || undefined,
    limit: PAGE,
    offset,
  });

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Money received, recorded manually by your team."
        actions={
          can('finance.write') && (
            <Button onClick={() => open({ kind: 'record-payment' })}>
              <CreditCard /> Record payment
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={`Collected · ${formatMonth(month)}`} tone="success" loading={!payments.data} value={<Money paise={payments.data?.totals.amount_paise} />} />
        <StatCard label="Payments" loading={!payments.data} value={payments.data?.total ?? 0} footer={status === 'voided' ? 'Voided payments' : 'Recorded in this period'} />
        <StatCard label="Online payments" value="Coming soon" footer="Razorpay collection is planned; today every payment is recorded manually." />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <MonthInput value={month} onChange={(m) => { setMonth(m); setOffset(0); }} />
            <Select value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod | ''); setOffset(0); }} aria-label="Method" className="w-40">
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
            <Segmented label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={[{ value: 'live', label: 'Recorded' }, { value: 'voided', label: 'Voided' }, { value: 'all', label: 'All' }]} />
          </div>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Resident, receipt or reference" />
        </div>
        {payments.isError ? (
          <ErrorState error={payments.error} onRetry={() => void payments.refetch()} />
        ) : payments.isPending ? (
          <TableSkeleton />
        ) : payments.data.rows.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments in this period" description="Recorded payments will appear here with a printable receipt." action={can('finance.write') ? <Button variant="secondary" onClick={() => open({ kind: 'record-payment' })}>Record payment</Button> : undefined} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Receipt</TH>
                  <TH>Resident</TH>
                  <TH>Date</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH align="right">Amount</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {payments.data.rows.map((p) => (
                  <TR key={p.id} className="cursor-pointer hover:bg-gray-25" onClick={() => navigate(`/app/payments/${p.id}`)}>
                    <TD className="font-medium text-gray-900">{p.receipt_number}</TD>
                    <TD>
                      <span className="block font-medium text-gray-800">{p.resident_name}</span>
                      {p.property_name && <span className="block text-xs text-gray-500">{p.property_name}</span>}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(p.paid_on)}</TD>
                    <TD>{PAYMENT_METHOD_LABELS[p.method]}</TD>
                    <TD className="max-w-40 truncate text-gray-500">{p.reference ?? '—'}</TD>
                    <TD numeric className={p.status === 'voided' ? 'text-gray-400 line-through' : 'font-medium text-gray-900'}>
                      {formatINR(p.amount_paise)}
                      {p.status !== 'voided' && p.amount_paise > p.allocated_paise && <span className="block text-xs font-normal text-success-700">{formatINR(p.amount_paise - p.allocated_paise)} credit</span>}
                    </TD>
                    <TD>
                      <PaymentStatusBadge status={p.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination total={payments.data.total} limit={PAGE} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </div>
  );
}

export function BusinessLetterhead({ business, title, number }: { business: BusinessDetails; title: string; number: string }) {
  const address = [business.address_line, business.city, business.state, business.postal_code].filter(Boolean).join(', ');
  return (
    <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <LogoMark className="size-10 print:hidden" />
        <div>
          <p className="text-[15px] font-semibold text-gray-900">{business.name}</p>
          {address && <p className="text-xs text-gray-500">{address}</p>}
          <p className="text-xs text-gray-500">{[business.contact_phone, business.contact_email].filter(Boolean).join(' · ')}</p>
          {business.gstin && <p className="text-xs text-gray-500">GSTIN {business.gstin}</p>}
        </div>
      </div>
      <div className="sm:text-right">
        <p className="text-xs uppercase tracking-wider text-gray-400">{title}</p>
        <p className="tabular text-lg font-semibold text-gray-900">{number}</p>
      </div>
    </div>
  );
}

export function PaymentDetailPage() {
  const { paymentId = '' } = useParams();
  const { tenantId, can } = useCurrentWorkspace();
  const { data } = useBackend();
  const payment = usePayment(tenantId, paymentId);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const voidMutation = useTenantMutation(tenantId, () => data.voidPayment(paymentId, reason));

  if (payment.isError) return <ErrorState error={payment.error} onRetry={() => void payment.refetch()} />;
  if (payment.isPending) return <Skeleton className="h-96 rounded-xl" />;
  const p = payment.data;
  const live = p.allocations.filter((a) => !a.voided_at);
  const credit = p.status === 'voided' ? 0 : p.amount_paise - p.allocated_paise;

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/payments" className="inline-flex items-center gap-1 hover:text-gray-900">
            <ArrowLeft className="size-3.5" /> Payments
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            Receipt {p.receipt_number} <PaymentStatusBadge status={p.status} />
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()} disabled={p.status === 'voided'}>
              <Printer /> Print / PDF
            </Button>
            {can('finance.void') && p.status === 'recorded' && (
              <Button variant="danger-ghost" onClick={() => setVoiding(true)}>
                <Ban /> Void payment
              </Button>
            )}
          </>
        }
      />
      {p.status === 'voided' && (
        <div className="mb-4 rounded-lg border border-danger-100 bg-danger-50 px-4 py-3 text-[13px] text-danger-700">
          Voided on {formatDateTime(p.voided_at)}{p.void_reason ? ` — ${p.void_reason}` : ''}. The amount no longer counts towards any bill.
        </div>
      )}
      <Card className="mx-auto max-w-2xl p-8 print:border-0 print:shadow-none">
        <BusinessLetterhead business={p.business} title="Payment receipt" number={p.receipt_number} />
        <div className="mt-8 text-center">
          <p className="text-xs uppercase tracking-wide text-gray-400">Amount received</p>
          <p className="tabular mt-1 text-4xl font-semibold tracking-tight text-gray-900">{formatINR(p.amount_paise)}</p>
          <p className="mt-2 text-[13px] text-gray-500">
            from <span className="font-medium text-gray-900">{p.resident.full_name}</span> on {formatDate(p.paid_on)}
          </p>
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-gray-100 py-5 text-[13px]">
          <dt className="text-gray-500">Method</dt>
          <dd className="text-right text-gray-900">{PAYMENT_METHOD_LABELS[p.method]}</dd>
          {p.reference && (
            <>
              <dt className="text-gray-500">Reference</dt>
              <dd className="text-right text-gray-900">{p.reference}</dd>
            </>
          )}
          {p.property && (
            <>
              <dt className="text-gray-500">Property</dt>
              <dd className="text-right text-gray-900">{p.property.name}</dd>
            </>
          )}
          <dt className="text-gray-500">Recorded by</dt>
          <dd className="text-right text-gray-900">{p.recorded_by_name ?? '—'}</dd>
          <dt className="text-gray-500">Source</dt>
          <dd className="text-right">
            <Badge>{p.source === 'manual' ? 'Recorded manually — not a gateway transaction' : 'Gateway verified'}</Badge>
          </dd>
        </dl>
        {live.length > 0 && (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-gray-400">Applied to</p>
            <ul className="mt-2 divide-y divide-gray-100 text-[13px]">
              {live.map((a) => (
                <li key={a.id} className="flex justify-between py-2">
                  <Link to={`/app/rent/${a.invoice_id}`} className="text-gray-700 hover:underline print:no-underline">
                    {a.invoice_number}
                    {a.period_start ? ` · ${formatMonth(a.period_start)}` : ''}
                  </Link>
                  <span className="tabular text-gray-900">{formatINR(a.amount_paise)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {credit > 0 && (
          <p className="mt-4 rounded-md bg-success-50 px-3 py-2 text-[13px] text-success-700">
            {formatINR(credit)} kept as advance credit for future bills.
          </p>
        )}
        {p.notes && <p className="mt-6 text-[13px] text-gray-600">{p.notes}</p>}
        {p.business.receipt_footer && <p className="mt-8 border-t border-gray-100 pt-4 text-center text-xs text-gray-400">{p.business.receipt_footer}</p>}
        <p className="mt-4 text-center text-[11px] text-gray-400">Recorded {formatDateTime(p.created_at)}</p>
      </Card>
      <ConfirmDialog
        open={voiding}
        onOpenChange={setVoiding}
        title="Void this payment?"
        description="Use this for bounced cheques or entries made by mistake. The receipt stays on record as voided, bills it paid become due again, and the action is logged."
        confirmLabel="Void payment"
        destructive
        onConfirm={() => voidMutation.mutateAsync().then(() => toast.success('Payment voided'))}
      >
        <Field label="Reason" required htmlFor="vp-reason">
          <Textarea id="vp-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cheque bounced" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
