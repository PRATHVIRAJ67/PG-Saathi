import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BarChart3, Download, Printer } from 'lucide-react';
import { useFinancialReport, useProperties } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, addMonthsISO, formatDate, formatINR, formatMonth, occupancyRate, startOfMonthISO, todayISO } from '@pg/shared';
import { Button } from '@pg/ui-web/ui/button';
import { Select } from '@pg/ui-web/ui/form-controls';
import { Card, CardBody, CardHeader, Progress } from '@pg/ui-web/ui/surfaces';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pg/ui-web/ui/overlays';
import { Table, TBody, TD, TH, THead, TR } from '@pg/ui-web/ui/table';
import { EmptyState, ErrorState, Money, PageHeader, StatCard, TableSkeleton } from '@pg/ui-web/common';
import { MonthlyMoneyChart, ShareBars } from '@pg/ui-web/charts';
import { MonthInput } from '@/components/pickers';
import { useCurrentWorkspace } from '@/app/workspace';
import { csvRupees, downloadCsv } from '@pg/ui-web/utils';

type Preset = 'this' | 'last3' | 'last6' | 'fy' | 'custom';

function presetRange(preset: Preset, custom: { from: string; to: string }) {
  const thisMonth = startOfMonthISO(todayISO());
  switch (preset) {
    case 'this':
      return { from: thisMonth, to: thisMonth };
    case 'last3':
      return { from: addMonthsISO(thisMonth, -2), to: thisMonth };
    case 'last6':
      return { from: addMonthsISO(thisMonth, -5), to: thisMonth };
    case 'fy': {
      // Indian financial year: April to March.
      const [y, m] = thisMonth.split('-').map(Number) as [number, number];
      const startYear = m >= 4 ? y : y - 1;
      return { from: `${startYear}-04-01`, to: thisMonth };
    }
    default:
      return custom;
  }
}

