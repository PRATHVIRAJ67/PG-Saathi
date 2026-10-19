import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Check, Copy, History, Plus, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { useAuditLogs, useBackend, useChargeTemplates, useMembers, useMyContext, usePlans, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatINR,
  paiseToRupeesInput,
  rupeesToPaise,
  type ChargeTemplate,
  type TenantRole,
} from '@pg/shared';
import { billingSettingsSchema, blankToNull, chargeTemplateSchema, inviteMemberSchema, workspaceProfileSchema, type BillingSettingsValues, type ChargeTemplateValues, type InviteMemberValues, type WorkspaceProfileValues } from '@pg/validation';
import { Button } from '@pg/ui-web/ui/button';
import { Checkbox, Input, MoneyInput, Select, Switch, Textarea } from '@pg/ui-web/ui/form-controls';
import { Badge, Card, CardBody, CardHeader, Progress, Skeleton, Avatar } from '@pg/ui-web/ui/surfaces';
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@pg/ui-web/ui/overlays';
import { Table, TBody, TD, TH, THead, TR } from '@pg/ui-web/ui/table';
import { ConfirmDialog, EmptyState, ErrorState, Field, FormSection, InlineError, PageHeader } from '@pg/ui-web/common';
import { PropertySelect } from '@/components/pickers';
import { useCurrentWorkspace } from '@/app/workspace';
import { useZodForm } from '@/lib/form';

const TABS = [
  { id: 'business', label: 'Business', owner: true },
  { id: 'billing', label: 'Rent & billing', owner: true },
  { id: 'charges', label: 'Charges', owner: false },
  { id: 'lists', label: 'Categories & facilities', owner: true },
  { id: 'team', label: 'Team', owner: false },
  { id: 'plan', label: 'Plan & usage', owner: false },
  { id: 'activity', label: 'Activity log', owner: false },
  { id: 'profile', label: 'Your profile', owner: false },
] as const;

export function SettingsPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { can } = useCurrentWorkspace();
  const visible = TABS.filter((t) => {
    if (t.owner) return can('workspace.manage');
    if (t.id === 'activity') return can('audit.read');
    return true;
  });
  const current = visible.find((t) => t.id === tab)?.id ?? visible[0]!.id;

  return (
    <div>
      <PageHeader title="Settings" description="Everything here is specific to your business. Changes never rewrite past bills or payments." />
      <Tabs value={current} onValueChange={(v) => navigate(`/app/settings/${v}`, { replace: true })}>
        <TabsList className="mb-6">
          {visible.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="business">{current === 'business' && <BusinessSettings />}</TabsContent>
        <TabsContent value="billing">{current === 'billing' && <BillingSettings />}</TabsContent>
        <TabsContent value="charges">{current === 'charges' && <ChargesSettings />}</TabsContent>
        <TabsContent value="lists">{current === 'lists' && <ListSettings />}</TabsContent>
        <TabsContent value="team">{current === 'team' && <TeamSettings />}</TabsContent>
        <TabsContent value="plan">{current === 'plan' && <PlanSettings />}</TabsContent>
        <TabsContent value="activity">{current === 'activity' && <ActivityLog />}</TabsContent>
        <TabsContent value="profile">{current === 'profile' && <ProfileSettings />}</TabsContent>
      </Tabs>
    </div>
  );
}

