import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import { useBackend, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, paiseToRupeesInput, rupeesToPaise, todayISO, type Expense, type PaymentMethod } from '@pg/shared';
import { blankToNull, expenseSchema, type ExpenseValues } from '@pg/validation';
import { Button } from '@pg/ui-web/ui/button';
import { Input, MoneyInput, Select, Textarea } from '@pg/ui-web/ui/form-controls';
import { Dialog, DialogContent } from '@pg/ui-web/ui/overlays';
import { Field, InlineError } from '@pg/ui-web/common';
import { PropertySelect } from '@/components/pickers';
import { useCurrentWorkspace } from '@/app/workspace';
import { useZodForm } from '@/lib/form';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

export function ExpenseDialog({ open, onOpenChange, expense }: { open: boolean; onOpenChange: (o: boolean) => void; expense?: Expense }) {
  const { tenantId, propertyId } = useCurrentWorkspace();
  const { data, storage } = useBackend();
  const workspace = useWorkspace(tenantId);
  const categories = workspace.data?.settings.expense_categories ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const empty: ExpenseValues = { property_id: propertyId ?? '', category: '', amount: '', expense_date: todayISO(), payee: '', method: 'upi', reference: '', notes: '' };
  const form = useZodForm(expenseSchema, { defaultValues: empty });
  const { register, handleSubmit, formState, reset, setValue, watch } = form;

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setFileError(null);
    reset(
      expense
        ? {
            property_id: expense.property_id ?? '',
            category: expense.category,
            amount: paiseToRupeesInput(expense.amount_paise),
            expense_date: expense.expense_date,
            payee: expense.payee ?? '',
            method: expense.method ?? '',
            reference: expense.reference ?? '',
            notes: expense.notes ?? '',
          }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense]);

  const mutation = useTenantMutation(tenantId, async (v: ExpenseValues) => {
    let receiptPath: string | undefined;
    if (file) {
      receiptPath = await storage.upload('tenant-documents', `${tenantId}/expenses/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`, file, file.type);
    }
    const payload = {
      property_id: v.property_id || null,
      category: v.category.trim(),
      amount_paise: rupeesToPaise(v.amount)!,
      expense_date: v.expense_date,
      payee: blankToNull(v.payee),
      method: (blankToNull(v.method) as PaymentMethod | null) ?? null,
      reference: blankToNull(v.reference),
      notes: blankToNull(v.notes),
      ...(receiptPath ? { receipt_path: receiptPath } : {}),
    };
    return expense ? data.updateExpense(expense.id, payload) : data.createExpense(tenantId, payload);
  });

  const onSubmit = handleSubmit((v) =>
    mutation.mutate(v as ExpenseValues, {
      onSuccess: () => {
        toast.success(expense ? 'Expense updated' : 'Expense added');
        onOpenChange(false);
      },
    }),
  );
  const e = formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={expense ? 'Edit expense' : 'Add an expense'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={mutation.isPending}>
              {expense ? 'Save changes' : 'Add expense'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required htmlFor="ex-cat" error={e.category?.message}>
            <Input id="ex-cat" list="ex-cat-list" autoFocus aria-invalid={!!e.category} {...register('category')} />
            <datalist id="ex-cat-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Amount" required htmlFor="ex-amt" error={e.amount?.message}>
            <MoneyInput id="ex-amt" aria-invalid={!!e.amount} {...register('amount')} />
          </Field>
          {categories.length > 0 && (
            <div className="-mt-2 flex flex-wrap gap-1.5 sm:col-span-2">
              {categories.slice(0, 8).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue('category', c, { shouldValidate: true })}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${watch('category') === c ? 'border-accent-600 bg-accent-50 text-accent-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <Field label="Date" required htmlFor="ex-date" error={e.expense_date?.message}>
            <Input id="ex-date" type="date" {...register('expense_date')} />
          </Field>
          <Field label="Property" htmlFor="ex-prop">
            <PropertySelect id="ex-prop" tenantId={tenantId} value={watch('property_id') || null} onChange={(id) => setValue('property_id', id ?? '')} allLabel="Business-wide" />
          </Field>
          <Field label="Paid to" htmlFor="ex-payee">
            <Input id="ex-payee" {...register('payee')} />
          </Field>
          <Field label="Paid via" htmlFor="ex-method">
            <Select id="ex-method" {...register('method')}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="ex-notes" className="sm:col-span-2">
            <Textarea id="ex-notes" rows={2} {...register('notes')} />
          </Field>
          <div className="sm:col-span-2">
            {storage.available ? (
              <div className="flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept={ALLOWED.join(',')}
                  className="hidden"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0] ?? null;
                    setFileError(null);
                    if (f && !ALLOWED.includes(f.type)) return setFileError('Use a PNG, JPG, WebP or PDF file.');
                    if (f && f.size > 10 * 1024 * 1024) return setFileError('Files must be under 10 MB.');
                    setFile(f);
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Paperclip /> {file ? 'Change receipt' : expense?.receipt_path ? 'Replace receipt' : 'Attach receipt'}
                </Button>
                <span className="truncate text-xs text-gray-500">{file?.name ?? (expense?.receipt_path ? 'Receipt attached' : 'Optional')}</span>
              </div>
            ) : (
              <p className="text-xs text-gray-400">Receipt attachments need Supabase Storage (not available in demo mode).</p>
            )}
            {fileError && <p className="mt-1 text-xs text-danger-600">{fileError}</p>}
          </div>
          <div className="sm:col-span-2">
            <InlineError error={mutation.error} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
