import { useState } from 'react';
import { Link } from 'react-router';
import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Circle,
  CreditCard,
  IndianRupee,
  LogIn,
  Plus,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useDashboard, useMyContext } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, formatDate, formatINR, formatMonth, formatShortDate, occupancyRate, percent, startOfMonthISO, todayISO } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Badge, Card, CardBody, CardHeader, Progress, Skeleton, Avatar } from '@pg/ui-web/ui/surfaces';
import { EmptyState, ErrorState, Money, PageHeader, StatCard } from '@pg/ui-web/common';
import { MonthlyMoneyChart } from '@pg/ui-web/charts';
import { MonthInput } from '@/components/pickers';
import { useDialogs } from '@/app/stores';
import { useCurrentWorkspace } from '@/app/workspace';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function OverviewPage() {
  const { tenantId, propertyId, workspace, can } = useCurrentWorkspace();
  const me = useMyContext();
  const open = useDialogs((s) => s.open);
  const [month, setMonth] = useState(startOfMonthISO(todayISO()));
  const dash = useDashboard(tenantId, propertyId, month);
  const d = dash.data;
  const f = d?.finance;
  const firstName = me.data?.user.full_name?.split(' ')[0];
  const occ = d ? occupancyRate(d.occupancy.occupied, d.occupancy.total_beds, d.occupancy.unavailable) : 0;
  const isCurrentMonth = month === startOfMonthISO(todayISO());
  const selectedPropertyName = propertyId ? d?.properties.find((p) => p.id === propertyId)?.name : null;

  if (dash.isError) return <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />;

  const checklist = d?.checklist;
  const setupItems = checklist
    ? [
        { done: checklist.has_property, label: 'Add a property', action: () => open({ kind: 'add-property' }) },
        { done: checklist.has_rooms, label: 'Add rooms and beds', action: () => open({ kind: 'add-rooms' }) },
        { done: checklist.has_residents, label: 'Add residents', action: () => open({ kind: 'add-resident' }) },
        { done: checklist.has_assignments, label: 'Assign residents to beds', action: () => open({ kind: 'assign-bed' }) },
        ...(d?.finance_visible
          ? [
              { done: checklist.has_invoices, label: 'Generate monthly rent', action: () => open({ kind: 'generate-rent' }) },
              { done: checklist.has_payments, label: 'Record your first payment', action: () => open({ kind: 'record-payment' }) },
            ]
          : []),
        ...(can('team.manage') ? [{ done: checklist.has_team, label: 'Invite a team member (optional)', href: '/app/settings/team' }] : []),
      ]
    : [];
  const setupDone = setupItems.filter((i) => i.done).length;
  const showSetup = setupItems.length > 0 && setupDone < setupItems.filter((i) => !i.label.includes('optional')).length;

  return (
    <div>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={
          <>
            {workspace.name}
            {selectedPropertyName ? ` · ${selectedPropertyName}` : ' · All properties'} · {formatMonth(month)}
          </>
        }
        actions={<MonthInput value={month} onChange={setMonth} />}
      />

      {f && f.stays_without_invoice > 0 && can('finance.write') && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2.5 text-[13px] text-accent-800">
            <CalendarCheck className="size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">{f.stays_without_invoice}</strong> staying {f.stays_without_invoice === 1 ? 'resident has' : 'residents have'} no rent bill for {formatMonth(month)}.
              Expected from agreements: <span className="tabular font-semibold">{formatINR(f.projected_rent_paise)}</span>/month.
            </span>
          </p>
          <Button size="sm" variant="accent" onClick={() => open({ kind: 'generate-rent' })}>
            Generate rent
          </Button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d?.finance_visible !== false && (
          <>
            <StatCard
              label={isCurrentMonth ? 'Rent billed this month' : `Rent billed · ${formatMonth(month)}`}
              icon={IndianRupee}
              loading={!d}
              value={<Money paise={f?.billed_paise ?? 0} />}
              footer={f ? <>Projected from agreements: <span className="tabular">{formatINR(f.projected_rent_paise)}</span></> : null}
            />
            <StatCard
              label="Collected"
              icon={TrendingUp}
              tone="success"
              loading={!d}
              value={<Money paise={f?.collected_paise ?? 0} />}
              footer={
                f && f.billed_paise > 0 ? (
                  <div className="space-y-1.5">
                    <Progress value={percent(f.billed_collected_paise, f.billed_paise)} tone="success" />
                    <span>{percent(f.billed_collected_paise, f.billed_paise)}% of this month’s bills paid</span>
                  </div>
                ) : (
                  'Payments received in the month'
                )
              }
            />
            <StatCard
              label="Outstanding rent"
              icon={AlertCircle}
              tone={f && f.overdue_paise > 0 ? 'danger' : 'default'}
              loading={!d}
              value={<Money paise={f?.outstanding_paise ?? 0} />}
              footer={f ? (f.overdue_paise > 0 ? <span className="text-danger-600">{formatINR(f.overdue_paise)} overdue</span> : 'Nothing overdue') : null}
            />
          </>
        )}
        <StatCard
          label="Occupancy"
          icon={BedDouble}
          tone="accent"
          loading={!d}
          value={`${occ}%`}
          footer={
            d ? (
              <div className="space-y-1.5">
                <Progress value={occ} />
                <span>
                  {d.occupancy.occupied} occupied · <strong className="font-medium text-gray-700">{d.occupancy.vacant} vacant</strong>
                  {d.occupancy.unavailable ? ` · ${d.occupancy.unavailable} unavailable` : ''}
                </span>
              </div>
            ) : null
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {f && (
            <Card>
              <CardHeader title="Income and expenses" description="Last 6 months · billed by due date, collected by payment date" />
              <CardBody>{f.series.some((p) => p.billed_paise || p.collected_paise || p.expenses_paise) ? <MonthlyMoneyChart data={f.series} /> : <EmptyState compact icon={TrendingUp} title="No activity yet" description="Bills, payments and expenses will appear here." />}</CardBody>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {f && (
              <Card>
                <CardHeader
                  title="Recent payments"
                  action={
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/app/payments">
                        View all <ArrowRight />
                      </Link>
                    </Button>
                  }
                />
                {f.recent_payments.length === 0 ? (
                  <EmptyState compact icon={CreditCard} title="No payments yet" action={can('finance.write') ? <Button size="sm" variant="secondary" onClick={() => open({ kind: 'record-payment' })}>Record payment</Button> : undefined} />
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {f.recent_payments.map((p) => (
                      <li key={p.id}>
                        <Link to={`/app/payments/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-25">
                          <Avatar name={p.resident_name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-gray-900">{p.resident_name}</span>
                            <span className="block text-xs text-gray-500">
                              {formatShortDate(p.paid_on)} · {PAYMENT_METHOD_LABELS[p.method]}
                            </span>
                          </span>
                          <Money paise={p.amount_paise} className="text-[13px] font-semibold text-success-700" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {f && (
              <Card>
                <CardHeader
                  title="Highest dues"
                  action={
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/app/residents?sort=outstanding">
                        View all <ArrowRight />
                      </Link>
                    </Button>
                  }
                />
                {f.top_outstanding.length === 0 ? (
                  <EmptyState compact icon={CheckCircle2} title="No dues" description="Everyone is paid up." />
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {f.top_outstanding.map((r) => (
                      <li key={r.resident_id} className="flex items-center gap-3 px-5 py-3">
                        <Link to={`/app/residents/${r.resident_id}`} className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-gray-900 hover:underline">{r.full_name}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {r.property_name} · since {formatShortDate(r.oldest_due_date)}
                          </span>
                        </Link>
                        <div className="text-right">
                          <Money paise={r.balance_paise} className="block text-[13px] font-semibold text-gray-900" />
                          {r.overdue_paise > 0 && <span className="text-xs text-danger-600">overdue</span>}
                        </div>
                        {can('finance.write') && (
                          <Button variant="secondary" size="sm" onClick={() => open({ kind: 'record-payment', residentId: r.resident_id })}>
                            Collect
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          <Card>
            <CardHeader title="Recent check-ins" />
            {!d ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : d.recent_checkins.length === 0 ? (
              <EmptyState compact icon={LogIn} title="No check-ins yet" description="Assign a resident to a bed to see them here." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {d.recent_checkins.map((c) => (
                  <li key={c.stay_id}>
                    <Link to={`/app/residents/${c.resident_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-25">
                      <Avatar name={c.full_name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-gray-900">{c.full_name}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {c.property_name} · Room {c.room_name} / {c.bed_label}
                        </span>
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(c.move_in_date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {showSetup && (
            <Card>
              <CardHeader title="Finish setting up" description={`${setupDone} of ${setupItems.length} done`} />
              <CardBody className="pt-3">
                <Progress value={(setupDone / setupItems.length) * 100} className="mb-3" />
                <ul className="space-y-1">
                  {setupItems.map((item) => (
                    <li key={item.label}>
                      {'href' in item && item.href ? (
                        <Link to={item.href} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-gray-50">
                          {item.done ? <CheckCircle2 className="size-4 text-success-600" /> : <Circle className="size-4 text-gray-300" />}
                          <span className={item.done ? 'text-gray-400 line-through' : 'text-gray-700'}>{item.label}</span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={item.done}
                          onClick={'action' in item ? item.action : undefined}
                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] enabled:hover:bg-gray-50"
                        >
                          {item.done ? <CheckCircle2 className="size-4 text-success-600" /> : <Circle className="size-4 text-gray-300" />}
                          <span className={item.done ? 'text-gray-400 line-through' : 'text-gray-700'}>{item.label}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="grid grid-cols-2 gap-2">
              {[
                { show: can('finance.write'), icon: CreditCard, label: 'Record payment', onClick: () => open({ kind: 'record-payment' }) },
                { show: can('residents.write'), icon: Users, label: 'Add resident', onClick: () => open({ kind: 'add-resident' }) },
                { show: can('residents.write'), icon: BedDouble, label: 'Assign bed', onClick: () => open({ kind: 'assign-bed' }) },
                { show: can('finance.write'), icon: Receipt, label: 'Add expense', onClick: () => open({ kind: 'add-expense' }) },
                { show: can('properties.write'), icon: Plus, label: 'Add room', onClick: () => open({ kind: 'add-rooms' }) },
                { show: can('properties.write'), icon: Building2, label: 'Add property', onClick: () => open({ kind: 'add-property' }) },
              ]
                .filter((a) => a.show)
                .map((a) => (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    className="flex flex-col items-start gap-2 rounded-lg border border-gray-200 p-3 text-left text-[13px] font-medium text-gray-700 transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-800"
                  >
                    <a.icon className="size-4 text-accent-600" aria-hidden />
                    {a.label}
                  </button>
                ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Occupancy by property"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app/rooms">Beds</Link>
                </Button>
              }
            />
            {!d ? (
              <div className="p-5">
                <Skeleton className="h-10 w-full" />
              </div>
            ) : d.properties.length === 0 ? (
              <EmptyState compact icon={Building2} title="No properties yet" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {d.properties.map((p) => {
                  const rate = occupancyRate(p.occupied, p.beds, p.unavailable);
                  return (
                    <li key={p.id} className="px-5 py-3.5">
                      <Link to={`/app/properties/${p.id}`} className="flex items-center justify-between text-[13px]">
                        <span className="truncate font-medium text-gray-900 hover:underline">{p.name}</span>
                        <span className="tabular text-gray-500">
                          {p.occupied}/{p.beds - p.unavailable}
                        </span>
                      </Link>
                      <Progress value={rate} className="mt-2" tone={rate >= 90 ? 'success' : 'accent'} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {d && d.upcoming_move_outs.length > 0 && (
            <Card>
              <CardHeader title="Moving out soon" />
              <ul className="divide-y divide-gray-100">
                {d.upcoming_move_outs.map((m) => (
                  <li key={m.stay_id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                    <Link to={`/app/residents/${m.resident_id}`} className="font-medium text-gray-900 hover:underline">
                      {m.full_name}
                    </Link>
                    <Badge tone="warning">{formatShortDate(m.expected_move_out_date)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {f && f.expenses_paise > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-md bg-warning-50 text-warning-700">
                  <Wallet className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500">Expenses in {formatMonth(month)}</p>
                  <Money paise={f.expenses_paise} className="text-[15px] font-semibold text-gray-900" />
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app/expenses">Details</Link>
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
