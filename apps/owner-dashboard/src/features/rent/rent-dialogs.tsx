import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { CalendarCheck, Plus, Trash2 } from 'lucide-react';
import { useBackend, useChargeTemplates, useDashboard, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import { INVOICE_ITEM_KIND_LABELS, addDaysISO, formatINR, formatMonth, paiseToRupeesInput, rupeesToPaise, startOfMonthISO, todayISO, type InvoiceItemKind } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Input, MoneyInput, Select, Textarea } from '@pg/ui-web/ui/form-controls';
import { Dialog, DialogContent } from '@pg/ui-web/ui/overlays';
import { Field, InlineError } from '@pg/ui-web/common';
import { MonthInput, PropertySelect, ResidentPicker } from '@/components/pickers';
import { useCurrentWorkspace } from '@/app/workspace';

export function GenerateRentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { tenantId, propertyId: selected } = useCurrentWorkspace();
  const { data } = useBackend();
  const [month, setMonth] = useState(startOfMonthISO(todayISO()));
  const [propertyId, setPropertyId] = useState<string | null>(selected);
  const dash = useDashboard(open ? tenantId : null, propertyId, month);
  const pending = dash.data?.finance?.stays_without_invoice ?? 0;
  const mutation = useTenantMutation(tenantId, () => data.generateRentInvoices(tenantId, month, propertyId));

  useEffect(() => {
    if (open) {
      setMonth(startOfMonthISO(todayISO()));
      setPropertyId(selected);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Generate monthly rent"
        description="Creates one rent bill per staying resident using their agreed rent, plus any automatic charges. Residents already billed for the month are skipped, so it’s safe to run again."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              disabled={pending === 0}
              onClick={() =>
                mutation.mutate(undefined, {
                  onSuccess: (r) => {
                    toast.success(r.created ? `Created ${r.created} rent bills for ${formatMonth(r.month)}` : 'Everyone is already billed for this month', {
                      description: r.created ? `Total ${formatINR(r.total_paise)}${r.skipped ? ` · ${r.skipped} skipped` : ''}` : undefined,
                    });
                    onOpenChange(false);
                  },
                })
              }
            >
              <CalendarCheck /> Generate {pending > 0 ? `${pending} bills` : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Month" htmlFor="gr-month">
              <MonthInput value={month} onChange={setMonth} className="w-full" />
            </Field>
            <Field label="Property" htmlFor="gr-prop">
              <PropertySelect id="gr-prop" tenantId={tenantId} value={propertyId} onChange={setPropertyId} />
            </Field>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-25 p-3 text-[13px] text-gray-600">
            {dash.isPending ? (
              'Checking…'
            ) : pending > 0 ? (
              <>
                <span className="font-semibold text-gray-900">{pending}</span> staying {pending === 1 ? 'resident has' : 'residents have'} no rent bill for {formatMonth(month)} yet.
              </>
            ) : (
              <>Everyone staying in {formatMonth(month)} already has a rent bill.</>
            )}
          </div>
          <InlineError error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Line {
  key: number;
  kind: InvoiceItemKind;
  description: string;
  amount: string;
}

export function CreateInvoiceDialog({ open, onOpenChange, residentId: preset }: { open: boolean; onOpenChange: (o: boolean) => void; residentId?: string }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const navigate = useNavigate();
  const workspace = useWorkspace(tenantId);
  const charges = useChargeTemplates(tenantId);
  const dueDays = workspace.data?.settings.payment_due_days ?? 5;
  const [residentId, setResidentId] = useState(preset ?? '');
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), dueDays));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: 1, kind: 'charge', description: '', amount: '' }]);

  useEffect(() => {
    if (open) {
      setResidentId(preset ?? '');
      setIssueDate(todayISO());
      setDueDate(addDaysISO(todayISO(), dueDays));
      setNotes('');
      setLines([{ key: Date.now(), kind: 'charge', description: '', amount: '' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = lines.reduce((n, l) => {
    const p = rupeesToPaise(l.amount) ?? 0;
    return n + (l.kind === 'discount' ? -Math.abs(p) : p);
  }, 0);

  const mutation = useTenantMutation(tenantId, () => {
    if (!residentId) throw Object.assign(new Error('Choose a resident'), { hint: 'validation', message: 'Choose a resident' });
    for (const l of lines) {
      if (!l.description.trim() || rupeesToPaise(l.amount) === null) {
        throw Object.assign(new Error('Each line needs a description and amount'), { hint: 'validation', message: 'Each line needs a description and amount' });
      }
    }
    return data.createInvoice({
      residentId,
      kind: 'other',
      issue_date: issueDate,
      due_date: dueDate,
      notes: notes.trim() || null,
      items: lines.map((l) => ({
        kind: l.kind,
        description: l.description.trim(),
        amount_paise: l.kind === 'discount' ? -Math.abs(rupeesToPaise(l.amount)!) : rupeesToPaise(l.amount)!,
      })),
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title="New bill"
        description="For one-off charges, adjustments or a manual rent bill. Monthly rent for everyone is quicker with “Generate rent”."
        footer={
          <>
            <span className="mr-auto text-[13px] text-gray-600">
              Total <span className="tabular font-semibold text-gray-900">{formatINR(total)}</span>
            </span>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              onClick={() =>
                mutation.mutate(undefined, {
                  onSuccess: (id) => {
                    toast.success('Bill created');
                    onOpenChange(false);
                    navigate(`/app/rent/${id}`);
                  },
                })
              }
            >
              Create bill
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Resident" required htmlFor="ci-res">
            <ResidentPicker id="ci-res" tenantId={tenantId} value={residentId} status="all" onChange={(id) => setResidentId(id)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issue date" htmlFor="ci-issue">
              <Input id="ci-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
            <Field label="Due date" htmlFor="ci-due">
              <Input id="ci-due" type="date" min={issueDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-gray-700">Line items</p>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-[120px_1fr_130px_32px] items-center gap-2">
                  <Select aria-label="Type" value={l.kind} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, kind: e.target.value as InvoiceItemKind } : x)))} className="h-8 text-[13px]">
                    {(['rent', 'charge', 'discount', 'adjustment', 'other'] as const).map((k) => (
                      <option key={k} value={k}>
                        {INVOICE_ITEM_KIND_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                  <Input aria-label="Description" value={l.description} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, description: e.target.value } : x)))} className="h-8" placeholder="Description" />
                  <MoneyInput aria-label="Amount" value={l.amount} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, amount: e.target.value } : x)))} className="h-8" />
                  <Button variant="ghost" size="icon-sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { key: Date.now(), kind: 'charge', description: '', amount: '' }])}>
                <Plus /> Add line
              </Button>
              {(charges.data ?? [])
                .filter((c) => c.is_active)
                .slice(0, 4)
                .map((c) => (
                  <Button
                    key={c.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((ls) => [...ls.filter((x) => x.description || x.amount), { key: Date.now(), kind: 'charge', description: c.name, amount: paiseToRupeesInput(c.amount_paise) }])}
                  >
                    + {c.name} ({formatINR(c.amount_paise)})
                  </Button>
                ))}
            </div>
          </div>
          <Field label="Notes" htmlFor="ci-notes">
            <Textarea id="ci-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <InlineError error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
