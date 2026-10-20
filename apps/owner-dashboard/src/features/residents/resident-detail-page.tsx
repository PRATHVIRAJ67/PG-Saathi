import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  Archive,
  ArrowLeft,
  ArrowRightLeft,
  BedDouble,
  CreditCard,
  FilePlus,
  LogOut,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  RotateCcw,
  KeyRound,
  Smartphone,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useBackend, useResident, useTenantMutation } from '@pg/api-client/react';
import { DEPOSIT_KIND_LABELS, PAYMENT_METHOD_LABELS, formatDate, formatINR, formatMonth, type DepositTxnKind, type ResidentDetail } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Badge, Card, CardBody, CardHeader, Skeleton, Avatar } from '@pg/ui-web/ui/surfaces';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from '@pg/ui-web/ui/overlays';
import { Table, TBody, TD, TH, THead, TR } from '@pg/ui-web/ui/table';
import { ConfirmDialog, EmptyState, ErrorState, InvoiceStatusBadge, KeyValue, Money, PageHeader, PaymentStatusBadge, ResidentStatusBadge, StatCard } from '@pg/ui-web/common';
import { useDialogs } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';
import { AssignBedDialog, ChangeRentDialog, MoveOutDialog, ResidentAppLoginDialog, ResidentFormDialog, type AppLoginMode } from './resident-dialogs';
import { DepositDialog } from '@/features/deposits/deposit-dialog';

