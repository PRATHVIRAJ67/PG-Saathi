import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { CheckCircle2, Copy, Info, RefreshCw, Send } from 'lucide-react';
import { AppError, generateResidentPassword } from '@pg/api-client';
import { useBackend, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import {
  PAYMENT_METHOD_LABELS,
  formatDate,
  formatINR,
  paiseToRupeesInput,
  rupeesToPaise,
  todayISO,
  type PaymentMethod,
  type ResidentDetail,
  type Stay,
} from '@pg/shared';
import { assignBedSchema, blankToNull, changeRentSchema, moveOutSchema, residentSchema, toPaise } from '@pg/validation';
import { Button } from '@pg/ui-web/ui/button';
import { Input, MoneyInput, Select, Textarea } from '@pg/ui-web/ui/form-controls';
import { Dialog, DialogContent } from '@pg/ui-web/ui/overlays';
import { Field, InlineError } from '@pg/ui-web/common';
import { BedPicker, ResidentPicker } from '@/components/pickers';
import { useCurrentWorkspace } from '@/app/workspace';
import { useZodForm } from '@/lib/form';

// ---------------------------------------------------------------------------
// Create / edit resident
// ---------------------------------------------------------------------------
export function ResidentFormDialog({ open, onOpenChange, resident }: { open: boolean; onOpenChange: (o: boolean) => void; resident?: ResidentDetail }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const navigate = useNavigate();
  const empty = {
    full_name: '',
    phone: '',
    email: '',
    gender: '' as const,
    date_of_birth: '',
    occupation: '',
    organization: '',
    id_proof_type: '',
    id_proof_number: '',
    permanent_address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    notes: '',
  };
  const form = useZodForm(residentSchema, { defaultValues: empty });
  const { register, handleSubmit, formState, reset } = form;

  useEffect(() => {
    if (!open) return;
    if (resident) {
      reset({
        full_name: resident.full_name,
        phone: resident.phone ?? '',
        email: resident.email ?? '',
        gender: resident.gender ?? '',
        date_of_birth: resident.date_of_birth ?? '',
        occupation: resident.occupation ?? '',
        organization: resident.organization ?? '',
        id_proof_type: resident.id_proof_type ?? '',
        id_proof_number: resident.id_proof_number ?? '',
        permanent_address: resident.permanent_address ?? '',
        emergency_contact_name: resident.emergency_contact_name ?? '',
        emergency_contact_phone: resident.emergency_contact_phone ?? '',
        emergency_contact_relation: resident.emergency_contact_relation ?? '',
        notes: resident.notes ?? '',
      });
    } else reset(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resident]);

  const mutation = useTenantMutation(tenantId, async (values: typeof empty) => {
    const payload = {
      full_name: values.full_name.trim(),
      phone: blankToNull(values.phone),
      email: blankToNull(values.email),
      gender: (blankToNull(values.gender) as 'male' | 'female' | 'other' | null) ?? null,
      date_of_birth: blankToNull(values.date_of_birth),
      occupation: blankToNull(values.occupation),
      organization: blankToNull(values.organization),
      id_proof_type: blankToNull(values.id_proof_type),
      id_proof_number: blankToNull(values.id_proof_number),
      permanent_address: blankToNull(values.permanent_address),
      emergency_contact_name: blankToNull(values.emergency_contact_name),
      emergency_contact_phone: blankToNull(values.emergency_contact_phone),
      emergency_contact_relation: blankToNull(values.emergency_contact_relation),
      notes: blankToNull(values.notes),
    };
    return resident ? data.updateResident(resident.id, payload) : data.createResident(tenantId, payload);
  });

  const onSubmit = handleSubmit((values) =>
    mutation.mutate(values as typeof empty, {
      onSuccess: (id) => {
        toast.success(resident ? 'Resident updated' : 'Resident added', {
          action: resident ? undefined : { label: 'Assign a bed', onClick: () => navigate(`/app/residents/${id}?assign=1`) },
        });
        onOpenChange(false);
        if (!resident) navigate(`/app/residents/${id}`);
      },
    }),
  );

  const e = formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={resident ? 'Edit resident' : 'Add a resident'}
        description={resident ? undefined : 'Only the name is required. Residents don’t need an app account — you can invite them later.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={mutation.isPending}>
              {resident ? 'Save changes' : 'Add resident'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required htmlFor="rf-name" error={e.full_name?.message} className="sm:col-span-2">
              <Input id="rf-name" autoFocus aria-invalid={!!e.full_name} {...register('full_name')} />
            </Field>
            <Field label="Phone" htmlFor="rf-phone" error={e.phone?.message}>
              <Input id="rf-phone" type="tel" aria-invalid={!!e.phone} {...register('phone')} />
            </Field>
            <Field label="Email" htmlFor="rf-email" error={e.email?.message}>
              <Input id="rf-email" type="email" aria-invalid={!!e.email} {...register('email')} />
            </Field>
            <Field label="Gender" htmlFor="rf-gender">
              <Select id="rf-gender" {...register('gender')}>
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Date of birth" htmlFor="rf-dob" error={e.date_of_birth?.message}>
              <Input id="rf-dob" type="date" max={todayISO()} {...register('date_of_birth')} />
            </Field>
            <Field label="Occupation" htmlFor="rf-occ">
              <Input id="rf-occ" placeholder="e.g. Software engineer, Student" {...register('occupation')} />
            </Field>
            <Field label="Company / college" htmlFor="rf-org">
              <Input id="rf-org" {...register('organization')} />
            </Field>
          </div>
          <fieldset className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-3">
            <legend className="mb-1 text-[13px] font-semibold text-gray-900">Emergency contact</legend>
            <Field label="Name" htmlFor="rf-ec-name">
              <Input id="rf-ec-name" {...register('emergency_contact_name')} />
            </Field>
            <Field label="Phone" htmlFor="rf-ec-phone" error={e.emergency_contact_phone?.message}>
              <Input id="rf-ec-phone" type="tel" {...register('emergency_contact_phone')} />
            </Field>
            <Field label="Relation" htmlFor="rf-ec-rel">
              <Input id="rf-ec-rel" placeholder="e.g. Father" {...register('emergency_contact_relation')} />
            </Field>
          </fieldset>
          <fieldset className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            <legend className="mb-1 text-[13px] font-semibold text-gray-900">Identity & address</legend>
            <Field label="ID proof type" htmlFor="rf-idt">
              <Input id="rf-idt" placeholder="e.g. Aadhaar, Passport" {...register('id_proof_type')} />
            </Field>
            <Field label="ID number" htmlFor="rf-idn" hint="Visible only to your team.">
              <Input id="rf-idn" {...register('id_proof_number')} />
            </Field>
            <Field label="Permanent address" htmlFor="rf-addr" className="sm:col-span-2">
              <Textarea id="rf-addr" rows={2} {...register('permanent_address')} />
            </Field>
            <Field label="Notes" htmlFor="rf-notes" className="sm:col-span-2">
              <Textarea id="rf-notes" rows={2} {...register('notes')} />
            </Field>
          </fieldset>
          <InlineError error={mutation.error} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Assign bed / transfer
// ---------------------------------------------------------------------------
export function AssignBedDialog({
  open,
  onOpenChange,
  residentId: presetResident,
  bedId: presetBed,
  transferStay,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  residentId?: string;
  bedId?: string;
  transferStay?: Stay;
}) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const workspace = useWorkspace(tenantId);
  const methods = workspace.data?.settings.payment_methods ?? ['cash'];
  const [residentId, setResidentId] = useState(presetResident ?? '');
  const currentAgreement = transferStay?.agreements.find((a) => a.effective_to === null);
  const defaults = {
    bed_id: presetBed ?? '',
    move_in_date: todayISO(),
    monthly_rent: currentAgreement ? paiseToRupeesInput(currentAgreement.monthly_rent_paise) : '',
    deposit: currentAgreement ? paiseToRupeesInput(currentAgreement.deposit_paise) : '',
    deposit_collected: '',
    deposit_method: methods[0] ?? 'cash',
    billing_day: currentAgreement?.billing_day ?? workspace.data?.settings.default_billing_day ?? 1,
    expected_move_out_date: '',
    notes: '',
  };
  const form = useZodForm(assignBedSchema, { defaultValues: defaults });
  const { register, handleSubmit, formState, setValue, reset, watch } = form;

  useEffect(() => {
    if (open) {
      setResidentId(presetResident ?? '');
      reset(defaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetResident, presetBed]);

  const mutation = useTenantMutation(tenantId, async (values: { bed_id: string; move_in_date: string; monthly_rent: string; deposit?: string; deposit_collected?: string; deposit_method: string; billing_day: number; expected_move_out_date?: string; notes?: string }) => {
    if (transferStay) {
      return data.transferBed(transferStay.id, values.bed_id, values.move_in_date, rupeesToPaise(values.monthly_rent));
    }
    if (!residentId) throw Object.assign(new Error('Choose a resident'), { hint: 'validation', message: 'Choose a resident' });
    return data.assignBed({
      residentId,
      bedId: values.bed_id,
      move_in_date: values.move_in_date,
      monthly_rent_paise: rupeesToPaise(values.monthly_rent) ?? undefined,
      deposit_paise: toPaise(values.deposit) ?? 0,
      billing_day: values.billing_day,
      expected_move_out_date: blankToNull(values.expected_move_out_date),
      notes: blankToNull(values.notes),
      deposit_collected_paise: toPaise(values.deposit_collected),
      deposit_method: values.deposit_method as PaymentMethod,
    });
  });

  const onSubmit = handleSubmit((values) =>
    mutation.mutate(values as never, {
      onSuccess: () => {
        toast.success(transferStay ? 'Resident moved to the new bed' : 'Bed assigned');
        onOpenChange(false);
      },
    }),
  );
  const e = formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={transferStay ? 'Move to another bed' : 'Assign a bed'}
        description={
          transferStay
            ? `Ends the current stay in ${transferStay.room_name}/${transferStay.bed_label} on the transfer date and starts a new one. Deposit stays with the resident.`
            : 'Starts a stay and records the agreed rent. The rent is saved with this stay, so later changes to room prices won’t affect it.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={mutation.isPending}>
              {transferStay ? 'Move resident' : 'Assign bed'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {!transferStay && (
            <Field label="Resident" required htmlFor="ab-resident">
              <ResidentPicker id="ab-resident" tenantId={tenantId} value={residentId} status="current" onChange={(id) => setResidentId(id)} />
            </Field>
          )}
          <Field label={transferStay ? 'New bed' : 'Bed'} required htmlFor="ab-bed" error={e.bed_id?.message}>
            <BedPicker
              id="ab-bed"
              tenantId={tenantId}
              value={watch('bed_id')}
              excludeBedId={transferStay?.bed_id}
              invalid={!!e.bed_id}
              onChange={(bedId, bed) => {
                setValue('bed_id', bedId, { shouldValidate: true });
                if (bed && !transferStay) {
                  setValue('monthly_rent', paiseToRupeesInput(bed.suggestedRent));
                  if (bed.deposit) setValue('deposit', paiseToRupeesInput(bed.deposit));
                }
              }}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={transferStay ? 'Transfer date' : 'Move-in date'} required htmlFor="ab-date" error={e.move_in_date?.message}>
              <Input id="ab-date" type="date" {...register('move_in_date')} />
            </Field>
            <Field label="Monthly rent" required htmlFor="ab-rent" error={e.monthly_rent?.message}>
              <MoneyInput id="ab-rent" aria-invalid={!!e.monthly_rent} {...register('monthly_rent')} />
            </Field>
            {!transferStay && (
              <Field label="Rent due day" htmlFor="ab-day" error={e.billing_day?.message} hint="1–28">
                <Input id="ab-day" inputMode="numeric" {...register('billing_day')} />
              </Field>
            )}
          </div>
          {!transferStay && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Security deposit (agreed)" htmlFor="ab-dep" error={e.deposit?.message}>
                  <MoneyInput id="ab-dep" {...register('deposit')} />
                </Field>
                <Field label="Deposit collected now" htmlFor="ab-dep-c" error={e.deposit_collected?.message} hint="Leave blank if not yet paid.">
                  <MoneyInput id="ab-dep-c" {...register('deposit_collected')} />
                </Field>
                <Field label="Deposit paid via" htmlFor="ab-dep-m">
                  <Select id="ab-dep-m" {...register('deposit_method')}>
                    {methods.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Expected move-out" htmlFor="ab-out" hint="Optional.">
                  <Input id="ab-out" type="date" {...register('expected_move_out_date')} />
                </Field>
                <Field label="Notes" htmlFor="ab-notes">
                  <Input id="ab-notes" {...register('notes')} />
                </Field>
              </div>
            </>
          )}
          <InlineError error={mutation.error} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Move out
// ---------------------------------------------------------------------------
export function MoveOutDialog({ open, onOpenChange, stay, resident }: { open: boolean; onOpenChange: (o: boolean) => void; stay: Stay; resident: ResidentDetail }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const form = useZodForm(moveOutSchema, { defaultValues: { move_out_date: todayISO(), notes: '' } });
  const { register, handleSubmit, formState } = form;
  const mutation = useTenantMutation(tenantId, (v: { move_out_date: string; notes?: string }) => data.endStay(stay.id, v.move_out_date, blankToNull(v.notes)));
  const outstanding = resident.balance?.outstanding_paise ?? 0;
  const held = resident.deposit ? resident.deposit.collected_paise - resident.deposit.refunded_paise - resident.deposit.deducted_paise : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Move out ${resident.full_name}`}
        description={`Ends the stay in ${stay.property_name}, room ${stay.room_name} / bed ${stay.bed_label}. The bed becomes vacant. Bills and payments are kept.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={mutation.isPending}
              onClick={handleSubmit((v) =>
                mutation.mutate(v as never, {
                  onSuccess: () => {
                    toast.success('Moved out — bed is now vacant');
                    onOpenChange(false);
                  },
                }),
              )}
            >
              Confirm move-out
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {(outstanding > 0 || held > 0) && (
            <div className="flex gap-2 rounded-lg border border-gray-200 bg-gray-25 p-3 text-[13px] text-gray-600">
              <Info className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden />
              <div>
                {outstanding > 0 && (
                  <p>
                    Outstanding rent: <span className="tabular font-medium text-danger-600">{formatINR(outstanding)}</span>
                  </p>
                )}
                {held > 0 && (
                  <p>
                    Deposit held: <span className="tabular font-medium text-gray-900">{formatINR(held)}</span> — settle it from the Deposits tab after move-out.
                  </p>
                )}
              </div>
            </div>
          )}
          <Field label="Move-out date" required htmlFor="mo-date" error={formState.errors.move_out_date?.message} hint={`Moved in ${formatDate(stay.move_in_date)}.`}>
            <Input id="mo-date" type="date" min={stay.move_in_date} {...register('move_out_date')} />
          </Field>
          <Field label="Notes" htmlFor="mo-notes">
            <Textarea id="mo-notes" rows={2} placeholder="Optional — reason, condition of room…" {...register('notes')} />
          </Field>
          <InlineError error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Change rent
// ---------------------------------------------------------------------------
export function ChangeRentDialog({ open, onOpenChange, stay }: { open: boolean; onOpenChange: (o: boolean) => void; stay: Stay }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const current = stay.agreements.find((a) => a.effective_to === null);
  const form = useZodForm(changeRentSchema, {
    defaultValues: { monthly_rent: current ? paiseToRupeesInput(current.monthly_rent_paise) : '', effective_from: todayISO().slice(0, 8) + '01', note: '' },
  });
  const { register, handleSubmit, formState } = form;
  const mutation = useTenantMutation(tenantId, (v: { monthly_rent: string; effective_from: string; note?: string }) =>
    data.changeRent(stay.id, rupeesToPaise(v.monthly_rent)!, v.effective_from, blankToNull(v.note)),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="Change monthly rent"
        description="Creates a new rent agreement from the chosen date. Past agreements and bills are kept exactly as they were."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              onClick={handleSubmit((v) =>
                mutation.mutate(v as never, {
                  onSuccess: () => {
                    toast.success('Rent updated');
                    onOpenChange(false);
                  },
                }),
              )}
            >
              Save new rent
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {current && (
            <p className="text-[13px] text-gray-600">
              Current rent: <span className="tabular font-medium text-gray-900">{formatINR(current.monthly_rent_paise)}</span> since {formatDate(current.effective_from)}
            </p>
          )}
          <Field label="New monthly rent" required htmlFor="cr-rent" error={formState.errors.monthly_rent?.message}>
            <MoneyInput id="cr-rent" autoFocus {...register('monthly_rent')} />
          </Field>
          <Field label="Effective from" required htmlFor="cr-from" error={formState.errors.effective_from?.message}>
            <Input id="cr-from" type="date" min={current?.effective_from} {...register('effective_from')} />
          </Field>
          <Field label="Reason" htmlFor="cr-note">
            <Input id="cr-note" placeholder="e.g. Annual revision" {...register('note')} />
          </Field>
          <InlineError error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Resident app login (create / reset password / remove)
// ---------------------------------------------------------------------------
export type AppLoginMode = 'create' | 'reset' | 'revoke';

export function ResidentAppLoginDialog({
  open,
  onOpenChange,
  resident,
  mode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  resident: ResidentDetail;
  mode: AppLoginMode;
}) {
  const { tenantId } = useCurrentWorkspace();
  const { residentAccess } = useBackend();
  const [email, setEmail] = useState(resident.email ?? '');
  const [password, setPassword] = useState(generateResidentPassword);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);
  const loginEmail = resident.email ?? email;

  const mutation = useTenantMutation(tenantId, async () => {
    if (!residentAccess) throw new AppError('not_supported', 'Resident app logins are not available in this app.');
    if (mode === 'revoke') return residentAccess.revoke(resident.id);
    if (password.trim().length < 8) throw new AppError('validation', 'Password must be at least 8 characters.');
    if (mode === 'reset') {
      await residentAccess.resetPassword(resident.id, password.trim());
      setDone({ email: loginEmail, password: password.trim() });
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new AppError('validation', 'Enter a valid email address.');
    const res = await residentAccess.create(resident.id, email.trim(), password.trim());
    setDone({ email: res.email, password: password.trim() });
  });

  useEffect(() => {
    if (open) {
      setDone(null);
      setEmail(resident.email ?? '');
      setPassword(generateResidentPassword());
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shareText = done
    ? `Hi ${resident.full_name.split(' ')[0]}, your PG Sathi app login:\nEmail: ${done.email}\nPassword: ${done.password}\nInstall the PG Sathi app and sign in to see your room, rent and receipts.`
    : '';
  const phone = (resident.phone ?? '').replace(/\D/g, '');
  const waNumber = phone.length === 10 ? `91${phone}` : phone;

  const title = mode === 'create' ? 'Give app login' : mode === 'reset' ? 'Reset app password' : 'Remove app access';
  const description =
    mode === 'create'
      ? `${resident.full_name} can then sign in to the PG Sathi app to see their room, rent due, bills and receipts. No sign-up needed.`
      : mode === 'reset'
        ? `Sets a new password for ${loginEmail}. The old password stops working.`
        : `${resident.full_name} will no longer see this PG in the app. Their records here are not affected.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={title}
        description={done ? undefined : description}
        footer={
          done ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant={mode === 'revoke' ? 'danger' : 'primary'}
                loading={mutation.isPending}
                onClick={() =>
                  mutation.mutate(undefined, {
                    onSuccess: () => {
                      if (mode === 'revoke') {
                        toast.success('App access removed');
                        onOpenChange(false);
                      }
                    },
                  })
                }
              >
                {mode === 'create' ? 'Create login' : mode === 'reset' ? 'Set new password' : 'Remove access'}
              </Button>
            </>
          )
        }
      >
        {done ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-[13px] font-medium text-success-700">
              <CheckCircle2 className="size-4" /> {mode === 'create' ? 'Login created' : 'Password updated'}
            </p>
            <dl className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-25 p-3 text-[13px]">
              <div className="flex gap-3">
                <dt className="w-20 text-gray-500">Email</dt>
                <dd className="font-mono text-gray-900">{done.email}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 text-gray-500">Password</dt>
                <dd className="font-mono text-gray-900">{done.password}</dd>
              </div>
            </dl>
            <p className="text-xs text-gray-500">Share these with {resident.full_name} privately. The password isn’t shown again, but you can reset it any time.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(shareText);
                  toast.success('Login details copied');
                }}
              >
                <Copy /> Copy details
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                  <Send /> Share on WhatsApp
                </a>
              </Button>
            </div>
          </div>
        ) : mode === 'revoke' ? (
          <InlineError error={mutation.error} />
        ) : (
          <div className="space-y-4">
            {mode === 'create' ? (
              <Field label="Resident’s email (their username)" htmlFor="al-email" required>
                <Input id="al-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </Field>
            ) : (
              <p className="text-[13px] text-gray-600">
                Login email: <span className="font-medium text-gray-900">{loginEmail || '—'}</span>
              </p>
            )}
            <Field label="Password" htmlFor="al-pass" hint="A strong password is generated for you. You can change it." required>
              <div className="flex gap-2">
                <Input id="al-pass" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button variant="secondary" size="icon" aria-label="Generate another password" onClick={() => setPassword(generateResidentPassword())}>
                  <RefreshCw />
                </Button>
              </div>
            </Field>
            <InlineError error={mutation.error} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
