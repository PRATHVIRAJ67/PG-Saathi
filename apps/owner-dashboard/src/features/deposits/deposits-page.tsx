import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { Wallet } from 'lucide-react';
import { useDeposits } from '@pg/api-client/react';
import { DEPOSIT_KIND_LABELS, formatDate, formatINR, type DepositRow, type DepositTxnKind } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Badge, Card, CardHeader } from '@pg/ui-web/ui/surfaces';
import { Segmented } from '@pg/ui-web/ui/overlays';
import { Table, TBody, TD, TH, THead, TR } from '@pg/ui-web/ui/table';
import { EmptyState, ErrorState, Money, PageHeader, SearchInput, StatCard, TableSkeleton } from '@pg/ui-web/common';
import { useCurrentWorkspace } from '@/app/workspace';
import { DepositDialog } from './deposit-dialog';

export function DepositsPage() {
  const { tenantId, propertyId, can } = useCurrentWorkspace();
  const [filter, setFilter] = useState<'all' | 'held' | 'due'>('all');
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const deposits = useDeposits(tenantId, { filter, search: deferred.trim() || undefined, property_id: propertyId });
  const [active, setActive] = useState<{ row: DepositRow; kind: DepositTxnKind } | null>(null);
  const t = deposits.data?.totals;

  return (
    <div>
      <PageHeader title="Deposits" description="Security deposits collected, held, refunded and deducted — every change is kept in the ledger." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Currently held" icon={Wallet} tone="accent" loading={!t} value={<Money paise={t?.held_paise} />} />
        <StatCard label="Still to collect" tone={t?.due_paise ? 'warning' : 'default'} loading={!t} value={<Money paise={t?.due_paise} />} footer="From current residents" />
        <StatCard label="Refunded / deducted" loading={!t} value={<Money paise={(t?.refunded_paise ?? 0) + (t?.deducted_paise ?? 0)} />} footer={t ? `${formatINR(t.deducted_paise)} deducted` : null} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Segmented label="Filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'held', label: 'Held' }, { value: 'due', label: 'To collect' }]} />
            <SearchInput value={search} onChange={setSearch} placeholder="Search resident" />
          </div>
          {deposits.isError ? (
            <ErrorState error={deposits.error} onRetry={() => void deposits.refetch()} />
          ) : deposits.isPending ? (
            <TableSkeleton />
          ) : deposits.data.rows.length === 0 ? (
            <EmptyState icon={Wallet} title="No deposits here" description="Deposits appear when you agree one while assigning a bed, or record a collection." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Resident</TH>
                  <TH align="right">Agreed</TH>
                  <TH align="right">Collected</TH>
                  <TH align="right">Returned</TH>
                  <TH align="right">Held</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {deposits.data.rows.map((r) => (
                  <TR key={r.resident_id}>
                    <TD>
                      <Link to={`/app/residents/${r.resident_id}`} className="font-medium text-gray-900 hover:underline">
                        {r.full_name}
                      </Link>
                      <span className="block text-xs text-gray-500">
                        {r.property_name ?? '—'}
                        {r.stay_status === 'ended' && ' · moved out'}
                      </span>
                    </TD>
                    <TD numeric>{formatINR(r.agreed_paise)}</TD>
                    <TD numeric>
                      {formatINR(r.collected_paise)}
                      {r.due_paise > 0 && r.stay_status === 'active' && <span className="block text-xs text-warning-700">{formatINR(r.due_paise)} due</span>}
                    </TD>
                    <TD numeric className="text-gray-500">{formatINR(r.refunded_paise + r.deducted_paise)}</TD>
                    <TD numeric className="font-semibold text-gray-900">{formatINR(r.held_paise)}</TD>
                    <TD className="text-right">
                      {can('finance.write') && (
                        <div className="flex justify-end gap-1.5">
                          {r.due_paise > 0 && r.stay_status === 'active' && (
                            <Button size="sm" variant="secondary" onClick={() => setActive({ row: r, kind: 'collected' })}>
                              Collect
                            </Button>
                          )}
                          {r.held_paise > 0 && (
                            <Button size="sm" variant={r.stay_status === 'ended' ? 'primary' : 'ghost'} onClick={() => setActive({ row: r, kind: 'refunded' })}>
                              Settle
                            </Button>
                          )}
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent deposit activity" />
          {(deposits.data?.recent_transactions ?? []).length === 0 ? (
            <EmptyState compact icon={Wallet} title="No activity yet" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {deposits.data!.recent_transactions.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <Link to={`/app/residents/${tx.resident_id}`} className="block truncate font-medium text-gray-900 hover:underline">
                      {tx.full_name}
                    </Link>
                    <span className="text-xs text-gray-500">{formatDate(tx.txn_date)}</span>
                  </div>
                  <Badge tone={tx.kind === 'collected' ? 'success' : tx.kind === 'refunded' ? 'info' : 'warning'}>{DEPOSIT_KIND_LABELS[tx.kind]}</Badge>
                  <span className="tabular w-24 text-right font-medium text-gray-900">{formatINR(tx.amount_paise)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {active && (
        <DepositDialog
          open
          onOpenChange={(o) => !o && setActive(null)}
          residentId={active.row.resident_id}
          residentName={active.row.full_name}
          heldPaise={active.row.held_paise}
          duePaise={active.row.due_paise}
          initialKind={active.kind}
        />
      )}
    </div>
  );
}
