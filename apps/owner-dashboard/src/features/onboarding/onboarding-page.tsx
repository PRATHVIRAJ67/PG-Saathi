import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Check, CheckCircle2, LogOut, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { newIdempotencyKey, toAppError } from '@pg/api-client';
import { queryKeys, useBackend, useMyContext, useProperties, useRooms, useWorkspace } from '@pg/api-client/react';
import {
  GENDER_POLICY_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  paiseToRupeesInput,
  rupeesToPaise,
  todayISO,
  type OnboardingStep,
  type PaymentMethod,
  type RentMode,
} from '@pg/shared';
import { businessSchema, propertySchema } from '@pg/validation';
import { Button } from '@pg/ui-web/ui/button';
import { Checkbox, Input, MoneyInput, Select, Switch, Textarea } from '@pg/ui-web/ui/form-controls';
import { Badge, Card } from '@pg/ui-web/ui/surfaces';
import { Field, InlineError } from '@pg/ui-web/common';
import { BedPicker } from '@/components/pickers';
import { Logo, Splash } from '@/layout/brand';
import { useZodForm } from '@/lib/form';
import { cn } from '@pg/ui-web/utils';
import { useAuth } from '@/app/auth';
import { DemoBanner } from '@/layout/app-shell';
import { useSessionStore } from '@/app/stores';

type ViewStep = 'business' | OnboardingStep;

const STEPS: { id: ViewStep; label: string; hint: string }[] = [
  { id: 'business', label: 'Your business', hint: 'Name and contact' },
  { id: 'property', label: 'First property', hint: 'Address and facilities' },
  { id: 'rooms', label: 'Rooms & beds', hint: 'Your layout' },
  { id: 'rent', label: 'Rent & billing', hint: 'Due dates and charges' },
  { id: 'residents', label: 'Residents', hint: 'Optional' },
  { id: 'done', label: 'Finish', hint: 'Start managing' },
];

const stepIndex = (s: ViewStep) => STEPS.findIndex((x) => x.id === s);

