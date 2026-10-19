import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useBackend, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import { formatINR, paiseToRupeesInput, rupeesToPaise, type RentMode, type Room } from '@pg/shared';
import { roomBatchSchema, roomSchema, toPaise } from '@pg/validation';
import { Button } from '@pg/ui-web/ui/button';
import { Input, MoneyInput, Select, Switch, Textarea } from '@pg/ui-web/ui/form-controls';
import { Dialog, DialogContent, Segmented } from '@pg/ui-web/ui/overlays';
import { Field, InlineError } from '@pg/ui-web/common';
import { PropertySelect } from '@/components/pickers';
import { useCurrentWorkspace } from '@/app/workspace';
import { useZodForm } from '@/lib/form';

export function AddRoomsDialog({ open, onOpenChange, propertyId: preset }: { open: boolean; onOpenChange: (o: boolean) => void; propertyId?: string }) {
  const { tenantId, propertyId: selected } = useCurrentWorkspace();
  const { data } = useBackend();
  const workspace = useWorkspace(tenantId);
  const [propertyId, setPropertyId] = useState<string | null>(preset ?? selected);
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const defaultMode: RentMode = workspace.data?.settings.default_rent_mode ?? 'per_bed';

  const single = useZodForm(roomSchema, {
    defaultValues: { name: '', floor: '', category: '', rent_mode: defaultMode, rent: '', deposit: '', bed_count: 2 },
  });
  const batch = useZodForm(roomBatchSchema, {
    defaultValues: { prefix: '', start: 101, count: 5, floor: '', category: '', bed_count: 2, rent_mode: defaultMode, rent: '', deposit: '' },
  });

  useEffect(() => {
    if (open) {
      setPropertyId(preset ?? selected);
      single.reset({ name: '', floor: '', category: '', rent_mode: defaultMode, rent: '', deposit: '', bed_count: 2 });
      batch.reset({ prefix: '', start: 101, count: 5, floor: '', category: '', bed_count: 2, rent_mode: defaultMode, rent: '', deposit: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useTenantMutation(tenantId, (rooms: Parameters<typeof data.createRooms>[1]) => {
    if (!propertyId) throw Object.assign(new Error('Choose a property'), { hint: 'validation', message: 'Choose a property' });
    return data.createRooms(propertyId, rooms);
  });

  const submit = mode === 'single'
    ? single.handleSubmit((v) =>
        mutation.mutate(
          [{ name: v.name.trim(), floor: v.floor || null, category: v.category || null, rent_mode: v.rent_mode, rent_paise: rupeesToPaise(v.rent)!, deposit_paise: toPaise(v.deposit) ?? 0, bed_count: v.bed_count }],
          { onSuccess: () => { toast.success(`Room ${v.name} added with ${v.bed_count} beds`); onOpenChange(false); } },
        ),
      )
    : batch.handleSubmit((v) =>
        mutation.mutate(
          Array.from({ length: v.count }, (_, i) => ({
            name: `${v.prefix ?? ''}${v.start + i}`,
            floor: v.floor || null,
            category: v.category || null,
            rent_mode: v.rent_mode,
            rent_paise: rupeesToPaise(v.rent)!,
            deposit_paise: toPaise(v.deposit) ?? 0,
            bed_count: v.bed_count,
          })),
          { onSuccess: () => { toast.success(`${v.count} rooms added`); onOpenChange(false); } },
        ),
      );

  const bv = batch.watch();
  const preview = mode === 'batch' && Number(bv.count) > 0 ? `${bv.prefix ?? ''}${bv.start} … ${bv.prefix ?? ''}${Number(bv.start) + Number(bv.count) - 1}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title="Add rooms"
        description="Beds are created automatically and labelled A, B, C… You can rename them later."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={mutation.isPending}>
              {mode === 'single' ? 'Add room' : `Add ${bv.count || ''} rooms`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Field label="Property" htmlFor="ar-prop" className="w-full sm:w-72">
              <PropertySelect id="ar-prop" tenantId={tenantId} value={propertyId} onChange={setPropertyId} allowAll={false} />
            </Field>
            <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: 'single', label: 'One room' }, { value: 'batch', label: 'Numbered range' }]} />
          </div>

          {mode === 'single' ? (
            <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-3">
              <Field label="Room name / number" required htmlFor="ar-name" error={single.formState.errors.name?.message}>
                <Input id="ar-name" autoFocus {...single.register('name')} />
              </Field>
              <Field label="Floor" htmlFor="ar-floor">
                <Input id="ar-floor" {...single.register('floor')} />
              </Field>
              <Field label="Type" htmlFor="ar-cat">
                <Input id="ar-cat" placeholder="e.g. Double sharing AC" {...single.register('category')} />
              </Field>
              <Field label="Beds" required htmlFor="ar-beds" error={single.formState.errors.bed_count?.message}>
                <Input id="ar-beds" inputMode="numeric" {...single.register('bed_count')} />
              </Field>
              <Field label="Rent charged" htmlFor="ar-mode">
                <Select id="ar-mode" {...single.register('rent_mode')}>
                  <option value="per_bed">Per bed</option>
                  <option value="per_room">Per room</option>
                </Select>
              </Field>
              <Field label="Monthly rent" required htmlFor="ar-rent" error={single.formState.errors.rent?.message}>
                <MoneyInput id="ar-rent" {...single.register('rent')} />
              </Field>
              <Field label="Security deposit" htmlFor="ar-dep" error={single.formState.errors.deposit?.message}>
                <MoneyInput id="ar-dep" {...single.register('deposit')} />
              </Field>
            </form>
          ) : (
            <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-3">
              <Field label="Prefix" htmlFor="ab-prefix" hint="Optional, e.g. A-">
                <Input id="ab-prefix" {...batch.register('prefix')} />
              </Field>
              <Field label="First number" htmlFor="ab-start" error={batch.formState.errors.start?.message}>
                <Input id="ab-start" inputMode="numeric" {...batch.register('start')} />
              </Field>
              <Field label="How many rooms" htmlFor="ab-count" error={batch.formState.errors.count?.message} hint={preview}>
                <Input id="ab-count" inputMode="numeric" {...batch.register('count')} />
              </Field>
              <Field label="Floor" htmlFor="ab-floor">
                <Input id="ab-floor" {...batch.register('floor')} />
              </Field>
              <Field label="Type" htmlFor="ab-cat">
                <Input id="ab-cat" {...batch.register('category')} />
              </Field>
              <Field label="Beds per room" htmlFor="ab-beds" error={batch.formState.errors.bed_count?.message}>
                <Input id="ab-beds" inputMode="numeric" {...batch.register('bed_count')} />
              </Field>
              <Field label="Rent charged" htmlFor="ab-mode">
                <Select id="ab-mode" {...batch.register('rent_mode')}>
                  <option value="per_bed">Per bed</option>
                  <option value="per_room">Per room</option>
                </Select>
              </Field>
              <Field label="Monthly rent" required htmlFor="ab-rent" error={batch.formState.errors.rent?.message}>
                <MoneyInput id="ab-rent" {...batch.register('rent')} />
              </Field>
              <Field label="Security deposit" htmlFor="ab-dep">
                <MoneyInput id="ab-dep" {...batch.register('deposit')} />
              </Field>
            </form>
          )}
          <InlineError error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditRoomDialog({ open, onOpenChange, room }: { open: boolean; onOpenChange: (o: boolean) => void; room: Room }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const [state, setState] = useState({ name: '', floor: '', category: '', rent_mode: 'per_bed' as RentMode, rent: '', deposit: '', notes: '', is_active: true });
  useEffect(() => {
    if (open)
      setState({
        name: room.name,
        floor: room.floor ?? '',
        category: room.category ?? '',
        rent_mode: room.rent_mode,
        rent: paiseToRupeesInput(room.rent_paise),
        deposit: room.deposit_paise ? paiseToRupeesInput(room.deposit_paise) : '',
        notes: room.notes ?? '',
        is_active: room.is_active,
      });
  }, [open, room]);
  const mutation = useTenantMutation(tenantId, () => {
    const rent = rupeesToPaise(state.rent);
    if (rent === null || rent < 0) throw Object.assign(new Error('Enter a valid rent'), { hint: 'validation', message: 'Enter a valid rent' });
    return data.updateRoom(room.id, {
      name: state.name.trim(),
      floor: state.floor || null,
      category: state.category || null,
      rent_mode: state.rent_mode,
      rent_paise: rent,
      deposit_paise: rupeesToPaise(state.deposit) ?? 0,
      notes: state.notes || null,
      is_active: state.is_active,
    });
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Edit room ${room.name}`}
        description="Changing the rent here only affects new assignments. Existing residents keep their agreed rent."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button loading={mutation.isPending} onClick={() => mutation.mutate(undefined, { onSuccess: () => { toast.success('Room updated'); onOpenChange(false); } })}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Room name" htmlFor="er-name">
            <Input id="er-name" value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} />
          </Field>
          <Field label="Floor" htmlFor="er-floor">
            <Input id="er-floor" value={state.floor} onChange={(e) => setState({ ...state, floor: e.target.value })} />
          </Field>
          <Field label="Type" htmlFor="er-cat">
            <Input id="er-cat" value={state.category} onChange={(e) => setState({ ...state, category: e.target.value })} />
          </Field>
          <Field label="Rent charged" htmlFor="er-mode">
            <Select id="er-mode" value={state.rent_mode} onChange={(e) => setState({ ...state, rent_mode: e.target.value as RentMode })}>
              <option value="per_bed">Per bed</option>
              <option value="per_room">Per room</option>
            </Select>
          </Field>
          <Field label="Monthly rent" htmlFor="er-rent" hint={state.rent_mode === 'per_room' ? `Split across ${room.beds.length} beds: ${formatINR(Math.round((rupeesToPaise(state.rent) ?? 0) / Math.max(room.beds.length, 1)))} each` : undefined}>
            <MoneyInput id="er-rent" value={state.rent} onChange={(e) => setState({ ...state, rent: e.target.value })} />
          </Field>
          <Field label="Security deposit" htmlFor="er-dep">
            <MoneyInput id="er-dep" value={state.deposit} onChange={(e) => setState({ ...state, deposit: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="er-notes" className="sm:col-span-2">
            <Textarea id="er-notes" rows={2} value={state.notes} onChange={(e) => setState({ ...state, notes: e.target.value })} />
          </Field>
          <label className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={state.is_active} onCheckedChange={(v) => setState({ ...state, is_active: v })} />
            <span className="text-[13px] text-gray-700">Room is active (inactive rooms are hidden from bed assignment)</span>
          </label>
          <div className="sm:col-span-2">
            <InlineError error={mutation.error} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
