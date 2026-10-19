import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Archive, ArrowLeft, BedDouble, Building2, MapPin, MoreHorizontal, Pencil, Phone, Plus, RotateCcw } from 'lucide-react';
import { useBackend, useDashboard, useProperties, useProperty, useRooms, useTenantMutation } from '@pg/api-client/react';
import { GENDER_POLICY_LABELS, PROPERTY_TYPE_LABELS, formatINR, occupancyRate, type Property } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Badge, Card, CardBody, CardHeader, Progress, Skeleton } from '@pg/ui-web/ui/surfaces';
import { Menu, MenuContent, MenuItem, MenuTrigger, Segmented } from '@pg/ui-web/ui/overlays';
import { ConfirmDialog, EmptyState, ErrorState, KeyValue, Money, PageHeader, StatCard } from '@pg/ui-web/common';
import { useDialogs } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';
import { PropertyFormDialog } from './property-form-dialog';

function address(p: Pick<Property, 'address_line1' | 'locality' | 'city' | 'state' | 'postal_code'>) {
  return [p.address_line1, p.locality, p.city, p.state, p.postal_code].filter(Boolean).join(', ');
}

export function PropertiesPage() {
  const { tenantId, can } = useCurrentWorkspace();
  const open = useDialogs((s) => s.open);
  const [view, setView] = useState<'active' | 'all'>('active');
  const properties = useProperties(tenantId, view === 'all');

  return (
    <div>
      <PageHeader
        title="Properties"
        description="Each property has its own rooms, residents and rent figures."
        actions={
          <>
            <Segmented label="Show" value={view} onChange={setView} options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'Include archived' }]} />
            {can('properties.write') && (
              <Button onClick={() => open({ kind: 'add-property' })}>
                <Plus /> Add property
              </Button>
            )}
          </>
        }
      />
      {properties.isError ? (
        <ErrorState error={properties.error} onRetry={() => void properties.refetch()} />
      ) : properties.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : properties.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No properties yet"
            description="Add your first PG, hostel or co-living property to start adding rooms and residents."
            action={can('properties.write') ? <Button onClick={() => open({ kind: 'add-property' })}><Plus /> Add property</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {properties.data.map((p) => {
            const usable = p.bed_count - p.unavailable_count;
            const rate = occupancyRate(p.occupied_count, p.bed_count, p.unavailable_count);
            return (
              <Link key={p.id} to={`/app/properties/${p.id}`} className="group min-w-0">
                <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-navy-900 text-white">
                      <Building2 className="size-5" aria-hidden />
                    </span>
                    <div className="flex gap-1.5">
                      <Badge>{PROPERTY_TYPE_LABELS[p.property_type]}</Badge>
                      {p.status === 'archived' && <Badge tone="warning">Archived</Badge>}
                    </div>
                  </div>
                  <h2 className="mt-4 truncate text-[15px] font-semibold text-gray-900 group-hover:text-accent-700">{p.name}</h2>
                  <p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    {address(p) || 'No address added'}
                  </p>
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'Rooms', value: p.room_count },
                      { label: 'Beds', value: p.bed_count },
                      { label: 'Vacant', value: Math.max(usable - p.occupied_count, 0) },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg bg-gray-25 py-2 ring-1 ring-gray-100">
                        <p className="tabular text-base font-semibold text-gray-900">{s.value}</p>
                        <p className="text-xs text-gray-500">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs text-gray-500">
                      <span>Occupancy</span>
                      <span className="tabular font-medium text-gray-700">{rate}%</span>
                    </div>
                    <Progress value={rate} tone={rate >= 90 ? 'success' : 'accent'} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PropertyDetailPage() {
  const { propertyId = '' } = useParams();
  const { tenantId, can } = useCurrentWorkspace();
  const { data } = useBackend();
  const open = useDialogs((s) => s.open);
  const property = useProperty(tenantId, propertyId);
  const rooms = useRooms(tenantId, propertyId);
  const dash = useDashboard(tenantId, propertyId);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const archive = useTenantMutation(tenantId, (archived: boolean) => data.setPropertyArchived(propertyId, archived));

  if (property.isError) return <ErrorState error={property.error} onRetry={() => void property.refetch()} />;
  if (property.isPending) return <Skeleton className="h-64 rounded-xl" />;
  const p = property.data;
  const rate = occupancyRate(p.occupied_count, p.bed_count, p.unavailable_count);
  const f = dash.data?.finance;

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link to="/app/properties" className="inline-flex items-center gap-1 hover:text-gray-900">
            <ArrowLeft className="size-3.5" /> Properties
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            {p.name}
            {p.status === 'archived' && <Badge tone="warning">Archived</Badge>}
          </span>
        }
        description={address(p) || undefined}
        actions={
          can('properties.write') && (
            <>
              <Button variant="secondary" onClick={() => open({ kind: 'add-rooms', propertyId })}>
                <Plus /> Add rooms
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              {can('workspace.manage') && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More actions">
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    {p.status === 'active' ? (
                      <MenuItem destructive onSelect={() => setArchiving(true)}>
                        <Archive /> Archive property
                      </MenuItem>
                    ) : (
                      <MenuItem onSelect={() => archive.mutate(false, { onSuccess: () => toast.success('Property restored') })}>
                        <RotateCcw /> Restore property
                      </MenuItem>
                    )}
                  </MenuContent>
                </Menu>
              )}
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Occupancy" icon={BedDouble} tone="accent" value={`${rate}%`} footer={`${p.occupied_count} of ${p.bed_count - p.unavailable_count} usable beds`} />
        <StatCard label="Rooms / beds" value={`${p.room_count} / ${p.bed_count}`} footer={p.unavailable_count ? `${p.unavailable_count} unavailable` : 'All beds available'} />
        {f && <StatCard label="Collected this month" tone="success" value={<Money paise={f.collected_paise} />} footer={`Billed ${formatINR(f.billed_paise)}`} />}
        {f && <StatCard label="Outstanding" tone={f.overdue_paise ? 'danger' : 'default'} value={<Money paise={f.outstanding_paise} />} footer={f.overdue_paise ? `${formatINR(f.overdue_paise)} overdue` : 'Nothing overdue'} />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title="Rooms"
            description={`${p.room_count} rooms`}
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/app/rooms">Manage beds</Link>
              </Button>
            }
          />
          {rooms.isPending ? (
            <div className="p-5">
              <Skeleton className="h-24" />
            </div>
          ) : (rooms.data ?? []).length === 0 ? (
            <EmptyState compact icon={BedDouble} title="No rooms yet" action={can('properties.write') ? <Button size="sm" onClick={() => open({ kind: 'add-rooms', propertyId })}>Add rooms</Button> : undefined} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {rooms.data!.map((r) => {
                const occupied = r.beds.filter((b) => b.status === 'occupied').length;
                return (
                  <li key={r.id} className="flex items-center gap-4 px-5 py-3 text-[13px]">
                    <span className="w-16 font-semibold text-gray-900">{r.name}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-500">
                      {[r.floor, r.category].filter(Boolean).join(' · ') || '—'}
                      {!r.is_active && <Badge className="ml-2">Inactive</Badge>}
                    </span>
                    <span className="flex gap-1" aria-label={`${occupied} of ${r.beds.length} beds occupied`}>
                      {r.beds.map((b) => (
                        <span key={b.id} className={`size-2.5 rounded-sm ${b.status === 'occupied' ? 'bg-accent-600' : b.status === 'unavailable' ? 'bg-warning-600' : 'bg-gray-200'}`} />
                      ))}
                    </span>
                    <span className="tabular w-24 text-right text-gray-700">
                      {formatINR(r.rent_paise)}
                      <span className="text-xs text-gray-400">/{r.rent_mode === 'per_bed' ? 'bed' : 'room'}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4">
                <KeyValue label="Type">{PROPERTY_TYPE_LABELS[p.property_type]}</KeyValue>
                <KeyValue label="Who can stay">{GENDER_POLICY_LABELS[p.gender_policy]}</KeyValue>
                <KeyValue label="Phone">
                  {p.contact_phone ? (
                    <a href={`tel:${p.contact_phone}`} className="inline-flex items-center gap-1 text-accent-700 hover:underline">
                      <Phone className="size-3" /> {p.contact_phone}
                    </a>
                  ) : null}
                </KeyValue>
                <KeyValue label="Notice period">{p.settings ? `${p.settings.notice_period_days} days` : null}</KeyValue>
              </dl>
              {p.description && <p className="mt-4 text-[13px] leading-relaxed text-gray-600">{p.description}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Facilities" />
            <CardBody className="flex flex-wrap gap-1.5">
              {p.facilities.length === 0 ? <p className="text-[13px] text-gray-500">None listed</p> : p.facilities.map((f2) => <Badge key={f2}>{f2}</Badge>)}
            </CardBody>
          </Card>
        </div>
      </div>

      <PropertyFormDialog open={editing} onOpenChange={setEditing} property={p} />
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Archive this property?"
        description="Archived properties are hidden from day-to-day lists. All history is kept, and you can restore it any time. Residents must be moved out first."
        confirmLabel="Archive"
        destructive
        onConfirm={() => archive.mutateAsync(true).then(() => toast.success('Property archived'))}
      />
    </div>
  );
}