function SaveBar({ dirty, saving, onReset }: { dirty: boolean; saving: boolean; onReset: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-25 px-5 py-3 rounded-b-xl">
      {dirty && <span className="mr-auto text-xs text-gray-500">Unsaved changes</span>}
      <Button variant="ghost" disabled={!dirty || saving} onClick={onReset}>
        Discard
      </Button>
      <Button type="submit" loading={saving} disabled={!dirty}>
        Save changes
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
function BusinessSettings() {
  const { tenantId } = useCurrentWorkspace();
  const { data, storage } = useBackend();
  const ws = useWorkspace(tenantId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const form = useZodForm(workspaceProfileSchema);
  const { register, handleSubmit, formState, reset } = form;
  const t = ws.data?.tenant;
  const values = (): WorkspaceProfileValues => ({
    name: t?.name ?? '',
    contact_name: t?.contact_name ?? '',
    contact_phone: t?.contact_phone ?? '',
    contact_email: t?.contact_email ?? '',
    address_line: t?.address_line ?? '',
    city: t?.city ?? '',
    state: t?.state ?? '',
    postal_code: t?.postal_code ?? '',
    gstin: t?.gstin ?? '',
  });
  useEffect(() => {
    if (t) reset(values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  useEffect(() => {
    if (t?.logo_path && storage.available) storage.signedUrl('tenant-assets', t.logo_path, 3600).then(setLogoUrl, () => setLogoUrl(null));
  }, [t?.logo_path, storage]);

  const mutation = useTenantMutation(tenantId, (v: WorkspaceProfileValues) =>
    data.updateWorkspace(tenantId, {
      name: v.name.trim(),
      contact_name: blankToNull(v.contact_name),
      contact_phone: blankToNull(v.contact_phone),
      contact_email: blankToNull(v.contact_email),
      address_line: blankToNull(v.address_line),
      city: blankToNull(v.city),
      state: blankToNull(v.state),
      postal_code: blankToNull(v.postal_code),
      gstin: blankToNull(v.gstin)?.toUpperCase() ?? null,
    }),
  );
  const logo = useTenantMutation(tenantId, async (file: File) => {
    const path = await storage.upload('tenant-assets', `${tenantId}/branding/logo-${Date.now()}.${file.name.split('.').pop() ?? 'png'}`, file, file.type);
    await data.updateWorkspace(tenantId, { logo_path: path });
  });

  if (ws.isError) return <ErrorState error={ws.error} />;
  if (!t) return <Skeleton className="h-80 rounded-xl" />;
  const e = formState.errors;

  return (
    <Card>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v as WorkspaceProfileValues, { onSuccess: () => toast.success('Business details saved') }))} noValidate>
        <CardBody>
          <FormSection title="Business profile" description="Shown on receipts and bills.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name" required htmlFor="bs-name" error={e.name?.message} className="sm:col-span-2">
                <Input id="bs-name" {...register('name')} />
              </Field>
              <Field label="Contact person" htmlFor="bs-cn">
                <Input id="bs-cn" {...register('contact_name')} />
              </Field>
              <Field label="Phone" htmlFor="bs-phone" error={e.contact_phone?.message}>
                <Input id="bs-phone" type="tel" {...register('contact_phone')} />
              </Field>
              <Field label="Email" htmlFor="bs-email" error={e.contact_email?.message}>
                <Input id="bs-email" type="email" {...register('contact_email')} />
              </Field>
              <Field label="GSTIN" htmlFor="bs-gst" error={e.gstin?.message} hint="Optional">
                <Input id="bs-gst" className="uppercase" {...register('gstin')} />
              </Field>
            </div>
          </FormSection>
          <FormSection title="Address">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Address" htmlFor="bs-addr" className="sm:col-span-2">
                <Input id="bs-addr" {...register('address_line')} />
              </Field>
              <Field label="City" htmlFor="bs-city">
                <Input id="bs-city" {...register('city')} />
              </Field>
              <Field label="State" htmlFor="bs-state">
                <Input id="bs-state" {...register('state')} />
              </Field>
              <Field label="PIN code" htmlFor="bs-pin">
                <Input id="bs-pin" {...register('postal_code')} />
              </Field>
            </div>
          </FormSection>
          <FormSection title="Logo" description="PNG, JPG, WebP or SVG up to 5 MB.">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-25">
                {logoUrl ? <img src={logoUrl} alt="Business logo" className="size-full object-contain" /> : <span className="text-lg font-semibold text-gray-400">{t.name.slice(0, 2).toUpperCase()}</span>}
              </div>
              {storage.available ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0];
                      if (!f) return;
                      if (f.size > 5 * 1024 * 1024) return void toast.error('Logo must be under 5 MB');
                      logo.mutate(f, { onSuccess: () => toast.success('Logo updated'), onError: (err) => toast.error(err.message) });
                    }}
                  />
                  <Button variant="secondary" size="sm" loading={logo.isPending} onClick={() => fileRef.current?.click()}>
                    <Upload /> Upload logo
                  </Button>
                </>
              ) : (
                <p className="text-xs text-gray-500">Logo upload needs Supabase Storage (not available in demo mode).</p>
              )}
            </div>
          </FormSection>
          <InlineError error={mutation.error} />
        </CardBody>
        <SaveBar dirty={formState.isDirty} saving={mutation.isPending} onReset={() => reset(values())} />
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function BillingSettings() {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const ws = useWorkspace(tenantId);
  const s = ws.data?.settings;
  const form = useZodForm(billingSettingsSchema);
  const { register, handleSubmit, formState, reset, watch, setValue } = form;
  const values = (): BillingSettingsValues => ({
    default_rent_mode: s?.default_rent_mode ?? 'per_bed',
    default_billing_day: s?.default_billing_day ?? 1,
    payment_due_days: s?.payment_due_days ?? 5,
    default_deposit: s?.default_deposit_paise ? paiseToRupeesInput(s.default_deposit_paise) : '',
    prorate_first_month: s?.prorate_first_month ?? true,
    invoice_prefix: s?.invoice_prefix ?? 'INV',
    receipt_prefix: s?.receipt_prefix ?? 'RCT',
    payment_methods: s?.payment_methods ?? ['cash'],
    upi_id: s?.upi_id ?? '',
    receipt_footer: s?.receipt_footer ?? '',
  });
  useEffect(() => {
    if (s) reset(values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  const mutation = useTenantMutation(tenantId, (v: BillingSettingsValues) =>
    data.updateSettings(tenantId, {
      default_rent_mode: v.default_rent_mode,
      default_billing_day: v.default_billing_day,
      payment_due_days: v.payment_due_days,
      default_deposit_paise: rupeesToPaise(v.default_deposit ?? '') ?? 0,
      prorate_first_month: v.prorate_first_month,
      invoice_prefix: v.invoice_prefix.toUpperCase(),
      receipt_prefix: v.receipt_prefix.toUpperCase(),
      payment_methods: v.payment_methods as never,
      upi_id: blankToNull(v.upi_id),
      receipt_footer: blankToNull(v.receipt_footer),
    }),
  );
  if (!s) return <Skeleton className="h-80 rounded-xl" />;
  const methods = (watch('payment_methods') ?? []) as string[];
  const e = formState.errors;

  return (
    <Card>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v as BillingSettingsValues, { onSuccess: () => toast.success('Billing settings saved') }))} noValidate>
        <CardBody>
          <FormSection title="Rent defaults" description="Used for new stays and new monthly bills. Existing agreements and bills are not changed.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rent is charged" htmlFor="bl-mode">
                <Select id="bl-mode" {...register('default_rent_mode')}>
                  <option value="per_bed">Per bed</option>
                  <option value="per_room">Per room</option>
                </Select>
              </Field>
              <Field label="Default security deposit" htmlFor="bl-dep" error={e.default_deposit?.message}>
                <MoneyInput id="bl-dep" {...register('default_deposit')} />
              </Field>
              <Field label="Rent billed on day" htmlFor="bl-day" error={e.default_billing_day?.message} hint="1–28">
                <Input id="bl-day" inputMode="numeric" {...register('default_billing_day')} />
              </Field>
              <Field label="Days to pay before overdue" htmlFor="bl-due" error={e.payment_due_days?.message}>
                <Input id="bl-due" inputMode="numeric" {...register('payment_due_days')} />
              </Field>
            </div>
            <label className="flex items-center gap-3">
              <Switch checked={watch('prorate_first_month')} onCheckedChange={(v) => setValue('prorate_first_month', v, { shouldDirty: true })} />
              <span className="text-[13px] text-gray-700">Prorate rent for a partial first month</span>
            </label>
          </FormSection>
          <FormSection title="Payment methods" description="Methods your team can choose when recording a payment.">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {PAYMENT_METHODS.map((m) => (
                <label key={m} className="flex items-center gap-2 text-[13px] text-gray-700">
                  <Checkbox checked={methods.includes(m)} onCheckedChange={(c) => setValue('payment_methods', c ? [...methods, m] : methods.filter((x) => x !== m), { shouldDirty: true, shouldValidate: true })} />
                  {PAYMENT_METHOD_LABELS[m]}
                </label>
              ))}
            </div>
            {e.payment_methods && <p className="text-xs text-danger-600">{e.payment_methods.message}</p>}
            <Field label="UPI ID" htmlFor="bl-upi" hint="Printed on bills so residents know where to pay.">
              <Input id="bl-upi" {...register('upi_id')} />
            </Field>
          </FormSection>
          <FormSection title="Bills & receipts" description="Numbering continues from the current sequence.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bill number prefix" htmlFor="bl-ip" error={e.invoice_prefix?.message} hint={`Next: ${s.invoice_prefix}-${String(s.next_invoice_number).padStart(5, '0')}`}>
                <Input id="bl-ip" className="uppercase" {...register('invoice_prefix')} />
              </Field>
              <Field label="Receipt number prefix" htmlFor="bl-rp" error={e.receipt_prefix?.message} hint={`Next: ${s.receipt_prefix}-${String(s.next_receipt_number).padStart(5, '0')}`}>
                <Input id="bl-rp" className="uppercase" {...register('receipt_prefix')} />
              </Field>
              <Field label="Receipt footer" htmlFor="bl-foot" className="sm:col-span-2">
                <Textarea id="bl-foot" rows={2} placeholder="e.g. Thank you for staying with us." {...register('receipt_footer')} />
              </Field>
            </div>
          </FormSection>
          <FormSection title="Notifications" description="Reminder messages are not sent yet. Automated or scheduled reminders are intentionally out of scope for this release.">
            <p className="text-[13px] text-gray-500">Use the Outstanding report to follow up with residents.</p>
          </FormSection>
          <InlineError error={mutation.error} />
        </CardBody>
        <SaveBar dirty={formState.isDirty} saving={mutation.isPending} onReset={() => reset(values())} />
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function ChargesSettings() {
  const { tenantId, can } = useCurrentWorkspace();
  const { data } = useBackend();
  const charges = useChargeTemplates(tenantId);
  const [editing, setEditing] = useState<ChargeTemplate | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ChargeTemplate | null>(null);
  const remove = useTenantMutation(tenantId, (id: string) => data.deleteChargeTemplate(id));
  const toggle = useTenantMutation(tenantId, (c: ChargeTemplate) => data.saveChargeTemplate(tenantId, c.id, { is_active: !c.is_active }));
  const editable = can('properties.write');

  return (
    <Card>
      <CardHeader
        title="Additional charges"
        description="Reusable charges like laundry or an electricity share. Automatic monthly charges are added when you generate rent."
        action={
          editable && (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus /> Add charge
            </Button>
          )
        }
      />
      {charges.isPending ? (
        <Skeleton className="m-5 h-24" />
      ) : (charges.data ?? []).length === 0 ? (
        <EmptyState compact icon={Plus} title="No charges yet" description="Add charges you bill regularly so they’re one click away." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Charge</TH>
              <TH>Applies to</TH>
              <TH>Frequency</TH>
              <TH align="right">Amount</TH>
              <TH>Active</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {charges.data!.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium text-gray-900">
                  {c.name}
                  {c.apply_by_default && c.frequency === 'monthly' && <Badge tone="accent" className="ml-2">Automatic</Badge>}
                </TD>
                <TD>{c.property_name ?? 'All properties'}</TD>
                <TD>{c.frequency === 'monthly' ? 'Monthly' : 'One-time'}</TD>
                <TD numeric>{formatINR(c.amount_paise)}</TD>
                <TD>
                  <Switch checked={c.is_active} disabled={!editable} onCheckedChange={() => toggle.mutate(c)} aria-label={`${c.name} active`} />
                </TD>
                <TD className="text-right">
                  {editable && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <ChargeDialog charge={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="Existing bills that include this charge are not affected."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutateAsync(deleting!.id).then(() => toast.success('Charge deleted'))}
      />
    </Card>
  );
}

function ChargeDialog({ charge, onClose }: { charge: ChargeTemplate | 'new' | null; onClose: () => void }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const existing = charge && charge !== 'new' ? charge : null;
  const form = useZodForm(chargeTemplateSchema, { defaultValues: { name: '', amount: '', frequency: 'monthly', property_id: '', apply_by_default: false } });
  const { register, handleSubmit, formState, reset, watch, setValue } = form;
  useEffect(() => {
    if (charge)
      reset(
        existing
          ? { name: existing.name, amount: paiseToRupeesInput(existing.amount_paise), frequency: existing.frequency, property_id: existing.property_id ?? '', apply_by_default: existing.apply_by_default }
          : { name: '', amount: '', frequency: 'monthly', property_id: '', apply_by_default: false },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge]);
  const mutation = useTenantMutation(tenantId, (v: ChargeTemplateValues) =>
    data.saveChargeTemplate(tenantId, existing?.id ?? null, {
      name: v.name.trim(),
      amount_paise: rupeesToPaise(v.amount)!,
      frequency: v.frequency,
      apply_by_default: v.apply_by_default,
      ...(existing ? {} : { property_id: v.property_id || null }),
    }),
  );
  return (
    <Dialog open={!!charge} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={existing ? 'Edit charge' : 'Add a charge'}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v as ChargeTemplateValues, { onSuccess: () => { toast.success('Charge saved'); onClose(); } }))}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required htmlFor="ch-name" error={formState.errors.name?.message}>
            <Input id="ch-name" autoFocus {...register('name')} />
          </Field>
          <Field label="Amount" required htmlFor="ch-amt" error={formState.errors.amount?.message}>
            <MoneyInput id="ch-amt" {...register('amount')} />
          </Field>
          <Field label="Frequency" htmlFor="ch-freq">
            <Select id="ch-freq" {...register('frequency')}>
              <option value="monthly">Monthly</option>
              <option value="one_time">One-time</option>
            </Select>
          </Field>
          {!existing && (
            <Field label="Applies to" htmlFor="ch-prop">
              <PropertySelect id="ch-prop" tenantId={tenantId} value={watch('property_id') || null} onChange={(id) => setValue('property_id', id ?? '')} />
            </Field>
          )}
          {watch('frequency') === 'monthly' && (
            <label className="flex items-center gap-3">
              <Switch checked={watch('apply_by_default')} onCheckedChange={(v) => setValue('apply_by_default', v)} />
              <span className="text-[13px] text-gray-700">Add automatically when generating monthly rent</span>
            </label>
          )}
          <InlineError error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function EditableList({ title, description, items, onSave, saving }: { title: string; description: string; items: string[]; onSave: (items: string[]) => void; saving: boolean }) {
  const [list, setList] = useState(items);
  const [draft, setDraft] = useState('');
  useEffect(() => setList(items), [items]);
  const dirty = JSON.stringify(list) !== JSON.stringify(items);
  const add = () => {
    const v = draft.trim();
    if (v && !list.includes(v)) setList([...list, v]);
    setDraft('');
  };
  return (
    <FormSection title={title} description={description}>
      <div className="flex flex-wrap gap-2">
        {list.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white py-0.5 pl-3 pr-1 text-[13px] text-gray-700">
            {item}
            <button type="button" onClick={() => setList(list.filter((x) => x !== item))} className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`Remove ${item}`}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex max-w-sm gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Add an item" aria-label={`Add to ${title}`} className="h-8" />
        <Button variant="secondary" size="sm" onClick={add}>
          Add
        </Button>
      </div>
      {dirty && (
        <div className="flex gap-2">
          <Button size="sm" loading={saving} onClick={() => onSave(list)}>
            <Check /> Save {title.toLowerCase()}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setList(items)}>
            Discard
          </Button>
        </div>
      )}
    </FormSection>
  );
}

function ListSettings() {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const ws = useWorkspace(tenantId);
  const saveCategories = useTenantMutation(tenantId, (items: string[]) => data.updateSettings(tenantId, { expense_categories: items }));
  const saveFacilities = useTenantMutation(tenantId, (items: string[]) => data.updateSettings(tenantId, { facility_options: items }));
  if (!ws.data) return <Skeleton className="h-64 rounded-xl" />;
  return (
    <Card>
      <CardBody>
        <EditableList
          title="Expense categories"
          description="Suggested when adding an expense. You can still type any category."
          items={ws.data.settings.expense_categories}
          saving={saveCategories.isPending}
          onSave={(items) => saveCategories.mutate(items, { onSuccess: () => toast.success('Categories saved'), onError: (e) => toast.error(e.message) })}
        />
        <EditableList
          title="Facilities"
          description="Options offered when describing a property."
          items={ws.data.settings.facility_options}
          saving={saveFacilities.isPending}
          onSave={(items) => saveFacilities.mutate(items, { onSuccess: () => toast.success('Facilities saved'), onError: (e) => toast.error(e.message) })}
        />
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function TeamSettings() {
  const { tenantId, can } = useCurrentWorkspace();
  const { data } = useBackend();
  const team = useMembers(tenantId);
  const ws = useWorkspace(tenantId);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const update = useTenantMutation(tenantId, (v: { id: string; role: TenantRole; status: 'active' | 'suspended' }) => data.updateMember(v.id, v.role, v.status));
  const remove = useTenantMutation(tenantId, (id: string) => data.removeMember(id));
  const revoke = useTenantMutation(tenantId, (id: string) => data.revokeInvitation(id));
  const manage = can('team.manage');
  const limit = ws.data?.plan?.max_staff;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Team members"
          description={limit !== null && limit !== undefined ? `${ws.data?.usage.staff ?? 0} of ${limit} team seats used on your plan` : 'Give each person their own login and role.'}
          action={
            manage && (
              <Button size="sm" onClick={() => setInviting(true)}>
                <UserPlus /> Invite
              </Button>
            )
          }
        />
        {team.isError ? (
          <ErrorState error={team.error} />
        ) : team.isPending ? (
          <Skeleton className="m-5 h-24" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {team.data.members.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <span className="flex items-center gap-3">
                      <Avatar name={m.full_name ?? m.email ?? '?'} />
                      <span>
                        <span className="block font-medium text-gray-900">
                          {m.full_name ?? 'Unnamed'} {m.is_me && <span className="text-xs font-normal text-gray-400">(you)</span>}
                        </span>
                        <span className="block text-xs text-gray-500">{m.email}</span>
                      </span>
                    </span>
                  </TD>
                  <TD>
                    {manage && !m.is_me ? (
                      <Select value={m.role} onChange={(e) => update.mutate({ id: m.id, role: e.target.value as TenantRole, status: m.status }, { onSuccess: () => toast.success('Role updated'), onError: (er) => toast.error(er.message) })} className="h-8 w-44 text-[13px]" aria-label="Role">
                        {(['owner', 'manager', 'accountant', 'staff'] as const).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      ROLE_LABELS[m.role]
                    )}
                  </TD>
                  <TD>
                    <Badge tone={m.status === 'active' ? 'success' : 'warning'}>{m.status === 'active' ? 'Active' : 'Suspended'}</Badge>
                  </TD>
                  <TD>{formatDate(m.created_at)}</TD>
                  <TD className="text-right">
                    {manage && !m.is_me && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: m.id, role: m.role, status: m.status === 'active' ? 'suspended' : 'active' }, { onError: (er) => toast.error(er.message) })}>
                          {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Remove member" onClick={() => setRemoving({ id: m.id, name: m.full_name ?? m.email ?? 'this member' })}>
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {manage && team.data && team.data.invitations.length > 0 && (
        <Card>
          <CardHeader title="Pending invitations" />
          <ul className="divide-y divide-gray-100">
            {team.data.invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-gray-900">{i.email}</span>
                  <span className="text-xs text-gray-500">
                    {i.kind === 'resident' ? 'Resident app' : ROLE_LABELS[i.role!]} · expires {formatDate(i.expires_at)}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(i.id, { onSuccess: () => toast.success('Invitation revoked') })}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="What each role can do" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(ROLE_LABELS) as TenantRole[]).map((r) => (
            <div key={r}>
              <p className="text-[13px] font-medium text-gray-900">{ROLE_LABELS[r]}</p>
              <p className="text-xs text-gray-500">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <InviteMemberDialog open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="They lose access to this workspace immediately. Records they created stay."
        confirmLabel="Remove"
        destructive
        onConfirm={() => remove.mutateAsync(removing!.id).then(() => toast.success('Member removed'))}
      />
    </div>
  );
}

function InviteMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const [link, setLink] = useState<string | null>(null);
  const form = useZodForm(inviteMemberSchema, { defaultValues: { email: '', role: 'manager' } });
  const { register, handleSubmit, formState, reset } = form;
  const mutation = useTenantMutation(tenantId, (v: InviteMemberValues) => data.inviteMember(tenantId, v.email.trim(), v.role));
  useEffect(() => {
    if (open) {
      setLink(null);
      reset({ email: '', role: 'manager' });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="Invite a team member"
        description="They sign up (or sign in) with this email and get access with the chosen role."
        footer={
          link ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button loading={mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v as InviteMemberValues, { onSuccess: (inv) => setLink(`${window.location.origin}/invite/${inv.token}`) }))}>
                Create invite link
              </Button>
            </>
          )
        }
      >
        {link ? (
          <div className="space-y-3">
            <p className="text-[13px] text-gray-600">Send this link to them. It works once and expires in 7 days. Email delivery isn’t automated yet.</p>
            <div className="flex gap-2">
              <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" size="icon" aria-label="Copy link" onClick={() => { void navigator.clipboard.writeText(link); toast.success('Link copied'); }}>
                <Copy />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Email" required htmlFor="im-email" error={formState.errors.email?.message}>
              <Input id="im-email" type="email" autoFocus {...register('email')} />
            </Field>
            <Field label="Role" htmlFor="im-role">
              <Select id="im-role" {...register('role')}>
                {(['manager', 'accountant', 'staff'] as const).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <InlineError error={mutation.error} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null | undefined }) {
  const unlimited = limit === null || limit === undefined;
  const pct = unlimited ? 0 : (used / Math.max(limit, 1)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="text-gray-700">{label}</span>
        <span className="tabular text-gray-900">
          {used} {unlimited ? <span className="text-gray-400">· unlimited</span> : `of ${limit}`}
        </span>
      </div>
      {!unlimited && <Progress value={pct} tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'accent'} />}
    </div>
  );
}

function PlanSettings() {
  const { tenantId } = useCurrentWorkspace();
  const ws = useWorkspace(tenantId);
  const plans = usePlans();
  if (!ws.data) return <Skeleton className="h-64 rounded-xl" />;
  const { plan, subscription, usage } = ws.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Current plan" />
          <CardBody>
            <div className="flex items-center gap-2">
              <p className="text-xl font-semibold text-gray-900">{plan?.name ?? '—'}</p>
              {subscription && <Badge tone={subscription.status === 'active' ? 'success' : 'accent'}>{SUBSCRIPTION_STATUS_LABELS[subscription.status]}</Badge>}
            </div>
            <p className="mt-1 text-[13px] text-gray-500">
              {plan ? (plan.price_paise === 0 ? 'Free' : `${formatINR(plan.price_paise)} / ${plan.billing_interval}`) : null}
              {subscription?.trial_ends_at && subscription.status === 'trialing' ? ` · trial ends ${formatDate(subscription.trial_ends_at)}` : ''}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Usage" />
          <CardBody className="space-y-4">
            <UsageRow label="Properties" used={usage.properties} limit={plan?.max_properties} />
            <UsageRow label="Residents" used={usage.residents} limit={plan?.max_residents} />
            <UsageRow label="Team members" used={usage.staff} limit={plan?.max_staff} />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Available plans" description="Online subscription payments aren’t available yet. To change plans, contact support and the platform team will update your workspace." />
        <CardBody className="grid gap-4 md:grid-cols-3">
          {(plans.data ?? []).map((p) => (
            <div key={p.id} className={`rounded-xl border p-4 ${p.id === plan?.id ? 'border-accent-600 ring-2 ring-accent-100' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-900">{p.name}</p>
                {p.id === plan?.id && <Badge tone="accent">Current</Badge>}
              </div>
              <p className="tabular mt-2 text-2xl font-semibold text-gray-900">
                {p.price_paise === 0 ? 'Free' : formatINR(p.price_paise)}
                {p.price_paise > 0 && <span className="text-sm font-normal text-gray-500"> /{p.billing_interval}</span>}
              </p>
              {p.description && <p className="mt-1 text-xs text-gray-500">{p.description}</p>}
              <ul className="mt-3 space-y-1.5 text-[13px] text-gray-600">
                <li>{p.max_properties ?? 'Unlimited'} properties</li>
                <li>{p.max_residents ?? 'Unlimited'} residents</li>
                <li>{p.max_staff ?? 'Unlimited'} team members</li>
                {p.features.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success-600" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ActivityLog() {
  const { tenantId } = useCurrentWorkspace();
  const logs = useAuditLogs(tenantId);
  const describe = (action: string) => action.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return (
    <Card>
      <CardHeader title="Activity log" description="An audit trail of important changes in your workspace (latest 100)." />
      {logs.isError ? (
        <ErrorState error={logs.error} />
      ) : logs.isPending ? (
        <Skeleton className="m-5 h-40" />
      ) : logs.data.length === 0 ? (
        <EmptyState compact icon={History} title="No activity yet" />
      ) : (
        <ul className="divide-y divide-gray-100">
          {logs.data.map((l) => {
            const amount = typeof l.details.amount_paise === 'number' ? l.details.amount_paise : typeof l.details.total_paise === 'number' ? l.details.total_paise : null;
            return (
              <li key={l.id} className="flex items-start gap-3 px-5 py-3 text-[13px]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-gray-900">
                    {describe(l.action)}
                    {amount !== null && <span className="tabular text-gray-600"> · {formatINR(amount)}</span>}
                    {typeof l.details.reason === 'string' && <span className="text-gray-500"> — “{l.details.reason}”</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {l.actor_name ?? 'System'} · {formatDateTime(l.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
function ProfileSettings() {
  const { data, auth } = useBackend();
  const me = useMyContext();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    setName(me.data?.user.full_name ?? '');
    setPhone(me.data?.user.phone ?? '');
  }, [me.data]);
  const save = useTenantMutation(null, () => data.updateMyProfile({ full_name: name.trim(), phone: phone.trim() || null }));
  const pw = useTenantMutation(null, () => auth.updatePassword(password));
  return (
    <Card>
      <CardBody>
        <FormSection title="Your details" description={`Signed in as ${me.data?.user.email ?? ''}`}>
          <div className="grid max-w-lg gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="pr-name">
              <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="pr-phone">
              <Input id="pr-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <InlineError error={save.error} />
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => toast.success('Profile saved') })}>
            Save profile
          </Button>
        </FormSection>
        <FormSection title="Password" description="At least 8 characters.">
          <div className="flex max-w-lg gap-2">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" />
            <Button variant="secondary" loading={pw.isPending} disabled={password.length < 8} onClick={() => pw.mutate(undefined, { onSuccess: () => { setPassword(''); toast.success('Password updated'); } })}>
              Update
            </Button>
          </div>
          <InlineError error={pw.error} />
        </FormSection>
      </CardBody>
    </Card>
  );
}
