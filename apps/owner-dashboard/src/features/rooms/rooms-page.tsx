import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Ban, BedDouble, CheckCircle2, LayoutGrid, MoreHorizontal, Pencil, Plus, Rows3, Trash2, User, UserPlus } from 'lucide-react';
import { useBackend, useRooms, useTenantMutation } from '@pg/api-client/react';
import { RENT_MODE_LABELS, formatINR, paiseToRupeesInput, rupeesToPaise, type Bed, type Room } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Input, Select } from '@pg/ui-web/ui/form-controls';
import { Badge, Card, Skeleton } from '@pg/ui-web/ui/surfaces';
import { Dialog, DialogContent, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Segmented } from '@pg/ui-web/ui/overlays';
import { Table, TBody, TD, TH, THead, TR } from '@pg/ui-web/ui/table';
import { BedStatusBadge, ConfirmDialog, EmptyState, ErrorState, Field, InlineError, PageHeader } from '@pg/ui-web/common';
import { useDialogs } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';
import { cn } from '@pg/ui-web/utils';
import { EditRoomDialog } from './room-dialogs';

type StatusFilter = 'all' | 'vacant' | 'occupied' | 'unavailable';

export function RoomsPage() {
  const { tenantId, propertyId, can } = useCurrentWorkspace();
  const open = useDialogs((s) => s.open);
  const rooms = useRooms(tenantId, propertyId);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [floor, setFloor] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const floors = useMemo(() => [...new Set((rooms.data ?? []).map((r) => r.floor).filter(Boolean) as string[])], [rooms.data]);
  const filtered = useMemo(
    () =>
      (rooms.data ?? []).filter(
        (r) =>
          (!floor || r.floor === floor) &&
          (status === 'all' || r.beds.some((b) => b.status === status)) &&
          (!search ||
            r.name.toLowerCase().includes(search.toLowerCase()) ||
            r.beds.some((b) => b.occupant?.full_name.toLowerCase().includes(search.toLowerCase()))),
      ),
    [rooms.data, floor, status, search],
  );
  const allBeds = (rooms.data ?? []).flatMap((r) => r.beds);
  const counts = {
    all: allBeds.length,
    vacant: allBeds.filter((b) => b.status === 'vacant').length,
    occupied: allBeds.filter((b) => b.status === 'occupied').length,
    unavailable: allBeds.filter((b) => b.status === 'unavailable').length,
  };
  const multiProperty = new Set((rooms.data ?? []).map((r) => r.property_id)).size > 1;

  return (
    <div>
      <PageHeader
        title="Rooms & beds"
        description="Every bed is tracked individually. Click a bed to assign, view or update it."
        actions={
          can('properties.write') && (
            <Button onClick={() => open({ kind: 'add-rooms', propertyId: propertyId ?? undefined })}>
              <Plus /> Add rooms
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Bed status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All beds', count: counts.all },
            { value: 'vacant', label: 'Vacant', count: counts.vacant },
            { value: 'occupied', label: 'Occupied', count: counts.occupied },
            { value: 'unavailable', label: 'Unavailable', count: counts.unavailable },
          ]}
        />
        {floors.length > 1 && (
          <Select value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="Floor" className="h-8 w-36 text-[13px]">
            <option value="">All floors</option>
            {floors.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        )}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Room or resident" aria-label="Search rooms" className="h-8 w-48 text-[13px]" type="search" />
        <div className="ml-auto">
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: <LayoutGrid className="size-4" aria-label="Grid view" /> },
              { value: 'table', label: <Rows3 className="size-4" aria-label="Table view" /> },
            ]}
          />
        </div>
      </div>

      {rooms.isError ? (
        <ErrorState error={rooms.error} onRetry={() => void rooms.refetch()} />
      ) : rooms.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (rooms.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={BedDouble}
            title="No rooms yet"
            description="Add rooms with their number of beds. You can add a whole floor at once."
            action={can('properties.write') ? <Button onClick={() => open({ kind: 'add-rooms', propertyId: propertyId ?? undefined })}><Plus /> Add rooms</Button> : undefined}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState compact icon={BedDouble} title="No rooms match these filters" />
        </Card>
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((room) => (
            <RoomCard key={room.id} room={room} showProperty={multiProperty} highlight={status} />
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Room</TH>
                {multiProperty && <TH>Property</TH>}
                <TH>Bed</TH>
                <TH>Status</TH>
                <TH>Resident</TH>
                <TH align="right">Rent</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.flatMap((room) =>
                room.beds
                  .filter((b) => status === 'all' || b.status === status)
                  .map((b) => (
                    <TR key={b.id} className="hover:bg-gray-25">
                      <TD className="font-medium text-gray-900">
                        {room.name}
                        {room.floor && <span className="ml-1.5 text-xs font-normal text-gray-400">{room.floor}</span>}
                      </TD>
                      {multiProperty && <TD>{room.property_name}</TD>}
                      <TD>{b.label}</TD>
                      <TD>
                        <BedStatusBadge status={b.status} />
                      </TD>
                      <TD>
                        {b.occupant ? (
                          <Link to={`/app/residents/${b.occupant.resident_id}`} className="font-medium text-gray-900 hover:underline">
                            {b.occupant.full_name}
                          </Link>
                        ) : (
                          (b.unavailable_reason ?? '—')
                        )}
                      </TD>
                      <TD numeric>{formatINR(b.suggested_rent_paise)}</TD>
                    </TR>
                  )),
              )}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function RoomCard({ room, showProperty, highlight }: { room: Room; showProperty: boolean; highlight: StatusFilter }) {
  const { tenantId, can } = useCurrentWorkspace();
  const { data } = useBackend();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const addBed = useTenantMutation(tenantId, () => data.addBeds(room.id, 1));
  const remove = useTenantMutation(tenantId, () => data.deleteRoom(room.id));
  const occupied = room.beds.filter((b) => b.status === 'occupied').length;

  return (
    <Card className={cn('flex flex-col', !room.is_active && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-gray-900">Room {room.name}</h3>
            {!room.is_active && <Badge>Inactive</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">{[showProperty ? room.property_name : null, room.floor, room.category].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        {can('properties.write') && (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Room ${room.name} actions`}>
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => setEditing(true)}>
                <Pencil /> Edit room
              </MenuItem>
              <MenuItem disabled={room.beds.length >= 30} onSelect={() => addBed.mutate(undefined, { onSuccess: () => toast.success('Bed added'), onError: (e) => toast.error(e.message) })}>
                <Plus /> Add a bed
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive onSelect={() => setDeleting(true)}>
                <Trash2 /> Delete room
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2 p-4 sm:grid-cols-3">
        {room.beds.map((bed) => (
          <BedTile key={bed.id} bed={bed} room={room} dim={highlight !== 'all' && bed.status !== highlight} />
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
        <span>
          {occupied}/{room.beds.length} occupied
        </span>
        <span className="tabular">
          {formatINR(room.rent_paise)} · {RENT_MODE_LABELS[room.rent_mode].toLowerCase()}
        </span>
      </div>
      <EditRoomDialog open={editing} onOpenChange={setEditing} room={room} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete room ${room.name}?`}
        description="This removes the room and its beds. Rooms with any stay history can’t be deleted — mark them inactive instead."
        confirmLabel="Delete room"
        destructive
        onConfirm={() => remove.mutateAsync().then(() => toast.success('Room deleted'))}
      />
    </Card>
  );
}

function BedTile({ bed, room, dim }: { bed: Bed; room: Room; dim: boolean }) {
  const { tenantId, can } = useCurrentWorkspace();
  const { data } = useBackend();
  const open = useDialogs((s) => s.open);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const update = useTenantMutation(tenantId, (patch: Parameters<typeof data.updateBed>[1]) => data.updateBed(bed.id, patch));
  const remove = useTenantMutation(tenantId, () => data.deleteBed(bed.id));

  const style = {
    vacant: 'border-dashed border-success-600/40 bg-success-50/60 hover:border-success-600',
    occupied: 'border-accent-200 bg-accent-50 hover:border-accent-500',
    unavailable: 'border-warning-100 bg-warning-50 hover:border-warning-600',
  }[bed.status];

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            className={cn('flex min-h-16 flex-col items-start rounded-lg border p-2.5 text-left transition-[border-color,opacity]', style, dim && 'opacity-35')}
            aria-label={`Bed ${bed.label}, ${bed.status}${bed.occupant ? `, ${bed.occupant.full_name}` : ''}`}
          >
            <span className="flex w-full items-center justify-between text-xs font-semibold text-gray-700">
              Bed {bed.label}
              {bed.status === 'occupied' ? <User className="size-3.5 text-accent-600" /> : bed.status === 'vacant' ? <CheckCircle2 className="size-3.5 text-success-600" /> : <Ban className="size-3.5 text-warning-600" />}
            </span>
            <span className="mt-1 line-clamp-1 text-xs text-gray-600">
              {bed.occupant?.full_name ?? (bed.status === 'vacant' ? 'Vacant' : (bed.unavailable_reason ?? 'Unavailable'))}
            </span>
          </button>
        </MenuTrigger>
        <MenuContent align="start">
          {bed.occupant ? (
            <MenuItem asChild>
              <Link to={`/app/residents/${bed.occupant.resident_id}`}>
                <User /> View {bed.occupant.full_name.split(' ')[0]}
              </Link>
            </MenuItem>
          ) : bed.status === 'vacant' && can('residents.write') ? (
            <MenuItem onSelect={() => open({ kind: 'assign-bed', bedId: bed.id })}>
              <UserPlus /> Assign a resident
            </MenuItem>
          ) : null}
          {can('properties.write') && (
            <>
              <MenuItem onSelect={() => setEditing(true)}>
                <Pencil /> Edit label or rent
              </MenuItem>
              {bed.status === 'vacant' && (
                <MenuItem onSelect={() => update.mutate({ is_unavailable: true, unavailable_reason: 'Unavailable' }, { onSuccess: () => toast.success('Bed marked unavailable') })}>
                  <Ban /> Mark unavailable
                </MenuItem>
              )}
              {bed.status === 'unavailable' && (
                <MenuItem onSelect={() => update.mutate({ is_unavailable: false }, { onSuccess: () => toast.success('Bed is available again') })}>
                  <CheckCircle2 /> Mark available
                </MenuItem>
              )}
              {bed.status !== 'occupied' && (
                <>
                  <MenuSeparator />
                  <MenuItem destructive onSelect={() => setDeleting(true)}>
                    <Trash2 /> Delete bed
                  </MenuItem>
                </>
              )}
            </>
          )}
        </MenuContent>
      </Menu>
      <EditBedDialog open={editing} onOpenChange={setEditing} bed={bed} room={room} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete bed ${bed.label}?`}
        description="Beds with stay history can’t be deleted — mark them unavailable instead."
        confirmLabel="Delete bed"
        destructive
        onConfirm={() => remove.mutateAsync().then(() => toast.success('Bed deleted'))}
      />
    </>
  );
}

function EditBedDialog({ open, onOpenChange, bed, room }: { open: boolean; onOpenChange: (o: boolean) => void; bed: Bed; room: Room }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const [label, setLabel] = useState(bed.label);
  const [rent, setRent] = useState(paiseToRupeesInput(bed.rent_paise));
  const [reason, setReason] = useState(bed.unavailable_reason ?? '');
  const mutation = useTenantMutation(tenantId, async () => {
    const trimmed = rent.trim();
    const paise = trimmed === '' ? null : rupeesToPaise(trimmed);
    if (trimmed !== '' && paise === null) throw Object.assign(new Error('Enter a valid rent'), { hint: 'validation', message: 'Enter a valid rent' });
    return data.updateBed(bed.id, { label: label.trim(), rent_paise: paise, ...(bed.is_unavailable ? { unavailable_reason: reason.trim() || null } : {}) });
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={`Room ${room.name} · Bed ${bed.label}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button loading={mutation.isPending} onClick={() => mutation.mutate(undefined, { onSuccess: () => { toast.success('Bed updated'); onOpenChange(false); } })}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Bed label" htmlFor="eb-label">
            <Input id="eb-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Rent override" htmlFor="eb-rent" hint={`Leave blank to use the room rate (${formatINR(bed.suggested_rent_paise)}). Affects new assignments only.`}>
            <Input id="eb-rent" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} leading={<span className="text-sm text-gray-500">₹</span>} />
          </Field>
          {bed.is_unavailable && (
            <Field label="Why is it unavailable?" htmlFor="eb-reason">
              <Input id="eb-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          <InlineError error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
