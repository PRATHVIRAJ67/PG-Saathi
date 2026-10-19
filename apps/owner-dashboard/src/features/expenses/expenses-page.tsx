import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal, Paperclip, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { useBackend, useExpenses, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, endOfMonthISO, formatDate, formatINR, formatMonth, startOfMonthISO, todayISO, type Expense } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Select } from '@pg/ui-web/ui/form-controls';
import { Card, CardBody, CardHeader } from '@pg/ui-web/ui/surfaces';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@pg/ui-web/ui/overlays';
import { Table, TBody, TD, TH, THead, TR } from '@pg/ui-web/ui/table';
import { ConfirmDialog, EmptyState, ErrorState, Money, PageHeader, Pagination, SearchInput, StatCard, TableSkeleton } from '@pg/ui-web/common';
import { ShareBars } from '@pg/ui-web/charts';
import { MonthInput } from '@/components/pickers';
import { useDialogs } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';
import { ExpenseDialog } from './expense-dialog';

const PAGE = 50;

export function ExpensesPage() {
  const { tenantId, propertyId, can } = useCurrentWorkspace();
  const { data, storage } = useBackend();
  const open = useDialogs((s) => s.open);
  const workspace = useWorkspace(tenantId);
  const [month, setMonth] = useState(startOfMonthISO(todayISO()));
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const expenses = useExpenses(tenantId, { from: month, to: endOfMonthISO(month), category: category || null, property_id: propertyId, search: deferred.trim() || undefined, limit: PAGE, offset });
  const remove = useTenantMutation(tenantId, (id: string) => data.deleteExpense(id));

  const openReceipt = async (path: string) => {
    try {
      window.open(await storage.signedUrl('tenant-documents', path), '_blank', 'noopener');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open receipt');
    }
  };

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Running costs by property and category."
        actions={
          <>
            <MonthInput value={month} onChange={(m) => { setMonth(m); setOffset(0); }} />
            {can('finance.write') && (
              <Button onClick={() => open({ kind: 'add-expense' })}>
                <Plus /> Add expense
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <Select value={category} onChange={(e) => { setCategory(e.target.value); setOffset(0); }} aria-label="Category" className="sm:w-52">
                <option value="">All categories</option>
                {[...new Set([...(workspace.data?.settings.expense_categories ?? []), ...(expenses.data?.by_category.map((c) => c.category) ?? [])])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <SearchInput value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search payee or notes" />
            </div>
            {expenses.isError ? (
              <ErrorState error={expenses.error} onRetry={() => void expenses.refetch()} />
            ) : expenses.isPending ? (
              <TableSkeleton />
            ) : expenses.data.rows.length === 0 ? (
              <EmptyState icon={Receipt} title={`No expenses in ${formatMonth(month)}`} description="Track electricity, groceries, salaries and other costs to see your real profit." action={can('finance.write') ? <Button variant="secondary" onClick={() => open({ kind: 'add-expense' })}>Add expense</Button> : undefined} />
            ) : (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Category</TH>
                      <TH>Paid to</TH>
                      <TH>Property</TH>
                      <TH align="right">Amount</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {expenses.data.rows.map((e) => (
                      <TR key={e.id} className="hover:bg-gray-25">
                        <TD className="whitespace-nowrap">{formatDate(e.expense_date)}</TD>
                        <TD className="font-medium text-gray-900">{e.category}</TD>
                        <TD>
                          {e.payee ?? '—'}
                          {e.method && <span className="block text-xs text-gray-500">{PAYMENT_METHOD_LABELS[e.method]}</span>}
                        </TD>
                        <TD className="text-gray-500">{e.property_name ?? 'Business-wide'}</TD>
                        <TD numeric className="font-medium text-gray-900">{formatINR(e.amount_paise)}</TD>
                        <TD className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {e.receipt_path && storage.available && (
                              <Button variant="ghost" size="icon-sm" aria-label="Open receipt" onClick={() => void openReceipt(e.receipt_path!)}>
                                <Paperclip />
                              </Button>
                            )}
                            {can('finance.write') && (
                              <Menu>
                                <MenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" aria-label="Expense actions">
                                    <MoreHorizontal />
                                  </Button>
                                </MenuTrigger>
                                <MenuContent>
                                  <MenuItem onSelect={() => setEditing(e)}>
                                    <Pencil /> Edit
                                  </MenuItem>
                                  {can('expenses.delete') && (
                                    <MenuItem destructive onSelect={() => setDeleting(e)}>
                                      <Trash2 /> Delete
                                    </MenuItem>
                                  )}
                                </MenuContent>
                              </Menu>
                            )}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pagination total={expenses.data.total} limit={PAGE} offset={offset} onChange={setOffset} />
              </>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <StatCard label={`Total · ${formatMonth(month)}`} tone="warning" loading={!expenses.data} value={<Money paise={expenses.data?.totals.amount_paise} />} footer={expenses.data ? `${expenses.data.total} entries` : null} />
          <Card>
            <CardHeader title="By category" />
            <CardBody>
              {expenses.data && expenses.data.by_category.length > 0 ? (
                <ShareBars rows={expenses.data.by_category.map((c) => ({ label: c.category, value: c.amount_paise }))} />
              ) : (
                <p className="text-[13px] text-gray-500">Nothing recorded yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
      <ExpenseDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} expense={editing ?? undefined} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this expense?"
        description={deleting ? `${deleting.category} · ${formatINR(deleting.amount_paise)} on ${formatDate(deleting.expense_date)}. A copy is kept in the activity log.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutateAsync(deleting!.id).then(() => toast.success('Expense deleted'))}
      />
    </div>
  );
}
