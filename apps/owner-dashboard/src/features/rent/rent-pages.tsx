import { useDeferredValue, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CalendarCheck, CreditCard, FilePlus, FileText, Printer } from 'lucide-react';
import { useBackend, useInvoice, useInvoices, useTenantMutation } from '@pg/api-client/react';
import type { InvoiceListParams } from '@pg/api-client';
import { INVOICE_ITEM_KIND_LABELS, PAYMENT_METHOD_LABELS, formatDate, formatINR, formatMonth, startOfMonthISO, todayISO } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Textarea } from '@pg/ui-web/ui/form-controls';
import { Badge, Card, Skeleton } from '@pg/ui-web/ui/surfaces';
import { Segmented } from '@pg/ui-web/ui/overlays';
import { Table, TBody, TD, TH, THead, TR } from '@pg/ui-web/ui/table';
import { ConfirmDialog, EmptyState, ErrorState, Field, InvoiceStatusBadge, Money, PageHeader, Pagination, SearchInput, StatCard, TableSkeleton } from '@pg/ui-web/common';
import { MonthInput } from '@/components/pickers';
import { useDialogs } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';
import { BusinessLetterhead } from '@/features/payments/payments-pages';

const PAGE = 50;

export function RentPage() {
  const { tenantId, propertyId, can } = useCurrentWorkspace();
  const open = useDialogs((s) => s.open);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as InvoiceListParams['status']) ?? 'all';
  const [month, setMonth] = useState<string | null>(params.get('status') === 'overdue' ? null : startOfMonthISO(todayISO()));
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const [offset, setOffset] = useState(0);
  const invoices = useInvoices(tenantId, { status, month, property_id: propertyId, search: deferred.trim() || undefined, limit: PAGE, offset });
  const totals = invoices.data?.totals;

  return (
    <div>
      <PageHeader
        title="Rent management"
        description="Bills for rent and other charges. Status updates automatically from due dates and recorded payments."
        actions={
          can('finance.write') && (
            <>
              <Button variant="secondary" onClick={() => open({ kind: 'create-invoice' })}>
                <FilePlus /> New bill
              </Button>
              <Button onClick={() => open({ kind: 'generate-rent' })}>
                <CalendarCheck /> Generate rent
              </Button>
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={month ? `Billed · ${formatMonth(month)}` : 'Billed (all time)'} loading={!totals} value={<Money paise={totals?.total_paise} />} />
        <StatCard label="Paid" tone="success" loading={!totals} value={<Money paise={totals?.paid_paise} />} />
        <StatCard label="Balance due" tone={totals?.balance_paise ? 'danger' : 'default'} loading={!totals} value={<Money paise={totals?.balance_paise} />} />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <Segmented
            label="Payment status"
            value={status ?? 'all'}
            onChange={(v) => {
              setParams(v === 'all' ? {} : { status: v }, { replace: true });
              setOffset(0);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Unpaid' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'partially_paid', label: 'Partial' },
              { value: 'paid', label: 'Paid' },
              { value: 'void', label: 'Void' },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              {month ? (
                <MonthInput value={month} onChange={(m) => { setMonth(m); setOffset(0); }} label="Due month" />
              ) : (
                <span className="text-[13px] text-gray-500">All months</span>
              )}
              <Button variant="ghost" size="sm" onClick={() => setMonth(month ? null : startOfMonthISO(todayISO()))}>
                {month ? 'All months' : 'Pick month'}
              </Button>
            </div>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Resident or bill number" className="sm:w-60" />
          </div>
        </div>
        {invoices.isError ? (
          <ErrorState error={invoices.error} onRetry={() => void invoices.refetch()} />
        ) : invoices.isPending ? (
          <TableSkeleton />
        ) : invoices.data.rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No bills found"
            description={month ? `No bills due in ${formatMonth(month)} match these filters.` : 'No bills match these filters.'}
            action={can('finance.write') ? <Button variant="secondary" onClick={() => open({ kind: 'generate-rent' })}><CalendarCheck /> Generate rent</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Bill</TH>
                  <TH>Resident</TH>
                  <TH>Period</TH>
                  <TH>Due</TH>
                  <TH align="right">Total</TH>
                  <TH align="right">Balance</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {invoices.data.rows.map((inv) => (
                  <TR key={inv.id} className="cursor-pointer hover:bg-gray-25" onClick={() => navigate(`/app/rent/${inv.id}`)}>
                    <TD className="font-medium text-gray-900">
                      <Link to={`/app/rent/${inv.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {inv.invoice_number}
                      </Link>
                      {inv.kind === 'other' && <Badge className="ml-2">Other</Badge>}
                    </TD>
                    <TD>
                      <span className="block font-medium text-gray-800">{inv.resident_name}</span>
                      <span className="block text-xs text-gray-500">{inv.property_name}</span>
                    </TD>
                    <TD>{inv.period_start ? formatMonth(inv.period_start) : '—'}</TD>
                    <TD className="whitespace-nowrap">{formatDate(inv.due_date)}</TD>
                    <TD numeric>{formatINR(inv.total_paise)}</TD>
                    <TD numeric className={inv.balance_paise > 0 && inv.status === 'issued' ? 'font-medium text-gray-900' : 'text-gray-400'}>
                      {inv.status === 'void' ? '—' : formatINR(inv.balance_paise)}
                    </TD>
                    <TD>
                      <InvoiceStatusBadge status={inv.payment_status} />
                    </TD>
                    <TD className="text-right">
                      {can('finance.write') && inv.status === 'issued' && inv.balance_paise > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            open({ kind: 'record-payment', residentId: inv.resident_id });
                          }}
                        >
                          Collect
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination total={invoices.data.total} limit={PAGE} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </div>
  );
}

export function InvoiceDetailPage() {
  const { invoiceId = '' } = useParams();
  const { tenantId, can } = useCurrentWorkspace();
  const { data } = useBackend();
  const open = useDialogs((s) => s.open);
  const invoice = useInvoice(tenantId, invoiceId);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const voidMutation = useTenantMutation(tenantId, () => data.voidInvoice(invoiceId, reason));

  if (invoice.isError) return <ErrorState error={invoice.error} onRetry={() => void invoice.refetch()} />;
  if (invoice.isPending) return <Skeleton className="h-96 rounded-xl" />;
  const inv = invoice.data;
  const liveAllocations = inv.allocations.filter((a) => !a.voided_at);

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/rent" className="inline-flex items-center gap-1 hover:text-gray-900">
            <ArrowLeft className="size-3.5" /> Rent management
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            Bill {inv.invoice_number} <InvoiceStatusBadge status={inv.payment_status} />
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer /> Print / PDF
            </Button>
            {can('finance.write') && inv.status === 'issued' && inv.balance_paise > 0 && (
              <Button onClick={() => open({ kind: 'record-payment', residentId: inv.resident_id })}>
                <CreditCard /> Record payment
              </Button>
            )}
            {can('finance.void') && inv.status === 'issued' && (
              <Button variant="danger-ghost" onClick={() => setVoiding(true)}>
                <Ban /> Void
              </Button>
            )}
          </>
        }
      />

      {inv.status === 'void' && (
        <div className="mb-4 rounded-lg border border-danger-100 bg-danger-50 px-4 py-3 text-[13px] text-danger-700 print:hidden">
          Voided on {formatDate(inv.voided_at)}{inv.void_reason ? ` — ${inv.void_reason}` : ''}. It no longer counts towards the balance.
        </div>
      )}

      <Card className="mx-auto max-w-3xl p-8 print:border-0 print:shadow-none">
        <BusinessLetterhead business={inv.business} title={inv.kind === 'rent' ? 'Rent bill' : 'Bill'} number={inv.invoice_number} />
        <div className="mt-8 grid gap-6 text-[13px] sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Billed to</p>
            <p className="mt-1 font-semibold text-gray-900">{inv.resident.full_name}</p>
            {inv.resident.phone && <p className="text-gray-600">{inv.resident.phone}</p>}
            <p className="text-gray-600">{inv.property.name}</p>
          </div>
          <dl className="grid grid-cols-2 gap-y-1 sm:text-right">
            <dt className="text-gray-500">Issued</dt>
            <dd className="text-gray-900">{formatDate(inv.issue_date)}</dd>
            <dt className="text-gray-500">Due</dt>
            <dd className="font-medium text-gray-900">{formatDate(inv.due_date)}</dd>
            {inv.period_start && (
              <>
                <dt className="text-gray-500">Period</dt>
                <dd className="text-gray-900">
                  {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                </dd>
              </>
            )}
          </dl>
        </div>

        <table className="mt-8 w-full text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="py-2 text-left font-medium">Description</th>
              <th className="py-2 text-left font-medium">Type</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {inv.items.map((item) => (
              <tr key={item.id}>
                <td className="py-2.5 text-gray-900">{item.description}</td>
                <td className="py-2.5 text-gray-500">{INVOICE_ITEM_KIND_LABELS[item.kind]}</td>
                <td className="tabular py-2.5 text-right text-gray-900">{formatINR(item.amount_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 ml-auto w-full max-w-64 space-y-1.5 border-t border-gray-200 pt-4 text-[13px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Total</span>
            <span className="tabular font-semibold text-gray-900">{formatINR(inv.total_paise)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Paid</span>
            <span className="tabular text-success-700">{formatINR(inv.paid_paise)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-1.5 text-[15px]">
            <span className="font-medium text-gray-900">Balance due</span>
            <span className="tabular font-semibold text-gray-900">{formatINR(inv.status === 'void' ? 0 : inv.balance_paise)}</span>
          </div>
        </div>

        {liveAllocations.length > 0 && (
          <div className="mt-8">
            <p className="text-xs uppercase tracking-wide text-gray-400">Payments applied</p>
            <ul className="mt-2 divide-y divide-gray-100 text-[13px]">
              {liveAllocations.map((a) => (
                <li key={a.id} className="flex justify-between py-2">
                  <Link to={`/app/payments/${a.payment_id}`} className="text-gray-700 hover:underline print:no-underline">
                    {formatDate(a.paid_on)} · {PAYMENT_METHOD_LABELS[a.method]} · {a.receipt_number}
                  </Link>
                  <span className="tabular text-gray-900">{formatINR(a.amount_paise)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {inv.notes && <p className="mt-6 text-[13px] text-gray-600">{inv.notes}</p>}
        {inv.business.upi_id && inv.status === 'issued' && inv.balance_paise > 0 && (
          <p className="mt-6 rounded-md bg-gray-25 p-3 text-[13px] text-gray-600 ring-1 ring-gray-100">
            Pay by UPI to <span className="font-medium text-gray-900">{inv.business.upi_id}</span> and share the reference with the office.
          </p>
        )}
        {inv.business.receipt_footer && <p className="mt-8 border-t border-gray-100 pt-4 text-center text-xs text-gray-400">{inv.business.receipt_footer}</p>}
      </Card>

      <ConfirmDialog
        open={voiding}
        onOpenChange={setVoiding}
        title={`Void bill ${inv.invoice_number}?`}
        description="The bill stays on record but no longer counts towards the balance. Any payments applied to it become credit for other bills. This is logged in the activity log."
        confirmLabel="Void bill"
        destructive
        onConfirm={() => voidMutation.mutateAsync().then(() => toast.success('Bill voided'))}
      >
        <Field label="Reason" required htmlFor="void-reason">
          <Textarea id="void-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Issued by mistake" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