export function OnboardingPage() {
  const me = useMyContext();
  const { state, signOut } = useAuth();
  const queryClient = useQueryClient();
  const setActiveTenant = useSessionStore((s) => s.setActiveTenant);
  const [finishedTenant, setFinishedTenant] = useState<string | null>(null);
  const [view, setView] = useState<ViewStep | null>(null);

  const incomplete = me.data?.workspaces.find((w) => w.role === 'owner' && !w.onboarding_completed_at);
  const tenantId = finishedTenant ?? incomplete?.tenant_id ?? null;
  const serverStep: ViewStep = finishedTenant ? 'done' : incomplete ? incomplete.onboarding_step : 'business';

  useEffect(() => {
    if (tenantId) setActiveTenant(tenantId);
  }, [tenantId, setActiveTenant]);

  if (me.isPending) return <Splash />;
  if (me.data && !incomplete && !finishedTenant) {
    if (me.data.workspaces.length > 0) return <Navigate to="/app" replace />;
  }

  const current: ViewStep = view && stepIndex(view) <= stepIndex(serverStep) ? view : serverStep;
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.me() });
  const goTo = (step: ViewStep) => {
    setView(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-dvh bg-background">
      <DemoBanner />
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-3 text-[13px] text-gray-500">
            <span className="hidden sm:inline">{state.status === 'signed_in' ? state.session.email : ''}</span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut /> Save & exit
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Setup progress">
          <p className="mb-3 text-xs font-medium text-gray-500 lg:mb-4">
            Step {Math.min(stepIndex(current) + 1, STEPS.length)} of {STEPS.length}
          </p>
          <div className="mb-4 h-1 overflow-hidden rounded-full bg-gray-200 lg:hidden">
            <div className="h-full bg-accent-600 transition-[width]" style={{ width: `${((stepIndex(current) + 1) / STEPS.length) * 100}%` }} />
          </div>
          <ol className="hidden space-y-1 lg:block">
            {STEPS.map((s, i) => {
              const done = i < stepIndex(serverStep) || serverStep === 'done';
              const active = s.id === current;
              const reachable = i <= stepIndex(serverStep) && s.id !== 'business' && serverStep !== 'done';
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => goTo(s.id)}
                    className={cn('flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left', active && 'bg-white shadow-xs ring-1 ring-gray-200', reachable && !active && 'hover:bg-gray-100')}
                    aria-current={active ? 'step' : undefined}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                        done ? 'border-success-600 bg-success-600 text-white' : active ? 'border-accent-600 text-accent-700' : 'border-gray-300 text-gray-400',
                      )}
                    >
                      {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                    </span>
                    <span>
                      <span className={cn('block text-[13px] font-medium', active ? 'text-gray-900' : 'text-gray-600')}>{s.label}</span>
                      <span className="block text-xs text-gray-400">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0">
          {current === 'business' && (
            <BusinessStep
              onDone={async (id) => {
                setActiveTenant(id);
                await refresh();
                setView('property');
              }}
            />
          )}
          {tenantId && current === 'property' && <PropertyStep tenantId={tenantId} onDone={async () => { await refresh(); goTo('rooms'); }} />}
          {tenantId && current === 'rooms' && <RoomsStep tenantId={tenantId} onBack={() => goTo('property')} onDone={async () => { await refresh(); goTo('rent'); }} />}
          {tenantId && current === 'rent' && <RentStep tenantId={tenantId} onBack={() => goTo('rooms')} onDone={async () => { await refresh(); goTo('residents'); }} />}
          {tenantId && current === 'residents' && (
            <ResidentsStep
              tenantId={tenantId}
              onBack={() => goTo('rent')}
              onDone={async () => {
                setFinishedTenant(tenantId);
                await refresh();
                goTo('done');
              }}
            />
          )}
          {tenantId && current === 'done' && <DoneStep tenantId={tenantId} />}
        </div>
      </div>
    </div>
  );
}

function StepCard({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <Card className="animate-slide-up">
      <div className="border-b border-gray-100 px-6 py-5">
        <h1 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{description}</p>
      </div>
      <div className="px-6 py-6">{children}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t border-gray-100 bg-gray-25 px-6 py-4">{footer}</div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — business (creates the workspace on the server)
// ---------------------------------------------------------------------------
function BusinessStep({ onDone }: { onDone: (tenantId: string) => Promise<void> }) {
  const { data } = useBackend();
  const { state } = useAuth();
  const me = useMyContext();
  const [error, setError] = useState<unknown>(null);
  const userId = state.status === 'signed_in' ? state.session.userId : 'anon';
  const form = useZodForm(businessSchema, {
    defaultValues: {
      businessName: '',
      ownerName: me.data?.user.full_name ?? '',
      contactPhone: '',
      contactEmail: state.status === 'signed_in' ? (state.session.email ?? '') : '',
      city: '',
      state: '',
    },
  });
  const { register, handleSubmit, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    // One key per user, reused across retries and double-clicks, so the server
    // returns the same workspace instead of creating another.
    const storageKey = `pg-saas-provision:${userId}`;
    let requestId = localStorage.getItem(storageKey);
    if (!requestId) {
      requestId = newIdempotencyKey();
      localStorage.setItem(storageKey, requestId);
    }
    try {
      const tenantId = await data.provisionWorkspace({
        requestId,
        businessName: values.businessName,
        ownerName: values.ownerName,
        contactPhone: values.contactPhone || undefined,
        contactEmail: values.contactEmail || undefined,
        city: values.city || undefined,
        state: values.state || undefined,
      });
      localStorage.removeItem(storageKey);
      await onDone(tenantId);
    } catch (e) {
      setError(e);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <StepCard
        title="Tell us about your business"
        description="This creates your private workspace. You can manage several properties inside it and invite your team later."
        footer={
          <>
            <span className="text-xs text-gray-500">Takes about 3 minutes in total</span>
            <Button type="submit" loading={formState.isSubmitting}>
              Create workspace <ArrowRight />
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" htmlFor="businessName" required error={formState.errors.businessName?.message} hint="As it should appear on receipts." className="sm:col-span-2">
            <Input id="businessName" autoFocus placeholder="e.g. Sunrise Stays" aria-invalid={!!formState.errors.businessName} {...register('businessName')} />
          </Field>
          <Field label="Your name" htmlFor="ownerName" required error={formState.errors.ownerName?.message}>
            <Input id="ownerName" autoComplete="name" aria-invalid={!!formState.errors.ownerName} {...register('ownerName')} />
          </Field>
          <Field label="Contact phone" htmlFor="contactPhone" error={formState.errors.contactPhone?.message}>
            <Input id="contactPhone" type="tel" autoComplete="tel" placeholder="98450 00000" aria-invalid={!!formState.errors.contactPhone} {...register('contactPhone')} />
          </Field>
          <Field label="Contact email" htmlFor="contactEmail" error={formState.errors.contactEmail?.message}>
            <Input id="contactEmail" type="email" aria-invalid={!!formState.errors.contactEmail} {...register('contactEmail')} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" autoComplete="address-level2" {...register('city')} />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" autoComplete="address-level1" {...register('state')} />
          </Field>
        </div>
        <div className="mt-4">
          <InlineError error={error} />
        </div>
      </StepCard>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — first property
// ---------------------------------------------------------------------------
export function FacilityChips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [custom, setCustom] = useState('');
  const all = useMemo(() => [...new Set([...options, ...value])], [options, value]);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {all.map((f) => {
          const on = value.includes(f);
          return (
            <button
              type="button"
              key={f}
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== f) : [...value, f])}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] transition-colors',
                on ? 'border-accent-600 bg-accent-50 text-accent-800' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
              )}
            >
              {on && <Check className="size-3.5" aria-hidden />}
              {f}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex max-w-xs gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Add another facility"
          aria-label="Add another facility"
          className="h-8"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (custom.trim()) onChange([...value, custom.trim()]);
              setCustom('');
            }
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (custom.trim()) onChange([...value, custom.trim()]);
            setCustom('');
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function PropertyStep({ tenantId, onDone }: { tenantId: string; onDone: () => Promise<void> }) {
  const { data } = useBackend();
  const workspace = useWorkspace(tenantId);
  const properties = useProperties(tenantId);
  const existing = properties.data?.[0];
  const [error, setError] = useState<unknown>(null);
  const form = useZodForm(propertySchema, {
    defaultValues: {
      name: '',
      property_type: 'pg',
      gender_policy: 'any',
      address_line1: '',
      address_line2: '',
      locality: '',
      city: '',
      state: '',
      postal_code: '',
      contact_phone: '',
      description: '',
      facilities: ['WiFi', 'Power backup'],
    },
  });
  const { register, handleSubmit, formState, watch, setValue, reset } = form;

  useEffect(() => {
    if (existing) {
      reset({
        name: existing.name,
        property_type: existing.property_type,
        gender_policy: existing.gender_policy,
        address_line1: existing.address_line1 ?? '',
        address_line2: existing.address_line2 ?? '',
        locality: existing.locality ?? '',
        city: existing.city ?? '',
        state: existing.state ?? '',
        postal_code: existing.postal_code ?? '',
        contact_phone: existing.contact_phone ?? '',
        description: existing.description ?? '',
        facilities: existing.facilities,
      });
    } else if (workspace.data) {
      setValue('city', workspace.data.tenant.city ?? '');
      setValue('state', workspace.data.tenant.state ?? '');
    }
  }, [existing, workspace.data, reset, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const payload = { ...values, property_type: values.property_type as never };
      if (existing) await data.updateProperty(existing.id, payload);
      else await data.createProperty(tenantId, payload);
      await data.setOnboardingStep(tenantId, 'rooms');
      await properties.refetch();
      await onDone();
    } catch (e) {
      setError(e);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <StepCard
        title="Add your first property"
        description="A property is one building or location. You can add more properties later from the dashboard."
        footer={
          <>
            <span className="text-xs text-gray-500">{existing ? 'Already saved — update or continue' : ''}</span>
            <Button type="submit" loading={formState.isSubmitting}>
              Save and continue <ArrowRight />
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property name" htmlFor="p-name" required error={formState.errors.name?.message} className="sm:col-span-2">
            <Input id="p-name" autoFocus placeholder="e.g. Sunrise Residency, Koramangala" aria-invalid={!!formState.errors.name} {...register('name')} />
          </Field>
          <Field label="Type" htmlFor="p-type">
            <Select id="p-type" {...register('property_type')}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who can stay" htmlFor="p-gender">
            <Select id="p-gender" {...register('gender_policy')}>
              {Object.entries(GENDER_POLICY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Address" htmlFor="p-addr" className="sm:col-span-2">
            <Input id="p-addr" autoComplete="address-line1" placeholder="Building, street" {...register('address_line1')} />
          </Field>
          <Field label="Locality / area" htmlFor="p-loc">
            <Input id="p-loc" {...register('locality')} />
          </Field>
          <Field label="City" htmlFor="p-city">
            <Input id="p-city" autoComplete="address-level2" {...register('city')} />
          </Field>
          <Field label="State" htmlFor="p-state">
            <Input id="p-state" autoComplete="address-level1" {...register('state')} />
          </Field>
          <Field label="PIN code" htmlFor="p-pin" error={formState.errors.postal_code?.message}>
            <Input id="p-pin" inputMode="numeric" autoComplete="postal-code" aria-invalid={!!formState.errors.postal_code} {...register('postal_code')} />
          </Field>
          <Field label="Facilities" className="sm:col-span-2" hint="Tap to select. Shown on the property profile.">
            <FacilityChips options={workspace.data?.settings.facility_options ?? []} value={watch('facilities')} onChange={(v) => setValue('facilities', v, { shouldDirty: true })} />
          </Field>
          <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
            <Textarea id="p-desc" rows={2} placeholder="Optional — a short note about the property" {...register('description')} />
          </Field>
        </div>
        <div className="mt-4">
          <InlineError error={error} />
        </div>
      </StepCard>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — rooms & beds
// ---------------------------------------------------------------------------
interface RoomRow {
  key: string;
  name: string;
  floor: string;
  category: string;
  beds: string;
  rent: string;
}

const newRow = (n: Partial<RoomRow> = {}): RoomRow => ({ key: newIdempotencyKey(), name: '', floor: '', category: '', beds: '2', rent: '', ...n });

function RoomsStep({ tenantId, onDone, onBack }: { tenantId: string; onDone: () => Promise<void>; onBack: () => void }) {
  const { data } = useBackend();
  const properties = useProperties(tenantId);
  const property = properties.data?.[0];
  const rooms = useRooms(tenantId, property?.id);
  const workspace = useWorkspace(tenantId);
  const existingRooms = rooms.data ?? [];
  const [rentMode, setRentMode] = useState<RentMode>('per_bed');
  const [rows, setRows] = useState<RoomRow[]>(() => ['101', '102', '103'].map((name) => newRow({ name, floor: 'Ground', category: 'Double sharing' })));
  const [gen, setGen] = useState({ prefix: '', start: '201', count: '5', floor: 'First', beds: '2', rent: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (workspace.data) setRentMode(workspace.data.settings.default_rent_mode);
  }, [workspace.data]);

  useEffect(() => {
    // Resuming with rooms already created: start with an empty builder.
    if (existingRooms.length > 0) setRows([]);
  }, [existingRooms.length]);

  const update = (key: string, patch: Partial<RoomRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const totalBeds = rows.reduce((n, r) => n + (Number(r.beds) || 0), 0);

  const generate = () => {
    const start = Number(gen.start);
    const count = Math.min(Math.max(Number(gen.count) || 0, 1), 100);
    if (!Number.isFinite(start)) return;
    const generated = Array.from({ length: count }, (_, i) =>
      newRow({ name: `${gen.prefix}${start + i}`, floor: gen.floor, beds: gen.beds, rent: gen.rent, category: Number(gen.beds) === 1 ? 'Single' : `${gen.beds}-sharing` }),
    );
    setRows((rs) => [...rs.filter((r) => r.name.trim() !== ''), ...generated]);
  };

  const validate = (): string | null => {
    const names = new Set(existingRooms.map((r) => r.name.toLowerCase()));
    for (const r of rows) {
      if (!r.name.trim()) return 'Every room needs a name or number.';
      if (names.has(r.name.trim().toLowerCase())) return `Room ${r.name} appears more than once.`;
      names.add(r.name.trim().toLowerCase());
      const beds = Number(r.beds);
      if (!Number.isInteger(beds) || beds < 1 || beds > 30) return `Room ${r.name}: beds must be between 1 and 30.`;
      const rent = rupeesToPaise(r.rent);
      if (rent === null || rent < 0) return `Room ${r.name}: enter the monthly rent.`;
    }
    return null;
  };

  const submit = async () => {
    setError(null);
    if (!property) return;
    if (rows.length === 0 && existingRooms.length > 0) {
      await data.setOnboardingStep(tenantId, 'rent');
      await onDone();
      return;
    }
    const message = validate();
    if (message) {
      setError({ message, hint: 'validation' });
      return;
    }
    setBusy(true);
    try {
      await data.createRooms(
        property.id,
        rows.map((r) => ({
          name: r.name.trim(),
          floor: r.floor.trim() || null,
          category: r.category.trim() || null,
          rent_mode: rentMode,
          rent_paise: rupeesToPaise(r.rent) ?? 0,
          bed_count: Number(r.beds),
        })),
      );
      await data.setOnboardingStep(tenantId, 'rent');
      await rooms.refetch();
      await onDone();
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard
      title="Set up rooms and beds"
      description={`Add the rooms in ${property?.name ?? 'your property'} and how many beds each has. Every bed gets its own label (A, B, C…) so you can track occupancy bed by bed.`}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <div className="flex items-center gap-3">
            {rows.length > 0 && (
              <span className="tabular text-xs text-gray-500">
                {rows.length} rooms · {totalBeds} beds
              </span>
            )}
            <Button onClick={submit} loading={busy} disabled={rows.length === 0 && existingRooms.length === 0}>
              {rows.length === 0 ? 'Continue' : 'Save rooms and continue'} <ArrowRight />
            </Button>
          </div>
        </>
      }
    >
      {existingRooms.length > 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-success-100 bg-success-50 px-3 py-2.5 text-[13px] text-success-700">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {existingRooms.length} rooms with {existingRooms.reduce((n, r) => n + r.beds.length, 0)} beds already saved. Add more below or continue.
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Field label="Rent is charged" htmlFor="rent-mode">
          <Select id="rent-mode" value={rentMode} onChange={(e) => setRentMode(e.target.value as RentMode)} className="w-48">
            <option value="per_bed">Per bed (sharing)</option>
            <option value="per_room">Per room (whole room)</option>
          </Select>
        </Field>
        <p className="max-w-xs pb-2 text-xs text-gray-500">
          {rentMode === 'per_bed' ? 'Each bed in a room pays the rent you enter.' : 'The rent you enter is for the whole room and is split across its beds.'}
        </p>
      </div>

      <details className="group mb-5 rounded-lg border border-dashed border-gray-300 bg-gray-25 p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-gray-800">
          <Wand2 className="size-4 text-accent-600" aria-hidden /> Add many rooms at once
          <span className="text-xs font-normal text-gray-500">— e.g. rooms 201 to 210 with 2 beds each</span>
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Field label="Prefix" htmlFor="g-prefix">
            <Input id="g-prefix" value={gen.prefix} onChange={(e) => setGen({ ...gen, prefix: e.target.value })} placeholder="e.g. A-" />
          </Field>
          <Field label="Start no." htmlFor="g-start">
            <Input id="g-start" inputMode="numeric" value={gen.start} onChange={(e) => setGen({ ...gen, start: e.target.value })} />
          </Field>
          <Field label="How many" htmlFor="g-count">
            <Input id="g-count" inputMode="numeric" value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} />
          </Field>
          <Field label="Floor" htmlFor="g-floor">
            <Input id="g-floor" value={gen.floor} onChange={(e) => setGen({ ...gen, floor: e.target.value })} />
          </Field>
          <Field label="Beds each" htmlFor="g-beds">
            <Input id="g-beds" inputMode="numeric" value={gen.beds} onChange={(e) => setGen({ ...gen, beds: e.target.value })} />
          </Field>
          <Field label={rentMode === 'per_bed' ? 'Rent / bed' : 'Rent / room'} htmlFor="g-rent">
            <MoneyInput id="g-rent" value={gen.rent} onChange={(e) => setGen({ ...gen, rent: e.target.value })} />
          </Field>
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={generate}>
          <Sparkles /> Generate rooms
        </Button>
      </details>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-gray-25 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Room no.</th>
                <th className="px-3 py-2 text-left font-medium">Floor</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="w-20 px-3 py-2 text-left font-medium">Beds</th>
                <th className="w-36 px-3 py-2 text-left font-medium">{rentMode === 'per_bed' ? 'Rent / bed' : 'Rent / room'}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-2 py-1.5">
                    <Input aria-label="Room number" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className="h-8" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label="Floor" value={r.floor} onChange={(e) => update(r.key, { floor: e.target.value })} className="h-8" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label="Room type" value={r.category} onChange={(e) => update(r.key, { category: e.target.value })} className="h-8" placeholder="e.g. Double sharing" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label="Beds" inputMode="numeric" value={r.beds} onChange={(e) => update(r.key, { beds: e.target.value })} className="h-8 tabular" />
                  </td>
                  <td className="px-2 py-1.5">
                    <MoneyInput aria-label="Rent" value={r.rent} onChange={(e) => update(r.key, { rent: e.target.value })} className="h-8" />
                  </td>
                  <td className="px-1 py-1.5">
                    <Button variant="ghost" size="icon-sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove room ${r.name}`}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => setRows((rs) => [...rs, newRow()])}>
        <Plus /> Add a room
      </Button>
      <div className="mt-4">
        <InlineError error={error} />
      </div>
    </StepCard>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — rent & billing
// ---------------------------------------------------------------------------
function RentStep({ tenantId, onDone, onBack }: { tenantId: string; onDone: () => Promise<void>; onBack: () => void }) {
  const { data } = useBackend();
  const workspace = useWorkspace(tenantId);
  const s = workspace.data?.settings;
  const [billingDay, setBillingDay] = useState('1');
  const [dueDays, setDueDays] = useState('5');
  const [deposit, setDeposit] = useState('');
  const [prorate, setProrate] = useState(true);
  const [methods, setMethods] = useState<PaymentMethod[]>(['cash', 'upi', 'bank_transfer']);
  const [upi, setUpi] = useState('');
  const [charges, setCharges] = useState<{ key: string; name: string; amount: string; auto: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!s) return;
    setBillingDay(String(s.default_billing_day));
    setDueDays(String(s.payment_due_days));
    setDeposit(s.default_deposit_paise ? paiseToRupeesInput(s.default_deposit_paise) : '');
    setProrate(s.prorate_first_month);
    setMethods(s.payment_methods);
    setUpi(s.upi_id ?? '');
  }, [s]);

  const submit = async () => {
    setError(null);
    const day = Number(billingDay);
    const due = Number(dueDays);
    if (!Number.isInteger(day) || day < 1 || day > 28) return setError({ message: 'Billing day must be between 1 and 28.', hint: 'validation' });
    if (!Number.isInteger(due) || due < 0 || due > 60) return setError({ message: 'Days to pay must be between 0 and 60.', hint: 'validation' });
    const depositPaise = deposit.trim() ? rupeesToPaise(deposit) : 0;
    if (depositPaise === null || depositPaise < 0) return setError({ message: 'Enter a valid default deposit.', hint: 'validation' });
    if (methods.length === 0) return setError({ message: 'Enable at least one payment method.', hint: 'validation' });
    for (const c of charges) {
      if (c.name.trim().length < 2 || !rupeesToPaise(c.amount)) return setError({ message: 'Each charge needs a name and an amount.', hint: 'validation' });
    }
    setBusy(true);
    try {
      await data.updateSettings(tenantId, {
        default_billing_day: day,
        payment_due_days: due,
        default_deposit_paise: depositPaise,
        prorate_first_month: prorate,
        payment_methods: methods,
        upi_id: upi.trim() || null,
      });
      for (const c of charges) {
        await data.saveChargeTemplate(tenantId, null, { name: c.name.trim(), amount_paise: rupeesToPaise(c.amount)!, frequency: 'monthly', apply_by_default: c.auto });
      }
      setCharges([]);
      await data.setOnboardingStep(tenantId, 'residents');
      await onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard
      title="How do you collect rent?"
      description="These defaults apply to new residents. You can override them for any resident, and change them later in Settings without affecting past bills."
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button onClick={submit} loading={busy}>
            Save and continue <ArrowRight />
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rent is billed on day" htmlFor="b-day" hint="Day of the month (1–28).">
          <Input id="b-day" inputMode="numeric" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} />
        </Field>
        <Field label="Days to pay" htmlFor="b-due" hint="After this, rent shows as overdue.">
          <Input id="b-due" inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
        </Field>
        <Field label="Default security deposit" htmlFor="b-dep" hint="Leave blank to use each room’s deposit.">
          <MoneyInput id="b-dep" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </Field>
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-lg border border-gray-200 p-3">
        <Switch checked={prorate} onCheckedChange={setProrate} aria-label="Prorate first month" />
        <span>
          <span className="block text-[13px] font-medium text-gray-900">Prorate the first month</span>
          <span className="block text-xs text-gray-500">Someone moving in on the 16th pays only for the days they stay.</span>
        </span>
      </label>

      <div className="mt-6">
        <p className="text-[13px] font-medium text-gray-700">Payment methods you accept</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {PAYMENT_METHODS.map((m) => (
            <label key={m} className="flex items-center gap-2 text-[13px] text-gray-700">
              <Checkbox checked={methods.includes(m)} onCheckedChange={(c) => setMethods((ms) => (c ? [...ms, m] : ms.filter((x) => x !== m)))} />
              {PAYMENT_METHOD_LABELS[m]}
            </label>
          ))}
        </div>
        {methods.includes('upi') && (
          <Field label="UPI ID (shown on receipts)" htmlFor="b-upi" className="mt-4 max-w-sm">
            <Input id="b-upi" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="yourname@bank" />
          </Field>
        )}
        <p className="mt-3 text-xs text-gray-500">Payments are recorded manually for now. Online collection will be added later.</p>
      </div>

      <div className="mt-6">
        <p className="text-[13px] font-medium text-gray-700">Monthly additional charges</p>
        <p className="text-xs text-gray-500">Optional — e.g. laundry, electricity share. Automatic charges are added to every monthly rent bill.</p>
        <div className="mt-3 space-y-2">
          {charges.map((c) => (
            <div key={c.key} className="flex flex-wrap items-center gap-2">
              <Input aria-label="Charge name" value={c.name} onChange={(e) => setCharges((cs) => cs.map((x) => (x.key === c.key ? { ...x, name: e.target.value } : x)))} placeholder="Charge name" className="h-8 w-48" />
              <div className="w-32">
                <MoneyInput aria-label="Charge amount" value={c.amount} onChange={(e) => setCharges((cs) => cs.map((x) => (x.key === c.key ? { ...x, amount: e.target.value } : x)))} className="h-8" />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <Checkbox checked={c.auto} onCheckedChange={(v) => setCharges((cs) => cs.map((x) => (x.key === c.key ? { ...x, auto: Boolean(v) } : x)))} />
                Add automatically
              </label>
              <Button variant="ghost" size="icon-sm" aria-label="Remove charge" onClick={() => setCharges((cs) => cs.filter((x) => x.key !== c.key))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setCharges((cs) => [...cs, { key: newIdempotencyKey(), name: '', amount: '', auto: true }])}>
            <Plus /> Add a charge
          </Button>
        </div>
      </div>
      <div className="mt-4">
        <InlineError error={error} />
      </div>
    </StepCard>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — residents (optional)
// ---------------------------------------------------------------------------
interface ResidentRow {
  key: string;
  name: string;
  phone: string;
  bedId: string;
  rent: string;
  deposit: string;
  moveIn: string;
}

function ResidentsStep({ tenantId, onDone, onBack }: { tenantId: string; onDone: () => Promise<void>; onBack: () => void }) {
  const { data } = useBackend();
  const rooms = useRooms(tenantId);
  const [rows, setRows] = useState<ResidentRow[]>([{ key: newIdempotencyKey(), name: '', phone: '', bedId: '', rent: '', deposit: '', moveIn: todayISO() }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const update = (key: string, patch: Partial<ResidentRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.name.trim());

  const finish = async () => {
    await data.setOnboardingStep(tenantId, 'done');
    await onDone();
  };

  const submit = async () => {
    setError(null);
    for (const r of filled) {
      if (r.name.trim().length < 2) return setError({ message: 'Each resident needs a name (2+ characters).', hint: 'validation' });
      if (r.bedId && rupeesToPaise(r.rent) === null) return setError({ message: `Enter monthly rent for ${r.name}.`, hint: 'validation' });
    }
    setBusy(true);
    try {
      // Saved one by one; rows that succeed are removed so a retry never duplicates them.
      for (const r of filled) {
        const residentId = await data.createResident(tenantId, { full_name: r.name.trim(), phone: r.phone.trim() || null });
        if (r.bedId) {
          await data.assignBed({
            residentId,
            bedId: r.bedId,
            move_in_date: r.moveIn || todayISO(),
            monthly_rent_paise: rupeesToPaise(r.rent) ?? undefined,
            deposit_paise: r.deposit.trim() ? (rupeesToPaise(r.deposit) ?? undefined) : undefined,
          });
        }
        setSaved((s) => [...s, r.name.trim()]);
        setRows((rs) => rs.filter((x) => x.key !== r.key));
        await rooms.refetch();
      }
      await finish();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard
      title="Add your current residents"
      description="Residents don’t need to install anything — you manage their records. You can also skip this and add them later."
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void finish()} disabled={busy}>
              Skip for now
            </Button>
            <Button onClick={submit} loading={busy} disabled={filled.length === 0}>
              Save {filled.length > 0 ? filled.length : ''} and finish <ArrowRight />
            </Button>
          </div>
        </>
      }
    >
      {saved.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success-100 bg-success-50 px-3 py-2 text-[13px] text-success-700">
          <CheckCircle2 className="size-4" aria-hidden /> Saved: {saved.join(', ')}
        </div>
      )}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.key} className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Badge>Resident {i + 1}</Badge>
              {rows.length > 1 && (
                <Button variant="ghost" size="icon-sm" aria-label="Remove resident" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                  <Trash2 />
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Full name" htmlFor={`r-name-${r.key}`}>
                <Input id={`r-name-${r.key}`} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
              </Field>
              <Field label="Phone" htmlFor={`r-phone-${r.key}`}>
                <Input id={`r-phone-${r.key}`} type="tel" value={r.phone} onChange={(e) => update(r.key, { phone: e.target.value })} />
              </Field>
              <Field label="Bed" htmlFor={`r-bed-${r.key}`}>
                <BedPicker
                  id={`r-bed-${r.key}`}
                  tenantId={tenantId}
                  value={r.bedId}
                  onChange={(bedId, bed) =>
                    update(r.key, {
                      bedId,
                      rent: bed ? paiseToRupeesInput(bed.suggestedRent) : r.rent,
                      deposit: bed && bed.deposit ? paiseToRupeesInput(bed.deposit) : r.deposit,
                    })
                  }
                />
              </Field>
              {r.bedId && (
                <>
                  <Field label="Monthly rent" htmlFor={`r-rent-${r.key}`}>
                    <MoneyInput id={`r-rent-${r.key}`} value={r.rent} onChange={(e) => update(r.key, { rent: e.target.value })} />
                  </Field>
                  <Field label="Security deposit" htmlFor={`r-dep-${r.key}`}>
                    <MoneyInput id={`r-dep-${r.key}`} value={r.deposit} onChange={(e) => update(r.key, { deposit: e.target.value })} />
                  </Field>
                  <Field label="Moved in on" htmlFor={`r-in-${r.key}`}>
                    <Input id={`r-in-${r.key}`} type="date" value={r.moveIn} onChange={(e) => update(r.key, { moveIn: e.target.value })} />
                  </Field>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => setRows((rs) => [...rs, { key: newIdempotencyKey(), name: '', phone: '', bedId: '', rent: '', deposit: '', moveIn: todayISO() }])}>
        <Plus /> Add another resident
      </Button>
      <div className="mt-4">
        <InlineError error={error} />
      </div>
    </StepCard>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — done
// ---------------------------------------------------------------------------
function DoneStep({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const properties = useProperties(tenantId);
  const p = properties.data ?? [];
  const beds = p.reduce((n, x) => n + x.bed_count, 0);
  const occupied = p.reduce((n, x) => n + x.occupied_count, 0);
  return (
    <Card className="animate-slide-up overflow-hidden">
      <div className="bg-navy-900 px-8 py-10 text-white">
        <span className="flex size-11 items-center justify-center rounded-xl bg-white/10">
          <Building2 className="size-5 text-accent-200" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Your workspace is ready</h1>
        <p className="mt-2 max-w-lg text-[15px] text-white/70">Everything you entered is saved. Here’s what to do next to start tracking rent.</p>
        <div className="mt-6 flex flex-wrap gap-6 text-sm">
          <div>
            <p className="tabular text-2xl font-semibold">{p.length}</p>
            <p className="text-white/60">{p.length === 1 ? 'property' : 'properties'}</p>
          </div>
          <div>
            <p className="tabular text-2xl font-semibold">{beds}</p>
            <p className="text-white/60">beds</p>
          </div>
          <div>
            <p className="tabular text-2xl font-semibold">{occupied}</p>
            <p className="text-white/60">occupied</p>
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-6 sm:grid-cols-3">
        {[
          { title: 'Generate this month’s rent', text: 'Create rent bills for everyone in one click.', to: '/app/rent' },
          { title: 'Record a payment', text: 'Log cash, UPI or bank transfers as they come in.', to: '/app/payments' },
          { title: 'Invite your team', text: 'Give a manager or accountant their own login.', to: '/app/settings/team' },
        ].map((x) => (
          <button key={x.title} onClick={() => navigate(x.to)} className="rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-accent-200 hover:bg-accent-50">
            <p className="text-[13px] font-semibold text-gray-900">{x.title}</p>
            <p className="mt-1 text-xs text-gray-500">{x.text}</p>
          </button>
        ))}
      </div>
      <div className="flex justify-end border-t border-gray-100 bg-gray-25 px-6 py-4">
        <Button onClick={() => navigate('/app')}>
          Go to dashboard <ArrowRight />
        </Button>
      </div>
    </Card>
  );
}
