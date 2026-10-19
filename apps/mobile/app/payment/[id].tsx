import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { usePayment } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, formatDate, formatDateTime, formatINR, formatMonth } from '@pg/shared';
import { useWorkspaceContext } from '../../src/session';
import { Badge, Card, Divider, ErrorView, IconButton, LoadingList, Screen, Txt } from '../../src/ui';

export default function PaymentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tenantId } = useWorkspaceContext();
  const q = usePayment(tenantId, id);
  const p = q.data;
  const line = (label: string, value: string | null | undefined) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 }}>
      <Txt variant="caption">{label}</Txt>
      <Txt variant="label" style={{ flexShrink: 1, textAlign: 'right' }}>{value ?? '—'}</Txt>
    </View>
  );
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <Txt variant="heading">Receipt</Txt>
      </View>
      {q.isError ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : !p ? (
        <LoadingList />
      ) : (
        <Card style={{ gap: 4 }}>
          <Txt variant="caption">{p.business.name}</Txt>
          <Txt variant="overline" style={{ marginTop: 12 }}>
            {p.receipt_number}
          </Txt>
          <Txt variant="display" tabular style={p.status === 'voided' ? { textDecorationLine: 'line-through', color: colors.gray[400] } : undefined}>
            {formatINR(p.amount_paise)}
          </Txt>
          <Txt>
            from {p.resident.full_name} on {formatDate(p.paid_on)}
          </Txt>
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 6 }}>
            {p.status === 'voided' ? <Badge label="Voided" tone="danger" /> : <Badge label="Recorded manually" />}
          </View>
          <View style={{ marginTop: 12 }}>
            <Divider />
            {line('Method', PAYMENT_METHOD_LABELS[p.method])}
            {line('Reference', p.reference)}
            {line('Property', p.property?.name)}
            {line('Recorded by', p.recorded_by_name)}
            {line('Recorded at', formatDateTime(p.created_at))}
            {p.void_reason ? line('Void reason', p.void_reason) : null}
            <Divider />
          </View>
          {p.allocations.filter((a) => !a.voided_at).length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Txt variant="overline">Applied to</Txt>
              {p.allocations
                .filter((a) => !a.voided_at)
                .map((a) => (
                  <View key={a.id}>{line(a.period_start ? `Rent · ${formatMonth(a.period_start)}` : a.invoice_number, formatINR(a.amount_paise))}</View>
                ))}
            </View>
          )}
          {p.status !== 'voided' && p.amount_paise > p.allocated_paise && (
            <Txt variant="caption" color={colors.success[700]} style={{ marginTop: 8 }}>
              {formatINR(p.amount_paise - p.allocated_paise)} kept as advance credit.
            </Txt>
          )}
        </Card>
      )}
    </Screen>
  );
}