export function ResidentDetailPage() {
  const { residentId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { tenantId, can } = useCurrentWorkspace();
  const { data } = useBackend();
  const open = useDialogs((s) => s.open);
  const resident = useResident(tenantId, residentId);
  const [dialog, setDialog] = useState<null | 'edit' | 'assign' | 'transfer' | 'moveout' | 'rent' | 'archive' | 'deposit'>(null);
  const [appMode, setAppMode] = useState<AppLoginMode | null>(null);
  const [depositKind, setDepositKind] = useState<DepositTxnKind>('collected');
  const archive = useTenantMutation(tenantId, (archived: boolean) => data.setResidentArchived(residentId, archived));

  useEffect(() => {
    if (params.get('assign') === '1') {
      setDialog('assign');
      params.delete('assign');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  if (resident.isError) return <ErrorState error={resident.error} onRetry={() => void resident.refetch()} />;
  if (resident.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );

  const r = resident.data;
  const activeStay = r.stays.find((s) => s.status === 'active');
  const agreement = activeStay?.agreements.find((a) => a.effective_to === null);
  const deposit = r.deposit;
  const held = deposit ? deposit.collected_paise - deposit.refunded_paise - deposit.deducted_paise : 0;
  const depositDue = deposit ? Math.max(deposit.agreed_paise - deposit.collected_paise, 0) : 0;

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/residents" className="inline-flex items-center gap-1 hover:text-gray-900">
            <ArrowLeft className="size-3.5" /> Residents
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={r.full_name} className="size-9 text-sm" />
            {r.full_name}
            <ResidentStatusBadge status={r.status} />
          </span>
        }
        description={activeStay ? `${activeStay.property_name} · Room ${activeStay.room_name} / Bed ${activeStay.bed_label} · since ${formatDate(activeStay.move_in_date)}` : undefined}
        actions={
          <>
            {can('finance.write') && (
              <Button onClick={() => open({ kind: 'record-payment', residentId })}>
                <CreditCard /> Record payment
              </Button>
            )}
            {can('residents.write') && !activeStay && r.status !== 'archived' && (
              <Button variant="secondary" onClick={() => setDialog('assign')}>
                <BedDouble /> Assign bed
              </Button>
            )}
            {(can('residents.write') || can('finance.write')) && (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </MenuTrigger>
                <MenuContent className="w-52">
                  {can('residents.write') && (
                    <MenuItem onSelect={() => setDialog('edit')}>
                      <Pencil /> Edit details
                    </MenuItem>
                  )}
                  {can('finance.write') && (
                    <MenuItem onSelect={() => open({ kind: 'create-invoice', residentId })}>
                      <FilePlus /> New bill
                    </MenuItem>
                  )}
                  {activeStay && can('residents.write') && (
                    <>
                      <MenuItem onSelect={() => setDialog('rent')}>
                        <TrendingUp /> Change rent
                      </MenuItem>
                      <MenuItem onSelect={() => setDialog('transfer')}>
                        <ArrowRightLeft /> Move to another bed
                      </MenuItem>
                    </>
                  )}
                  {can('residents.write') &&
                    (r.has_app_account ? (
                      <>
                        <MenuItem onSelect={() => setAppMode('reset')}>
                          <KeyRound /> Reset app password
                        </MenuItem>
                        <MenuItem onSelect={() => setAppMode('revoke')}>
                          <Smartphone /> Remove app access
                        </MenuItem>
                      </>
                    ) : (
                      r.status !== 'archived' && (
                        <MenuItem onSelect={() => setAppMode('create')}>
                          <Smartphone /> Give app login
                        </MenuItem>
                      )
                    ))}
                  {can('residents.write') && (
                    <>
                      <MenuSeparator />
                      {activeStay ? (
                        <MenuItem destructive onSelect={() => setDialog('moveout')}>
                          <LogOut /> Move out
                        </MenuItem>
                      ) : r.status === 'archived' ? (
                        <MenuItem onSelect={() => archive.mutate(false, { onSuccess: () => toast.success('Resident restored') })}>
                          <RotateCcw /> Restore
                        </MenuItem>
                      ) : (
                        <MenuItem destructive onSelect={() => setDialog('archive')}>
                          <Archive /> Archive
                        </MenuItem>
                      )}
                    </>
                  )}
                </MenuContent>
              </Menu>
            )}
          </>
        }
      />

      {r.finance_visible && r.balance && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Outstanding" tone={r.balance.overdue_paise ? 'danger' : 'default'} value={<Money paise={r.balance.outstanding_paise} />} footer={r.balance.overdue_paise ? `${formatINR(r.balance.overdue_paise)} overdue` : 'Nothing overdue'} />
          <StatCard label="Monthly rent" value={agreement ? <Money paise={agreement.monthly_rent_paise} /> : '—'} footer={agreement ? `Due on day ${agreement.billing_day} · since ${formatDate(agreement.effective_from)}` : 'No active stay'} />
          <StatCard label="Deposit held" icon={Wallet} value={<Money paise={held} />} footer={depositDue > 0 ? <span className="text-warning-700">{formatINR(depositDue)} still to collect</span> : deposit?.agreed_paise ? `Agreed ${formatINR(deposit.agreed_paise)}` : 'No deposit agreed'} />
          <StatCard label="Total paid" tone="success" value={<Money paise={r.balance.paid_paise} />} footer={r.balance.credit_paise > 0 ? `${formatINR(r.balance.credit_paise)} advance credit` : `of ${formatINR(r.balance.invoiced_paise)} billed`} />
        </div>
      )}

      <Tabs defaultValue={r.finance_visible ? 'ledger' : 'profile'}>
        <TabsList className="mb-4">
          {r.finance_visible && <TabsTrigger value="ledger">Ledger</TabsTrigger>}
          {r.finance_visible && <TabsTrigger value="deposits">Deposit</TabsTrigger>}
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="stays">Stay history</TabsTrigger>
        </TabsList>

        {r.finance_visible && (
          <TabsContent value="ledger">
            <Ledger resident={r} />
          </TabsContent>
        )}

        {r.finance_visible && deposit && (
          <TabsContent value="deposits">
            <Card>
              <CardHeader
                title="Security deposit"
                description={`Agreed ${formatINR(deposit.agreed_paise)} · Held ${formatINR(held)}`}
                action={
                  can('finance.write') && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => { setDepositKind('collected'); setDialog('deposit'); }}>
                        Collect
                      </Button>
                      <Button size="sm" variant="secondary" disabled={held <= 0} onClick={() => { setDepositKind('refunded'); setDialog('deposit'); }}>
                        Refund / deduct
                      </Button>
                    </>
                  )
                }
              />
              {deposit.transactions.length === 0 ? (
                <EmptyState compact icon={Wallet} title="No deposit transactions" />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Type</TH>
                      <TH>Method</TH>
                      <TH>Notes</TH>
                      <TH align="right">Amount</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {deposit.transactions.map((t) => (
                      <TR key={t.id}>
                        <TD>{formatDate(t.txn_date)}</TD>
                        <TD>
                          <Badge tone={t.kind === 'collected' ? 'success' : t.kind === 'refunded' ? 'info' : 'warning'}>{DEPOSIT_KIND_LABELS[t.kind]}</Badge>
                        </TD>
                        <TD>{t.method ? PAYMENT_METHOD_LABELS[t.method] : '—'}</TD>
                        <TD className="max-w-xs truncate">{t.notes ?? t.reference ?? '—'}</TD>
                        <TD numeric className={t.kind === 'collected' ? 'text-success-700' : 'text-gray-900'}>
                          {t.kind === 'collected' ? '+' : '−'}
                          {formatINR(t.amount_paise)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        )}

        <TabsContent value="profile">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Contact" />
              <CardBody>
                <dl className="grid grid-cols-2 gap-4">
                  <KeyValue label="Phone">
                    {r.phone ? (
                      <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-accent-700 hover:underline">
                        <Phone className="size-3" /> {r.phone}
                      </a>
                    ) : null}
                  </KeyValue>
                  <KeyValue label="Email">
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-accent-700 hover:underline">
                        <Mail className="size-3" /> {r.email}
                      </a>
                    ) : null}
                  </KeyValue>
                  <KeyValue label="Occupation">{r.occupation}</KeyValue>
                  <KeyValue label="Company / college">{r.organization}</KeyValue>
                  <KeyValue label="Date of birth">{r.date_of_birth ? formatDate(r.date_of_birth) : null}</KeyValue>
                  <KeyValue label="Gender">{r.gender ? r.gender[0]!.toUpperCase() + r.gender.slice(1) : null}</KeyValue>
                  <KeyValue label="PG Sathi app">
                    {r.has_app_account ? (
                      <span className="inline-flex items-center gap-1.5 text-success-700">
                        <Smartphone className="size-3.5" /> Has app login{r.email ? ` (${r.email})` : ''}
                      </span>
                    ) : can('residents.write') && r.status !== 'archived' ? (
                      <Button variant="link" size="sm" className="h-auto p-0 text-[13px]" onClick={() => setAppMode('create')}>
                        Give app login
                      </Button>
                    ) : (
                      'No app login'
                    )}
                  </KeyValue>
                </dl>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Emergency & identity" />
              <CardBody>
                <dl className="grid grid-cols-2 gap-4">
                  <KeyValue label="Emergency contact">{r.emergency_contact_name}</KeyValue>
                  <KeyValue label="Relation">{r.emergency_contact_relation}</KeyValue>
                  <KeyValue label="Emergency phone">{r.emergency_contact_phone}</KeyValue>
                  <KeyValue label="ID proof">{r.id_proof_type ? `${r.id_proof_type}${r.id_proof_number ? ` · ${r.id_proof_number}` : ''}` : null}</KeyValue>
                  <KeyValue label="Permanent address" className="col-span-2">
                    {r.permanent_address}
                  </KeyValue>
                  {r.notes && (
                    <KeyValue label="Notes" className="col-span-2">
                      <span className="whitespace-pre-line font-normal">{r.notes}</span>
                    </KeyValue>
                  )}
                </dl>
                <p className="mt-5 rounded-md bg-gray-25 p-3 text-xs text-gray-500 ring-1 ring-gray-100">
                  Document uploads (ID proof, agreements) need Supabase Storage and will be available in a later release.
                </p>
              </CardBody>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stays">
          <Card>
            {r.stays.length === 0 ? (
              <EmptyState
                compact
                icon={BedDouble}
                title="No stays yet"
                description="Assign a bed to start this resident’s first stay."
                action={can('residents.write') && r.status !== 'archived' ? <Button size="sm" onClick={() => setDialog('assign')}>Assign bed</Button> : undefined}
              />
            ) : (
              <ul className="divide-y divide-gray-100">
                {r.stays.map((s) => (
                  <li key={s.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-gray-900">
                        {s.property_name} · Room {s.room_name} / Bed {s.bed_label}
                      </p>
                      <Badge tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status === 'active' ? 'Current' : 'Ended'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDate(s.move_in_date)} → {s.move_out_date ? formatDate(s.move_out_date) : s.expected_move_out_date ? `expected ${formatDate(s.expected_move_out_date)}` : 'present'}
                    </p>
                    {s.agreements.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {s.agreements.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center gap-x-3 text-xs text-gray-600">
                            <span className="tabular font-medium text-gray-900">{formatINR(a.monthly_rent_paise)}/mo</span>
                            <span>
                              from {formatDate(a.effective_from)}
                              {a.effective_to ? ` until ${formatDate(a.effective_to)}` : ''}
                            </span>
                            <span>deposit {formatINR(a.deposit_paise)}</span>
                            {a.note && <span className="text-gray-400">· {a.note}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <ResidentFormDialog open={dialog === 'edit'} onOpenChange={(o) => !o && setDialog(null)} resident={r} />
      <AssignBedDialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)} residentId={r.id} />
      {activeStay && <AssignBedDialog open={dialog === 'transfer'} onOpenChange={(o) => !o && setDialog(null)} residentId={r.id} transferStay={activeStay} />}
      {activeStay && <MoveOutDialog open={dialog === 'moveout'} onOpenChange={(o) => !o && setDialog(null)} stay={activeStay} resident={r} />}
      {activeStay && <ChangeRentDialog open={dialog === 'rent'} onOpenChange={(o) => !o && setDialog(null)} stay={activeStay} />}
      {appMode && <ResidentAppLoginDialog open onOpenChange={(o) => !o && setAppMode(null)} resident={r} mode={appMode} />}
      <DepositDialog open={dialog === 'deposit'} onOpenChange={(o) => !o && setDialog(null)} residentId={r.id} residentName={r.full_name} heldPaise={held} duePaise={depositDue} initialKind={depositKind} />
      <ConfirmDialog
        open={dialog === 'archive'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Archive ${r.full_name}?`}
        description="Archived residents are hidden from current lists and don’t count towards your plan limit. All history is kept."
        confirmLabel="Archive"
        destructive
        onConfirm={() => archive.mutateAsync(true).then(() => toast.success('Resident archived'))}
      />
    </div>
  );
}

/** Chronological ledger of bills (debits) and payments (credits) with a running balance. */
function Ledger({ resident }: { resident: ResidentDetail }) {
  const rows = useMemo(() => {
    const entries = [
      ...resident.invoices
        .filter((i) => i.status === 'issued')
        .map((i) => ({
          id: i.id,
          date: i.issue_date,
          sort: `${i.issue_date}-0`,
          kind: 'invoice' as const,
          label: i.period_start ? `Rent · ${formatMonth(i.period_start)}` : `Bill ${i.invoice_number}`,
          sub: `${i.invoice_number} · due ${formatDate(i.due_date)}`,
          debit: i.total_paise,
          credit: 0,
          status: i.payment_status,
          href: `/app/rent/${i.id}`,
        })),
      ...resident.payments
        .filter((p) => p.status === 'recorded' || p.status === 'succeeded')
        .map((p) => ({
          id: p.id,
          date: p.paid_on,
          sort: `${p.paid_on}-1`,
          kind: 'payment' as const,
          label: `Payment · ${PAYMENT_METHOD_LABELS[p.method]}`,
          sub: `${p.receipt_number}${p.reference ? ` · ${p.reference}` : ''}`,
          debit: 0,
          credit: p.amount_paise,
          status: p.status,
          href: `/app/payments/${p.id}`,
        })),
    ].sort((a, b) => a.sort.localeCompare(b.sort));
    let balance = 0;
    return entries.map((e) => {
      balance += e.debit - e.credit;
      return { ...e, balance };
    }).reverse();
  }, [resident]);

  const voided = resident.payments.filter((p) => p.status === 'voided');

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState compact icon={CreditCard} title="No bills or payments yet" description="Generate monthly rent or create a bill to start the ledger." />
      </Card>
    );
  }
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Entry</TH>
            <TH>Status</TH>
            <TH align="right">Billed</TH>
            <TH align="right">Paid</TH>
            <TH align="right">Balance</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((e) => (
            <TR key={`${e.kind}-${e.id}`} className="hover:bg-gray-25">
              <TD className="whitespace-nowrap">{formatDate(e.date)}</TD>
              <TD>
                <Link to={e.href} className="font-medium text-gray-900 hover:underline">
                  {e.label}
                </Link>
                <span className="block text-xs text-gray-500">{e.sub}</span>
              </TD>
              <TD>{e.kind === 'invoice' ? <InvoiceStatusBadge status={e.status as never} /> : <PaymentStatusBadge status={e.status as never} />}</TD>
              <TD numeric>{e.debit ? formatINR(e.debit) : ''}</TD>
              <TD numeric className="text-success-700">{e.credit ? formatINR(e.credit) : ''}</TD>
              <TD numeric className={e.balance > 0 ? 'font-medium text-gray-900' : 'text-success-700'}>
                {e.balance < 0 ? `${formatINR(-e.balance)} cr` : formatINR(e.balance)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {voided.length > 0 && (
        <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
          {voided.length} voided {voided.length === 1 ? 'payment is' : 'payments are'} excluded from the balance.
        </p>
      )}
    </Card>
  );
}
