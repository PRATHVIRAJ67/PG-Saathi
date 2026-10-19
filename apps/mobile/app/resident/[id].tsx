import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, BedDouble, CreditCard, LogOut, Phone } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useBackend, useResident, useTenantMutation } from '@pg/api-client/react';
import { INVOICE_PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, RESIDENT_STATUS_LABELS, formatDate, formatINR, formatMonth, todayISO } from '@pg/shared';
import { useWorkspaceContext } from '../../src/session';
import { Avatar, Badge, Button, Card, Divider, ErrorView, IconButton, InlineError, LoadingList, Row, Screen, SectionHeader, Segmented, Stat, Txt } from '../../src/ui';

const statusTone = { paid: 'success', partially_paid: 'accent', pending: 'neutral', overdue: 'danger', void: 'neutral' } as const;

export default function ResidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tenantId, can } = useWorkspaceContext();
  const { data } = useBackend();
  const q = useResident(tenantId, id);
  const [tab, setTab] = useState<'bills' | 'payments' | 'profile'>('bills');
  const r = q.data;
  const stay = r?.stays.find((s) => s.status === 'active');
  const agreement = stay?.agreements.find((a) => a.effective_to === null);
  const moveOut = useTenantMutation(tenantId, () => data.endStay(stay!.id, todayISO()));

  const confirmMoveOut = () =>
    Alert.alert('Move out today?', `${r?.full_name} will be moved out of ${stay?.room_name}/${stay?.bed_label} and the bed becomes vacant. Bills and payments are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move out', style: 'destructive', onPress: () => moveOut.mutate() },
    ]);

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
      </View>
      {q.isError ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : !r ? (
        <LoadingList />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={r.full_name} size={52} />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="title" numberOfLines={1}>{r.full_name}</Txt>
              <Badge label={RESIDENT_STATUS_LABELS[r.status]} tone={r.status === 'active' ? 'success' : r.status === 'unassigned' ? 'warning' : 'neutral'} />
            </View>
            {r.phone ? <IconButton icon={Phone} label={`Call ${r.full_name}`} onPress={() => void Linking.openURL(`tel:${r.phone}`)} /> : null}
          </View>

          {stay && (
            <Card style={{ gap: 4 }}>
              <Txt variant="overline">Current stay</Txt>
              <Txt variant="heading">
                {stay.property_name} · Room {stay.room_name} / {stay.bed_label}
              </Txt>
              <Txt variant="caption">
                Since {formatDate(stay.move_in_date)}
                {agreement ? ` · ${formatINR(agreement.monthly_rent_paise)}/month, due day ${agreement.billing_day}` : ''}
              </Txt>
            </Card>
          )}

          {r.balance && (
            <Card delay={40} style={{ flexDirection: 'row', gap: 16 }}>
              <Stat label="Outstanding" value={formatINR(r.balance.outstanding_paise)} tone={r.balance.overdue_paise ? 'danger' : undefined} hint={r.balance.overdue_paise ? `${formatINR(r.balance.overdue_paise)} overdue` : 'Nothing overdue'} />
              <Stat
                label="Deposit held"
                value={formatINR(r.deposit ? r.deposit.collected_paise - r.deposit.refunded_paise - r.deposit.deducted_paise : 0)}
                hint={r.balance.credit_paise ? `${formatINR(r.balance.credit_paise)} credit` : undefined}
              />
            </Card>
          )}

          <View style={{ gap: 10 }}>
            {can('finance.write') && <Button title="Record payment" icon={CreditCard} onPress={() => router.push({ pathname: '/payment/new', params: { residentId: r.id } })} />}
            {can('residents.write') && !stay && r.status !== 'archived' && (
              <Button title="Assign a bed" variant="secondary" icon={BedDouble} onPress={() => router.push({ pathname: '/assign-bed', params: { residentId: r.id } })} />
            )}
            {can('residents.write') && stay && <Button title="Move out" variant="ghost" icon={LogOut} loading={moveOut.isPending} onPress={confirmMoveOut} />}
            <InlineError error={moveOut.error} />
          </View>

          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              ...(r.finance_visible ? [{ value: 'bills' as const, label: 'Bills' }, { value: 'payments' as const, label: 'Payments' }] : []),
              { value: 'profile' as const, label: 'Profile' },
            ]}
          />

          {tab === 'bills' && r.finance_visible && (
            <Card padded={false}>
              {r.invoices.length === 0 ? (
                <Txt variant="caption" style={{ padding: 16 }}>No bills yet.</Txt>
              ) : (
                r.invoices.map((i, idx) => (
                  <View key={i.id}>
                    {idx > 0 && <Divider />}
                    <Row
                      title={i.period_start ? `Rent · ${formatMonth(i.period_start)}` : i.invoice_number}
                      subtitle={`Due ${formatDate(i.due_date)} · ${formatINR(i.total_paise)}`}
                      right={
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Badge label={INVOICE_PAYMENT_STATUS_LABELS[i.payment_status]} tone={statusTone[i.payment_status]} />
                          {i.balance_paise > 0 && i.status === 'issued' && <Txt variant="caption" tabular>{formatINR(i.balance_paise)} left</Txt>}
                        </View>
                      }
                    />
                  </View>
                ))
              )}
            </Card>
          )}
          {tab === 'payments' && r.finance_visible && (
            <Card padded={false}>
              {r.payments.length === 0 ? (
                <Txt variant="caption" style={{ padding: 16 }}>No payments yet.</Txt>
              ) : (
                r.payments.map((p, idx) => (
                  <View key={p.id}>
                    {idx > 0 && <Divider />}
                    <Row
                      title={formatINR(p.amount_paise)}
                      subtitle={`${formatDate(p.paid_on)} · ${PAYMENT_METHOD_LABELS[p.method]} · ${p.receipt_number}`}
                      right={p.status === 'voided' ? <Badge label="Voided" tone="danger" /> : undefined}
                      onPress={() => router.push(`/payment/${p.id}`)}
                    />
                  </View>
                ))
              )}
            </Card>
          )}
          {(tab === 'profile' || !r.finance_visible) && (
            <Card style={{ gap: 12 }}>
              {[
                ['Phone', r.phone],
                ['Email', r.email],
                ['Occupation', r.occupation],
                ['Emergency contact', [r.emergency_contact_name, r.emergency_contact_relation, r.emergency_contact_phone].filter(Boolean).join(' · ') || null],
                ['Permanent address', r.permanent_address],
              ].map(([label, value]) => (
                <View key={label}>
                  <Txt variant="caption">{label}</Txt>
                  <Txt variant="label" style={{ color: colors.gray[900] }}>{value ?? '—'}</Txt>
                </View>
              ))}
            </Card>
          )}
          <SectionHeader title="" />
        </>
      )}
    </Screen>
  );
}