export function ReportsPage() {
  const { tenantId, propertyId, workspace } = useCurrentWorkspace();
  const properties = useProperties(tenantId);
  const [preset, setPreset] = useState<Preset>('last6');
  const [custom, setCustom] = useState({ from: addMonthsISO(startOfMonthISO(todayISO()), -2), to: startOfMonthISO(todayISO()) });
  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  const report = useFinancialReport(tenantId, { from: range.from, to: range.to, propertyId }, { enabled: range.from <= range.to });
  const r = report.data;
  const fileBase = `${workspace.name.replace(/[^\w]+/g, '-').toLowerCase()}-${range.from.slice(0, 7)}-to-${range.to.slice(0, 7)}`;

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`${formatMonth(range.from)} – ${formatMonth(range.to)}${propertyId ? ` · ${properties.data?.find((p) => p.id === propertyId)?.name ?? ''}` : ' · All properties'}`}
        actions={
          <>
            <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Date range" className="w-44">
              <option value="this">This month</option>
              <option value="last3">Last 3 months</option>
              <option value="last6">Last 6 months</option>
              <option value="fy">This financial year</option>
              <option value="custom">Custom months</option>
            </Select>
            {preset === 'custom' && (
              <>
                <MonthInput value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} label="From month" />
                <MonthInput value={custom.to} onChange={(to) => setCustom((c) => ({ ...c, to }))} label="To month" />
              </>
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </>
        }
      />

      {report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Billed" loading={!r} value={<Money paise={r?.totals.billed_paise} />} />
            <StatCard label="Collected" tone="success" loading={!r} value={<Money paise={r?.totals.collected_paise} />} footer={r && r.totals.billed_paise ? `${Math.round((r.totals.collected_paise / r.totals.billed_paise) * 100)}% of billed` : null} />
            <StatCard label="Expenses" tone="warning" loading={!r} value={<Money paise={r?.totals.expenses_paise} />} />
            <StatCard label="Net (collected − expenses)" tone={r && r.totals.collected_paise - r.totals.expenses_paise < 0 ? 'danger' : 'accent'} loading={!r} value={<Money paise={r ? r.totals.collected_paise - r.totals.expenses_paise : 0} />} footer={r ? `${formatINR(r.totals.outstanding_paise)} outstanding today` : null} />
          </div>

          <Tabs defaultValue="collection">
            <TabsList className="mb-4 print:hidden">
              <TabsTrigger value="collection">Monthly collection</TabsTrigger>
              <TabsTrigger value="outstanding">Outstanding rent</TabsTrigger>
              <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="property">Property income</TabsTrigger>
            </TabsList>

            <TabsContent value="collection" className="space-y-6">
              <Card>
                <CardHeader
                  title="Billed, collected and spent by month"
                  action={
                    r && (
                      <Button variant="secondary" size="sm" onClick={() => downloadCsv(`${fileBase}-monthly.csv`, ['Month', 'Billed (INR)', 'Collected (INR)', 'Expenses (INR)', 'Net (INR)'], r.monthly.map((m) => [m.month.slice(0, 7), csvRupees(m.billed_paise), csvRupees(m.collected_paise), csvRupees(m.expenses_paise), csvRupees(m.collected_paise - m.expenses_paise)]))}>
                        <Download /> CSV
                      </Button>
                    )
                  }
                />
                <CardBody>{r ? <MonthlyMoneyChart data={r.monthly} height={280} /> : <div className="h-72 skeleton rounded-lg" />}</CardBody>
                {r && (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Month</TH>
                        <TH align="right">Billed</TH>
                        <TH align="right">Collected</TH>
                        <TH align="right">Expenses</TH>
                        <TH align="right">Net</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {r.monthly.map((m) => (
                        <TR key={m.month}>
                          <TD className="font-medium text-gray-900">{formatMonth(m.month)}</TD>
                          <TD numeric>{formatINR(m.billed_paise)}</TD>
                          <TD numeric>{formatINR(m.collected_paise)}</TD>
                          <TD numeric>{formatINR(m.expenses_paise)}</TD>
                          <TD numeric className={m.collected_paise - m.expenses_paise < 0 ? 'text-danger-600' : 'font-medium text-gray-900'}>
                            {formatINR(m.collected_paise - m.expenses_paise)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
              {r && r.collection_by_method.length > 0 && (
                <Card>
                  <CardHeader title="Collections by payment method" />
                  <CardBody>
                    <ShareBars rows={r.collection_by_method.map((m) => ({ label: `${PAYMENT_METHOD_LABELS[m.method]} · ${m.count}`, value: m.amount_paise }))} color="#0F9F75" />
                  </CardBody>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="outstanding">
              <Card>
                <CardHeader
                  title="Residents with outstanding rent"
                  description="As of today, across all unpaid bills"
                  action={
                    r && r.outstanding.length > 0 && (
                      <Button variant="secondary" size="sm" onClick={() => downloadCsv(`${fileBase}-outstanding.csv`, ['Resident', 'Phone', 'Property', 'Open bills', 'Balance (INR)', 'Overdue (INR)', 'Oldest due'], r.outstanding.map((o) => [o.full_name, o.phone ?? '', o.property_name, o.open_invoices ?? '', csvRupees(o.balance_paise), csvRupees(o.overdue_paise), o.oldest_due_date]))}>
                        <Download /> CSV
                      </Button>
                    )
                  }
                />
                {!r ? (
                  <TableSkeleton />
                ) : r.outstanding.length === 0 ? (
                  <EmptyState compact icon={BarChart3} title="No outstanding rent" description="Everyone is paid up." />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Resident</TH>
                        <TH>Property</TH>
                        <TH align="right">Open bills</TH>
                        <TH>Oldest due</TH>
                        <TH align="right">Overdue</TH>
                        <TH align="right">Balance</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {r.outstanding.map((o) => (
                        <TR key={o.resident_id}>
                          <TD>
                            <Link to={`/app/residents/${o.resident_id}`} className="font-medium text-gray-900 hover:underline">
                              {o.full_name}
                            </Link>
                            {o.phone && <span className="block text-xs text-gray-500">{o.phone}</span>}
                          </TD>
                          <TD>{o.property_name}</TD>
                          <TD numeric>{o.open_invoices}</TD>
                          <TD>{formatDate(o.oldest_due_date)}</TD>
                          <TD numeric className={o.overdue_paise ? 'text-danger-600' : 'text-gray-400'}>{formatINR(o.overdue_paise)}</TD>
                          <TD numeric className="font-semibold text-gray-900">{formatINR(o.balance_paise)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="occupancy">
              <Card>
                <CardHeader
                  title="Occupancy by property"
                  description="Current bed status"
                  action={
                    r && (
                      <Button variant="secondary" size="sm" onClick={() => downloadCsv(`${fileBase}-occupancy.csv`, ['Property', 'Beds', 'Occupied', 'Occupancy %'], r.by_property.map((p) => [p.name, p.beds, p.occupied, occupancyRate(p.occupied, p.beds)]))}>
                        <Download /> CSV
                      </Button>
                    )
                  }
                />
                {!r ? (
                  <TableSkeleton />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Property</TH>
                        <TH align="right">Beds</TH>
                        <TH align="right">Occupied</TH>
                        <TH align="right">Vacant</TH>
                        <TH className="w-1/3">Occupancy</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {r.by_property.map((p) => {
                        const rate = occupancyRate(p.occupied, p.beds);
                        return (
                          <TR key={p.property_id}>
                            <TD className="font-medium text-gray-900">{p.name}</TD>
                            <TD numeric>{p.beds}</TD>
                            <TD numeric>{p.occupied}</TD>
                            <TD numeric>{p.beds - p.occupied}</TD>
                            <TD>
                              <div className="flex items-center gap-3">
                                <Progress value={rate} className="flex-1" tone={rate >= 90 ? 'success' : 'accent'} />
                                <span className="tabular w-12 text-right text-gray-700">{rate}%</span>
                              </div>
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="expenses">
              <Card>
                <CardHeader
                  title="Expenses by category"
                  action={
                    r && r.expenses_by_category.length > 0 && (
                      <Button variant="secondary" size="sm" onClick={() => downloadCsv(`${fileBase}-expenses.csv`, ['Category', 'Amount (INR)'], r.expenses_by_category.map((c) => [c.category, csvRupees(c.amount_paise)]))}>
                        <Download /> CSV
                      </Button>
                    )
                  }
                />
                <CardBody>
                  {!r ? <div className="h-40 skeleton rounded-lg" /> : r.expenses_by_category.length === 0 ? <p className="text-[13px] text-gray-500">No expenses in this period.</p> : <ShareBars rows={r.expenses_by_category.map((c) => ({ label: c.category, value: c.amount_paise }))} />}
                </CardBody>
              </Card>
            </TabsContent>

            <TabsContent value="property">
              <Card>
                <CardHeader
                  title="Income by property"
                  description="Billed and collected in the period; outstanding as of today"
                  action={
                    r && (
                      <Button variant="secondary" size="sm" onClick={() => downloadCsv(`${fileBase}-property-income.csv`, ['Property', 'Billed (INR)', 'Collected (INR)', 'Expenses (INR)', 'Net (INR)', 'Outstanding (INR)'], r.by_property.map((p) => [p.name, csvRupees(p.billed_paise), csvRupees(p.collected_paise), csvRupees(p.expenses_paise), csvRupees(p.collected_paise - p.expenses_paise), csvRupees(p.outstanding_paise)]))}>
                        <Download /> CSV
                      </Button>
                    )
                  }
                />
                {!r ? (
                  <TableSkeleton />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Property</TH>
                        <TH align="right">Billed</TH>
                        <TH align="right">Collected</TH>
                        <TH align="right">Expenses</TH>
                        <TH align="right">Net</TH>
                        <TH align="right">Outstanding</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {r.by_property.map((p) => (
                        <TR key={p.property_id}>
                          <TD className="font-medium text-gray-900">{p.name}</TD>
                          <TD numeric>{formatINR(p.billed_paise)}</TD>
                          <TD numeric>{formatINR(p.collected_paise)}</TD>
                          <TD numeric>{formatINR(p.expenses_paise)}</TD>
                          <TD numeric className={p.collected_paise - p.expenses_paise < 0 ? 'text-danger-600' : 'font-medium text-gray-900'}>{formatINR(p.collected_paise - p.expenses_paise)}</TD>
                          <TD numeric>{formatINR(p.outstanding_paise)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
                <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">Business-wide expenses (not tied to a property) are included in the totals above but not in this table.</p>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
