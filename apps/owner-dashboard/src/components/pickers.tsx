import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { formatINR, formatMonth, startOfMonthISO, todayISO, type ISODate, type Room } from '@pg/shared';
import { useProperties, useResident, useResidents, useRooms } from '@pg/api-client/react';
import { cn } from '@pg/ui-web/utils';
import { Input, Select } from '@pg/ui-web/ui/form-controls';
import { Popover, PopoverContent, PopoverTrigger } from '@pg/ui-web/ui/overlays';
import { Avatar } from '@pg/ui-web/ui/surfaces';

/** Searchable resident picker backed by the server-side resident search. */
export function ResidentPicker({
  tenantId,
  value,
  onChange,
  invalid,
  status = 'current',
  id,
}: {
  tenantId: string;
  value: string;
  onChange: (residentId: string, label: string) => void;
  invalid?: boolean;
  status?: 'current' | 'all' | 'active';
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const residents = useResidents(tenantId, { search: search || undefined, status, limit: 30 });
  const selected = useResident(tenantId, value || null);
  const listed = residents.data?.rows.find((r) => r.id === value);
  const activeStay = selected.data?.stays.find((s) => s.status === 'active');
  const selectedRow = value
    ? (listed ?? (selected.data ? { full_name: selected.data.full_name, stay: activeStay ? { room_name: activeStay.room_name, bed_label: activeStay.bed_label } : null } : undefined))
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-left text-sm shadow-xs hover:border-gray-300 focus-visible:border-accent-600 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent-100',
            invalid && 'border-danger-600',
          )}
        >
          {selectedRow ? (
            <>
              <span className="truncate font-medium text-gray-900">{selectedRow.full_name}</span>
              {selectedRow.stay && (
                <span className="truncate text-xs text-gray-500">
                  · {selectedRow.stay.room_name}/{selectedRow.stay.bed_label}
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400">Choose a resident</span>
          )}
          <ChevronDown className="ml-auto size-4 shrink-0 text-gray-400" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-2">
        <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or room" leading={<Search />} aria-label="Search residents" />
        <ul className="mt-2 max-h-64 overflow-y-auto" role="listbox">
          {residents.isPending && <li className="px-2 py-3 text-[13px] text-gray-500">Searching…</li>}
          {residents.data?.rows.length === 0 && <li className="px-2 py-3 text-[13px] text-gray-500">No residents found</li>}
          {residents.data?.rows.map((r) => (
            <li key={r.id} role="option" aria-selected={r.id === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(r.id, r.full_name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-gray-50"
              >
                <Avatar name={r.full_name} className="size-7 text-[11px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-gray-900">{r.full_name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {r.stay ? `${r.stay.property_name} · ${r.stay.room_name}/${r.stay.bed_label}` : (r.phone ?? 'No bed assigned')}
                  </span>
                </span>
                {r.outstanding_paise ? <span className="tabular text-xs font-medium text-danger-600">{formatINR(r.outstanding_paise)}</span> : null}
                {r.id === value && <Check className="size-4 text-accent-600" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Native select of beds grouped by property and room; vacant beds by default. */
export function BedPicker({
  tenantId,
  value,
  onChange,
  onlyVacant = true,
  excludeBedId,
  invalid,
  id,
}: {
  tenantId: string;
  value: string;
  onChange: (bedId: string, bed: { suggestedRent: number; deposit: number; room: Room } | null) => void;
  onlyVacant?: boolean;
  excludeBedId?: string;
  invalid?: boolean;
  id?: string;
}) {
  const rooms = useRooms(tenantId);
  const groups = useMemo(() => {
    const byProperty = new Map<string, { name: string; rooms: Room[] }>();
    for (const room of rooms.data ?? []) {
      if (!room.is_active) continue;
      const g = byProperty.get(room.property_id) ?? { name: room.property_name, rooms: [] };
      g.rooms.push(room);
      byProperty.set(room.property_id, g);
    }
    return [...byProperty.values()];
  }, [rooms.data]);

  const vacantCount = (rooms.data ?? []).reduce((n, r) => n + r.beds.filter((b) => b.status === 'vacant').length, 0);

  return (
    <Select
      id={id}
      value={value}
      aria-invalid={invalid || undefined}
      disabled={rooms.isPending}
      onChange={(e) => {
        const bedId = e.target.value;
        const room = rooms.data?.find((r) => r.beds.some((b) => b.id === bedId));
        const bed = room?.beds.find((b) => b.id === bedId);
        onChange(bedId, room && bed ? { suggestedRent: bed.suggested_rent_paise, deposit: room.deposit_paise, room } : null);
      }}
    >
      <option value="">{rooms.isPending ? 'Loading beds…' : vacantCount === 0 && onlyVacant ? 'No vacant beds — add rooms first' : 'Choose a bed'}</option>
      {groups.map((g) => (
        <optgroup key={g.name} label={g.name}>
          {g.rooms.flatMap((room) =>
            room.beds
              .filter((b) => (!onlyVacant || b.status === 'vacant') && b.id !== excludeBedId)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  Room {room.name} · Bed {b.label}
                  {room.category ? ` · ${room.category}` : ''} · {formatINR(b.suggested_rent_paise)}/mo
                </option>
              )),
          )}
        </optgroup>
      ))}
    </Select>
  );
}

export function PropertySelect({
  tenantId,
  value,
  onChange,
  allowAll = true,
  allLabel = 'All properties',
  id,
  className,
}: {
  tenantId: string;
  value: string | null;
  onChange: (propertyId: string | null) => void;
  allowAll?: boolean;
  allLabel?: string;
  id?: string;
  className?: string;
}) {
  const properties = useProperties(tenantId);
  return (
    <Select id={id} className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Property">
      {allowAll && <option value="">{allLabel}</option>}
      {(properties.data ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}

/** Month picker that works with first-of-month ISO dates. */
export function MonthInput({ value, onChange, className, label = 'Month' }: { value: ISODate; onChange: (month: ISODate) => void; className?: string; label?: string }) {
  return (
    <Input
      type="month"
      aria-label={label}
      className={cn('w-44', className)}
      value={value.slice(0, 7)}
      onChange={(e) => e.target.value && onChange(`${e.target.value}-01`)}
      title={formatMonth(value)}
    />
  );
}

export function currentMonth(): ISODate {
  return startOfMonthISO(todayISO());
}
