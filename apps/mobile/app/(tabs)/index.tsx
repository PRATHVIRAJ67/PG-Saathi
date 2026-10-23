import { useMemo } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { BedDouble, CheckCircle2, ChevronRight, CreditCard, Phone } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useInvoice, useResident } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, formatDate, formatINR, formatMonth, formatShortDate, relativeDays, todayISO } from '@pg/shared';
import { useResidentContext } from '../../src/session';
import { PayRentButton } from '../../src/pay';
import { Avatar, Badge, Card, Divider, EmptyState, ErrorView, IconButton, Row, Screen, SectionHeader, Skeleton, Stat, Txt } from '../../src/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { link, tenantId, residentId } = useResidentContext();
  const resident = useResident(tenantId, residentId);
  const r = resident.data;
  const open = useMemo(
    () => (r?.invoices ?? []).filter((i) => i.status === 'issued' && i.balance_paise > 0).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [r],
  );
  const oldest = open[0];
  // Bills carry the PG's business details (name, phone, UPI ID).
  const latestBill = oldest ?? r?.invoices[0];
  const bill = useInvoice(tenantId, latestBill?.id ?? null);
  const business = bill.data?.business;
  const stay = r?.stays.find((s) => s.status === 'active');
  const agreement = stay?.agreements.find((a) => a.effective_to === null);
  const due = r?.balance?.outstanding_paise ?? 0;
  const overdue = r?.balance?.overdue_paise ?? 0;
  const held = r?.deposit ? r.deposit.collected_paise - r.deposit.refunded_paise - r.deposit.deducted_paise : 0;
  const first = (r?.full_name ?? link?.resident_name ?? '').split(' ')[0];

  return (
    <Screen refreshing={resident.isRefetching} onRefresh={() => void Promise.all([resident.refetch(), bill.refetch()])}>
      <View style={{ gap: 2 }}>
        <Txt variant="caption">{link?.tenant_name}</Txt>
        <Txt variant="display">
          {greeting()}
          {first ? `, ${first}` : ''}
        </Txt>
      </View>

      {resident.isError ? (
        <ErrorView error={resident.error} onRetry={() => void resident.refetch()} />
      ) : !r ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={170} />
          <Skeleton height={110} />
        </View>
      ) : (
        <>
          <Card style={{ backgroundColor: colors.navy[900], borderColor: colors.navy[900], gap: 6 }}>
            {due > 0 ? (
              <>
                <Txt variant="caption" color="rgba(255,255,255,0.7)">
                  Rent due
                </Txt>
                <Txt variant="display" tabular color={colors.white}>
                  {formatINR(due)}
                </Txt>
                {oldest && (
                  <Txt variant="caption" color={overdue > 0 ? '#FCA5A5' : 'rgba(255,255,255,0.7)'}>
                    {overdue > 0
                      ? `${formatINR(overdue)} overdue · was due ${formatShortDate(oldest.due_date)}`
                      : `Due ${formatDate(oldest.due_date)} (${relativeDays(oldest.due_date, todayISO())})`}
                  </Txt>
                )}
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={28} color="#6EE7B7" />
                <View>
                  <Txt variant="heading" color={colors.white}>
                    You’re all paid up
                  </Txt>
                  <Txt variant="caption" color="rgba(255,255,255,0.7)">
                    No rent due right now.
                  </Txt>
                </View>
              </View>
            )}
            {(r.balance?.credit_paise ?? 0) > 0 && (
              <Txt variant="caption" color="#6EE7B7">
                {formatINR(r.balance!.credit_paise)} advance credit will go towards your next bill.
              </Txt>
            )}
          </Card>

          {due > 0 && oldest && (
            <PayRentButton
              business={business}
              tenantId={tenantId}
              invoiceId={oldest.id}
              invoiceBalancePaise={bill.data?.id === oldest.id ? bill.data.balance_paise : 0}
              amountPaise={due}
              note={oldest.period_start ? `Rent ${formatMonth(oldest.period_start)}` : `Bill ${oldest.invoice_number}`}
            />
          )}

          <Card delay={60} style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent[50], alignItems: 'center', justifyContent: 'center' }}>
                <BedDouble size={18} color={colors.accent[600]} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="heading">{stay ? `Room ${stay.room_name} · Bed ${stay.bed_label}` : 'No bed assigned'}</Txt>
                <Txt variant="caption">{stay ? `${stay.property_name} · since ${formatDate(stay.move_in_date)}` : 'Your PG will assign your room.'}</Txt>
              </View>
            </View>
            {stay && (
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Stat label="Monthly rent" value={agreement ? formatINR(agreement.monthly_rent_paise) : '—'} hint={agreement ? `Due on day ${agreement.billing_day}` : undefined} />
                <Stat label="Deposit held" value={formatINR(held)} hint={r.deposit?.agreed_paise ? `Agreed ${formatINR(r.deposit.agreed_paise)}` : undefined} />
              </View>
            )}
          </Card>

          <View>
            <SectionHeader
              title="Recent payments"
              action={
                r.payments.length > 0 ? <IconButton icon={ChevronRight} label="All payments" onPress={() => router.push('/(tabs)/payments')} /> : undefined
              }
            />
            <Card padded={false}>
              {r.payments.length === 0 ? (
                <EmptyState icon={CreditCard} title="No payments yet" description="Payments appear here once your PG records them." />
              ) : (
                r.payments.slice(0, 3).map((p, i) => (
                  <View key={p.id}>
                    {i > 0 && <Divider />}
                    <Row
                      title={formatINR(p.amount_paise)}
                      subtitle={`${formatDate(p.paid_on)} · ${PAYMENT_METHOD_LABELS[p.method]}`}
                      right={p.status === 'voided' ? <Badge label="Voided" tone="danger" /> : <Badge label="Received" tone="success" />}
                      onPress={() => router.push(`/payment/${p.id}`)}
                    />
                  </View>
                ))
              )}
            </Card>
          </View>

          {business && (
            <Card delay={90} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={business.name} />
              <View style={{ flex: 1 }}>
                <Txt variant="label" style={{ color: colors.gray[900] }}>
                  {business.name}
                </Txt>
                <Txt variant="caption">{business.contact_phone ?? business.contact_email ?? 'Your PG'}</Txt>
              </View>
              {business.contact_phone ? <IconButton icon={Phone} label={`Call ${business.name}`} onPress={() => void Linking.openURL(`tel:${business.contact_phone}`)} /> : null}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
