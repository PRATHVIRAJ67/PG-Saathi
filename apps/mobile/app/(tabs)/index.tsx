import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { BedDouble, CalendarCheck, CheckCircle2, CreditCard, Receipt, UserPlus } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useDashboard, useProperties } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, formatINR, formatMonth, formatShortDate, occupancyRate, percent } from '@pg/shared';
import { useWorkspaceContext } from '../../src/session';
import { Avatar, Badge, Card, Divider, EmptyState, ErrorView, Picker, ProgressBar, Row, Screen, SectionHeader, Skeleton, Stat, Txt } from '../../src/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { me, workspace, tenantId, propertyId, setPropertyId, can } = useWorkspaceContext();
  const properties = useProperties(tenantId);
  const dash = useDashboard(tenantId, propertyId);
  const d = dash.data;
  const f = d?.finance;
  const occ = d ? occupancyRate(d.occupancy.occupied, d.occupancy.total_beds, d.occupancy.unavailable) : 0;
  const first = me.data?.user.full_name?.split(' ')[0];

  const actions = [
    { show: can('finance.write'), label: 'Record payment', icon: CreditCard, go: () => router.push('/payment/new') },
    { show: can('residents.write'), label: 'Add resident', icon: UserPlus, go: () => router.push('/resident/new') },
    { show: can('residents.write'), label: 'Assign bed', icon: BedDouble, go: () => router.push('/assign-bed') },
    { show: can('finance.write'), label: 'Add expense', icon: Receipt, go: () => router.push('/expense/new') },
  ].filter((a) => a.show);

  return (
    <Screen refreshing={dash.isRefetching} onRefresh={() => void dash.refetch()}>
      <View style={{ gap: 4 }}>
        <Txt variant="caption">{workspace?.name}</Txt>
        <Txt variant="display">
          {greeting()}
          {first ? `, ${first}` : ''}
        </Txt>
      </View>

      {(properties.data?.length ?? 0) > 1 && (
        <Picker
          title="Property"
          value={propertyId ?? 'all'}
          onChange={(v) => setPropertyId(v === 'all' ? null : v)}
          placeholder="All properties"
          options={[{ value: 'all', label: 'All properties' }, ...(properties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
        />
      )}

      {dash.isError ? (
        <ErrorView error={dash.error} onRetry={() => void dash.refetch()} />
      ) : !d ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={150} />
          <Skeleton height={90} />
        </View>
      ) : (
        <>
          {f && (
            <Card style={{ backgroundColor: colors.navy[900], borderColor: colors.navy[900] }}>
              <Txt variant="caption" color="rgba(255,255,255,0.7)">
                Collected in {formatMonth(d.month)}
              </Txt>
              <Txt variant="display" tabular color={colors.white} style={{ marginTop: 4 }}>
                {formatINR(f.collected_paise)}
              </Txt>
              <View style={{ marginTop: 12, gap: 6 }}>
                <ProgressBar value={percent(f.billed_collected_paise, f.billed_paise)} color={colors.success[600]} />
                <Txt variant="caption" color="rgba(255,255,255,0.7)">
                  {f.billed_paise ? `${percent(f.billed_collected_paise, f.billed_paise)}% of ${formatINR(f.billed_paise)} billed this month` : 'No rent billed yet this month'}
                </Txt>
              </View>
            </Card>
          )}

          <Card delay={60} style={{ flexDirection: 'row', gap: 16 }}>
            {f && <Stat label="Outstanding" value={formatINR(f.outstanding_paise, { compact: f.outstanding_paise >= 1_00_000_00 })} hint={f.overdue_paise ? `${formatINR(f.overdue_paise)} overdue` : 'Nothing overdue'} tone={f.overdue_paise ? 'danger' : undefined} />}
            <Stat label="Occupancy" value={`${occ}%`} hint={`${d.occupancy.vacant} vacant beds`} />
          </Card>

          {f && f.stays_without_invoice > 0 && can('finance.write') && (
            <Pressable onPress={() => router.push('/rent')} accessibilityRole="button">
              <Card delay={90} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accent[50], borderColor: colors.accent[200] }}>
                <CalendarCheck size={20} color={colors.accent[700]} />
                <Txt style={{ flex: 1 }} color={colors.accent[800]}>
                  {f.stays_without_invoice} residents not billed for {formatMonth(d.month)}. Tap to generate rent.
                </Txt>
              </Card>
            </Pressable>
          )}

          {actions.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {actions.map((a) => (
                <Pressable key={a.label} onPress={a.go} accessibilityRole="button" style={({ pressed }) => [{ width: '48%', flexGrow: 1, minHeight: 64, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], padding: 12, gap: 6, justifyContent: 'center' }, pressed && { backgroundColor: colors.accent[50] }]}>
                  <a.icon size={20} color={colors.accent[600]} />
                  <Txt variant="label">{a.label}</Txt>
                </Pressable>
              ))}
            </View>
          )}

          {f && (
            <View>
              <SectionHeader title="Recent payments" />
              <Card padded={false}>
                {f.recent_payments.length === 0 ? (
                  <EmptyState icon={CreditCard} title="No payments yet" />
                ) : (
                  f.recent_payments.map((p, i) => (
                    <View key={p.id}>
                      {i > 0 && <Divider />}
                      <Row
                        title={p.resident_name}
                        subtitle={`${formatShortDate(p.paid_on)} · ${PAYMENT_METHOD_LABELS[p.method]}`}
                        left={<Avatar name={p.resident_name} />}
                        right={<Txt variant="label" tabular color={colors.success[700]}>{formatINR(p.amount_paise)}</Txt>}
                        onPress={() => router.push(`/payment/${p.id}`)}
                      />
                    </View>
                  ))
                )}
              </Card>
            </View>
          )}

          {f && (
            <View>
              <SectionHeader title="Highest dues" />
              <Card padded={false}>
                {f.top_outstanding.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="Everyone is paid up" />
                ) : (
                  f.top_outstanding.map((r, i) => (
                    <View key={r.resident_id}>
                      {i > 0 && <Divider />}
                      <Row
                        title={r.full_name}
                        subtitle={`${r.property_name} · since ${formatShortDate(r.oldest_due_date)}`}
                        right={
                          <View style={{ alignItems: 'flex-end', gap: 2 }}>
                            <Txt variant="label" tabular>{formatINR(r.balance_paise)}</Txt>
                            {r.overdue_paise > 0 && <Badge label="Overdue" tone="danger" />}
                          </View>
                        }
                        onPress={() => router.push(`/resident/${r.resident_id}`)}
                      />
                    </View>
                  ))
                )}
              </Card>
            </View>
          )}

          <View>
            <SectionHeader title="Occupancy" />
            <Card style={{ gap: 14 }}>
              {d.properties.length === 0 ? (
                <Txt variant="caption">No properties yet.</Txt>
              ) : (
                d.properties.map((p) => (
                  <Pressable key={p.id} onPress={() => router.push(`/property/${p.id}`)} style={{ gap: 6 }} accessibilityRole="button">
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>{p.name}</Txt>
                      <Txt variant="caption" tabular>
                        {p.occupied}/{p.beds - p.unavailable}
                      </Txt>
                    </View>
                    <ProgressBar value={occupancyRate(p.occupied, p.beds, p.unavailable)} />
                  </Pressable>
                ))
              )}
            </Card>
          </View>
        </>
      )}
    </Screen>
  );
}
