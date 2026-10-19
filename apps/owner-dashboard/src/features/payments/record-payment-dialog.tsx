import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AlertTriangle, Info } from 'lucide-react';
import { newIdempotencyKey, type AppError } from '@pg/api-client';
import { useBackend, useResident, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import {
  PAYMENT_METHOD_LABELS,
  formatDate,
  formatINR,
  formatMonth,
  paiseToRupeesInput,
  previewAllocation,
  rupeesToPaise,
  todayISO,
  type PaymentMethod,
} from '@pg/shared';
import { paymentSchema } from '@pg/validation';
import { Button } from '@pg/ui-web/ui/button';
import { Checkbox, Input, MoneyInput, Select, Textarea } from '@pg/ui-web/ui/form-controls';
import { Dialog, DialogContent, Segmented } from '@pg/ui-web/ui/overlays';
import { Field, InlineError, InvoiceStatusBadge } from '@pg/ui-web/common';
import { ResidentPicker } from '@/components/pickers';
import { useCurrentWorkspace } from '@/app/workspace';
import { useZodForm } from '@/lib/form';

export function RecordPaymentDialog({ open, onOpenChange, residentId: initialResident }: { open: boolean; onOpenChange: (o: boolean) => void; residentId?: string }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const navigate = useNavigate();
  const workspace = useWorkspace(tenantId);
  const methods = workspace.data?.settings.payment_methods ?? ['cash', 'upi', 'bank_transfer'];
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [manual, setManual] = useState<Record<string, string>>({});
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const form = useZodForm(paymentSchema, {
    defaultValues: { resident_id: initialResident ?? '', amount: '', paid_on: todayISO(), method: methods[0] ?? 'cash', reference: '', notes: '' },
  });
  const { register, handleSubmit, formState, watch, setValue, reset } = form;
  const residentId = watch('resident_id');
  const amountPaise = rupeesToPaise(watch('amount')) ?? 0;
  const resident = useResident(tenantId, residentId || null);

  useEffect(() => {
    if (open) {
      // A fresh key per dialog session; retries of the same submission reuse it.
      setIdempotencyKey(newIdempotencyKey());
      setMode('auto');
      setManual({});
      setConfirmDuplicate(false);
      reset({ resident_id: initialResident ?? '', amount: '', paid_on: todayISO(), method: methods[0] ?? 'cash', reference: '', notes: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialResident]);

  const openInvoices = useMemo(
    () => (resident.data?.invoices ?? []).filter((i) => i.status === 'issued' && i.balance_paise > 0).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [resident.data],
  );
  const outstanding = openInvoices.reduce((n, i) => n + i.balance_paise, 0);
  const preview = previewAllocation(
    amountPaise,
    openInvoices.map((i) => ({ id: i.id, due_date: i.due_date, balance_paise: i.balance_paise })),
  );
  const manualTotal = Object.values(manual).reduce((n, v) => n + (rupeesToPaise(v) ?? 0), 0);

  const mutation = useTenantMutation(tenantId, data.recordPayment, {
    onSuccess: (paymentId) => {
      toast.success('Payment recorded', {
        description: `${formatINR(amountPaise)} from ${resident.data?.full_name ?? 'resident'}`,
        action: { label: 'View receipt', onClick: () => navigate(`/app/payments/${paymentId}`) },
      });
      onOpenChange(false);
    },
  });
  const error = mutation.error as AppError | null;
  const isDuplicateWarning = error?.code === 'possible_duplicate';

  const onSubmit = handleSubmit((values) => {
    if (mode === 'manual' && manualTotal > (rupeesToPaise(values.amount) ?? 0)) return;
    mutation.mutate({
      residentId: values.resident_id,
      amount_paise: rupeesToPaise(values.amount)!,
      paid_on: values.paid_on,
      method: values.method as PaymentMethod,
      reference: values.reference || null,
      notes: values.notes || null,
      idempotency_key: idempotencyKey,
      allow_duplicate: confirmDuplicate,
      allocations:
        mode === 'manual'
          ? Object.entries(manual)
              .map(([invoice_id, v]) => ({ invoice_id, amount_paise: rupeesToPaise(v) ?? 0 }))
              .filter((a) => a.amount_paise > 0)
          : undefined,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title="Record a payment"
        description="For money already received — cash, UPI or bank transfer. This records it in your books; it does not collect money online."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={mutation.isPending} disabled={isDuplicateWarning && !confirmDuplicate}>
              Record {amountPaise > 0 ? formatINR(amountPaise) : 'payment'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="grid gap-5 md:grid-cols-[1fr_280px]" noValidate>
          <div className="space-y-4">
            <Field label="Resident" required error={formState.errors.resident_id?.message} htmlFor="pay-resident">
              <ResidentPicker
                id="pay-resident"
                tenantId={tenantId}
                status="all"
                value={residentId}
                invalid={!!formState.errors.resident_id}
                onChange={(id) => setValue('resident_id', id, { shouldValidate: true })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount received" required htmlFor="pay-amount" error={formState.errors.amount?.message}>
                <MoneyInput id="pay-amount" autoFocus aria-invalid={!!formState.errors.amount} {...register('amount')} />
              </Field>
              <Field label="Date received" required htmlFor="pay-date" error={formState.errors.paid_on?.message}>
                <Input id="pay-date" type="date" max={todayISO()} aria-invalid={!!formState.errors.paid_on} {...register('paid_on')} />
              </Field>
              <Field label="Method" htmlFor="pay-method">
                <Select id="pay-method" {...register('method')}>
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reference" htmlFor="pay-ref" hint="UTR / transaction ID, if any.">
                <Input id="pay-ref" {...register('reference')} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="pay-notes">
              <Textarea id="pay-notes" rows={2} {...register('notes')} />
            </Field>
            {isDuplicateWarning ? (
              <div className="rounded-lg border border-warning-100 bg-warning-50 p-3 text-[13px] text-warning-700">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4" aria-hidden /> Possible duplicate
                </p>
                <p className="mt-1">{error.message}</p>
                <label className="mt-2 flex items-center gap-2">
                  <Checkbox checked={confirmDuplicate} onCheckedChange={(v) => setConfirmDuplicate(Boolean(v))} />
                  This is a separate payment — record it anyway
                </label>
              </div>
            ) : (
              <InlineError error={error} />
            )}
          </div>

          <aside className="rounded-lg border border-gray-200 bg-gray-25 p-4">
            {!residentId ? (
              <p className="flex gap-2 text-[13px] text-gray-500">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                Choose a resident to see their outstanding bills.
              </p>
            ) : resident.isPending ? (
              <p className="text-[13px] text-gray-500">Loading balance…</p>
            ) : (
              <>
                <p className="text-xs font-medium text-gray-500">Outstanding</p>
                <p className="tabular mt-0.5 text-xl font-semibold text-gray-900">{formatINR(outstanding)}</p>
                {outstanding > 0 && (
                  <Button variant="link" size="sm" onClick={() => setValue('amount', paiseToRupeesInput(outstanding), { shouldValidate: true })}>
                    Fill full amount
                  </Button>
                )}
                {openInvoices.length > 0 && (
                  <>
                    <Segmented
                      className="mt-3 w-full"
                      label="Allocation"
                      value={mode}
                      onChange={setMode}
                      options={[
                        { value: 'auto', label: 'Oldest first' },
                        { value: 'manual', label: 'Choose bills' },
                      ]}
                    />
                    <ul className="mt-3 space-y-2">
                      {openInvoices.map((inv) => {
                        const applied = preview.allocations.find((a) => a.invoice_id === inv.id)?.amount_paise ?? 0;
                        return (
                          <li key={inv.id} className="rounded-md border border-gray-200 bg-white p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[13px] font-medium text-gray-900">{inv.period_start ? formatMonth(inv.period_start) : inv.invoice_number}</span>
                              <InvoiceStatusBadge status={inv.payment_status} />
                            </div>
                            <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                              <span>Due {formatDate(inv.due_date)}</span>
                              <span className="tabular">{formatINR(inv.balance_paise)}</span>
                            </div>
                            {mode === 'auto' ? (
                              applied > 0 && <p className="tabular mt-1 text-xs font-medium text-success-700">Applies {formatINR(applied)}</p>
                            ) : (
                              <MoneyInput
                                aria-label={`Amount for ${inv.invoice_number}`}
                                className="mt-2 h-8"
                                value={manual[inv.id] ?? ''}
                                onChange={(e) => setManual((m) => ({ ...m, [inv.id]: e.target.value }))}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {mode === 'auto' && preview.credit_paise > 0 && amountPaise > 0 && (
                  <p className="mt-3 text-xs text-gray-600">
                    <span className="tabular font-medium">{formatINR(preview.credit_paise)}</span> will be kept as advance credit and applied to the next bill.
                  </p>
                )}
                {mode === 'manual' && manualTotal > amountPaise && <p className="mt-3 text-xs text-danger-600">Allocated amounts exceed the payment.</p>}
              </>
            )}
          </aside>
        </form>
      </DialogContent>
    </Dialog>
  );
}
