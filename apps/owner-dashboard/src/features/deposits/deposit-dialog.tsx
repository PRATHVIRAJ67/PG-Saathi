import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { newIdempotencyKey } from '@pg/api-client';
import { useBackend, useTenantMutation } from '@pg/api-client/react';
import { DEPOSIT_KIND_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, formatINR, paiseToRupeesInput, rupeesToPaise, todayISO, type DepositTxnKind, type PaymentMethod } from '@pg/shared';
import { blankToNull, depositSchema, type DepositValues } from '@pg/validation';
import { Button } from '@pg/ui-web/ui/button';
import { Input, MoneyInput, Select, Textarea } from '@pg/ui-web/ui/form-controls';
import { Dialog, DialogContent, Segmented } from '@pg/ui-web/ui/overlays';
import { Field, InlineError } from '@pg/ui-web/common';
import { useCurrentWorkspace } from '@/app/workspace';
import { useZodForm } from '@/lib/form';

export function DepositDialog({
  open,
  onOpenChange,
  residentId,
  residentName,
  heldPaise,
  duePaise,
  initialKind = 'collected',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  residentId: string;
  residentName: string;
  heldPaise: number;
  duePaise: number;
  initialKind?: DepositTxnKind;
}) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const [key, setKey] = useState(newIdempotencyKey);
  const form = useZodForm(depositSchema, { defaultValues: { kind: initialKind, amount: '', txn_date: todayISO(), method: 'upi', reference: '', notes: '' } });
  const { register, handleSubmit, formState, reset, watch, setValue } = form;
  const kind = watch('kind') as DepositTxnKind;

  useEffect(() => {
    if (open) {
      setKey(newIdempotencyKey());
      reset({
        kind: initialKind,
        amount: initialKind === 'collected' && duePaise > 0 ? paiseToRupeesInput(duePaise) : initialKind !== 'collected' && heldPaise > 0 ? paiseToRupeesInput(heldPaise) : '',
        txn_date: todayISO(),
        method: 'upi',
        reference: '',
        notes: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useTenantMutation(tenantId, (v: DepositValues) =>
    data.recordDeposit({
      residentId,
      kind: v.kind,
      amount_paise: rupeesToPaise(v.amount)!,
      txn_date: v.txn_date,
      method: (blankToNull(v.method) as PaymentMethod | null) ?? null,
      reference: blankToNull(v.reference),
      notes: blankToNull(v.notes),
      idempotency_key: key,
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Deposit — ${residentName}`}
        description={`Currently held: ${formatINR(heldPaise)}${duePaise > 0 ? ` · Still to collect: ${formatINR(duePaise)}` : ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant={kind === 'collected' ? 'primary' : 'danger'}
              loading={mutation.isPending}
              onClick={handleSubmit((v) =>
                mutation.mutate(v as DepositValues, {
                  onSuccess: () => {
                    toast.success(`Deposit ${DEPOSIT_KIND_LABELS[v.kind as DepositTxnKind].toLowerCase()}`);
                    onOpenChange(false);
                  },
                }),
              )}
            >
              Record {DEPOSIT_KIND_LABELS[kind].toLowerCase()}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Segmented
            label="Transaction type"
            value={kind}
            onChange={(v) => setValue('kind', v)}
            options={[
              { value: 'collected', label: 'Collect' },
              { value: 'refunded', label: 'Refund' },
              { value: 'deducted', label: 'Deduct' },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" required htmlFor="dp-amt" error={formState.errors.amount?.message} hint={kind !== 'collected' ? `Up to ${formatINR(heldPaise)}` : undefined}>
              <MoneyInput id="dp-amt" autoFocus {...register('amount')} />
            </Field>
            <Field label="Date" required htmlFor="dp-date">
              <Input id="dp-date" type="date" {...register('txn_date')} />
            </Field>
            {kind !== 'deducted' && (
              <Field label="Method" htmlFor="dp-method">
                <Select id="dp-method" {...register('method')}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {kind !== 'deducted' && (
              <Field label="Reference" htmlFor="dp-ref">
                <Input id="dp-ref" {...register('reference')} />
              </Field>
            )}
          </div>
          <Field label={kind === 'deducted' ? 'Reason for deduction' : 'Notes'} required={kind === 'deducted'} htmlFor="dp-notes">
            <Textarea id="dp-notes" rows={2} placeholder={kind === 'deducted' ? 'e.g. Damage to furniture' : undefined} {...register('notes')} />
          </Field>
          <InlineError error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
