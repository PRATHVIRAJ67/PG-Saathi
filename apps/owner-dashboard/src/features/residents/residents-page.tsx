import { useDeferredValue, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Plus, Users } from 'lucide-react';
import { useResidents } from '@pg/api-client/react';
import { formatDate } from '@pg/shared';
import type { ResidentListParams } from '@pg/api-client';
import { Button } from '@pg/ui-web/ui/button';
import { Select } from '@pg/ui-web/ui/form-controls';
import { Card, Avatar } from '@pg/ui-web/ui/surfaces';
import { Segmented } from '@pg/ui-web/ui/overlays';
import { Table, TBody, TD, TH, THead, TR } from '@pg/ui-web/ui/table';
import { EmptyState, ErrorState, Money, PageHeader, Pagination, ResidentStatusBadge, SearchInput, TableSkeleton } from '@pg/ui-web/common';
import { useDialogs } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';

const PAGE = 25;

export function ResidentsPage() {
  const { tenantId, propertyId, can } = useCurrentWorkspace();
  const open = useDialogs((s) => s.open);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const status = (params.get('status') as ResidentListParams['status']) ?? 'current';
  const sort = (params.get('sort') as ResidentListParams['sort']) ?? 'name';
  const [offset, setOffset] = useState(0);
  const finance = can('finance.read');

  const residents = useResidents(tenantId, { search: deferredSearch.trim() || undefined, status, sort, property_id: propertyId, limit: PAGE, offset });
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setOffset(0);
  };

  return (
    <div>
      <PageHeader
        title="Residents"
        description="Everyone staying with you, past and present."
        actions={
          can('residents.write') && (
            <Button onClick={() => open({ kind: 'add-resident' })}>
              <Plus /> Add resident
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            label="Resident status"
            value={status ?? 'current'}
            onChange={(v) => setParam('status', v)}
            options={[
              { value: 'current', label: 'Current' },
              { value: 'active', label: 'Staying' },
              { value: 'unassigned', label: 'No bed' },
              { value: 'moved_out', label: 'Moved out' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setOffset(0);
              }}
              placeholder="Search name, phone, email or room"
            />
            <Select value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="Sort" className="sm:w-44">
              <option value="name">Sort: Name</option>
              {finance && <option value="outstanding">Sort: Highest dues</option>}
              <option value="move_in">Sort: Latest move-in</option>
            </Select>
          </div>
        </div>
        {residents.isError ? (
          <ErrorState error={residents.error} onRetry={() => void residents.refetch()} />
        ) : residents.isPending ? (
          <TableSkeleton />
        ) : residents.data.rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'No residents match your search' : 'No residents here yet'}
            description={search ? 'Try a different name, phone number or room.' : 'Add residents to track their stay, rent and deposits.'}
            action={!search && can('residents.write') ? <Button onClick={() => open({ kind: 'add-resident' })}><Plus /> Add resident</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Resident</TH>
                  <TH>Room / bed</TH>
                  <TH>Moved in</TH>
                  {finance && <TH align="right">Monthly rent</TH>}
                  {finance && <TH align="right">Outstanding</TH>}
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {residents.data.rows.map((r) => (
                  <TR key={r.id} className="cursor-pointer hover:bg-gray-25" onClick={() => navigate(`/app/residents/${r.id}`)}>
                    <TD>
                      <Link to={`/app/residents/${r.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <Avatar name={r.full_name} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-gray-900">{r.full_name}</span>
                          <span className="block truncate text-xs text-gray-500">{r.phone ?? r.email ?? '—'}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      {r.stay ? (
                        <span>
                          <span className="font-medium text-gray-800">
                            {r.stay.room_name} / {r.stay.bed_label}
                          </span>
                          <span className="block text-xs text-gray-500">{r.stay.property_name}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TD>
                    <TD>{r.stay ? formatDate(r.stay.move_in_date) : '—'}</TD>
                    {finance && <TD numeric>{r.monthly_rent_paise !== null ? <Money paise={r.monthly_rent_paise} /> : '—'}</TD>}
                    {finance && (
                      <TD numeric>
                        <Money paise={r.outstanding_paise} muted className={r.overdue_paise ? 'font-semibold text-danger-600' : 'text-gray-900'} />
                        {(r.credit_paise ?? 0) > 0 && <span className="block text-xs text-success-700">credit <Money paise={r.credit_paise} /></span>}
                      </TD>
                    )}
                    <TD>
                      <ResidentStatusBadge status={r.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination total={residents.data.total} limit={PAGE} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </div>
  );
}
