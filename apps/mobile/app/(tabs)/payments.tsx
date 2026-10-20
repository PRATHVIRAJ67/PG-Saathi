import { View } from 'react-native';
import { router } from 'expo-router';
import { CreditCard } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useResident } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, formatDate, formatINR } from '@pg/shared';
import { useResidentContext } from '../../src/session';
import { Badge, Card, Divider, EmptyState, ErrorView, LoadingList, Row, Screen, Txt } from '../../src/ui';

export default function Payments() {
  const { tenantId, residentId } = useResidentContext();
  const q = useResident(tenantId, residentId);
  const payments = q.data?.payments ?? [];
  const total = payments.filter((p) => p.status === 'recorded' || p.status === 'succeeded').reduce((n, p) => n + p.amount_paise, 0);

  return (
    <Screen title="Payments" subtitle="Receipts for money your PG has received" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isError ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <LoadingList />
      ) : payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" description="When your PG records a payment from you, the receipt appears here." />
      ) : (
        <>
          <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt variant="caption">Total paid</Txt>
            <Txt variant="title" tabular color={colors.success[700]}>
              {formatINR(total)}
            </Txt>
          </Card>
          <Card padded={false}>
            {payments.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <Divider />}
                <Row
                  title={formatINR(p.amount_paise)}
                  subtitle={`${formatDate(p.paid_on)} · ${PAYMENT_METHOD_LABELS[p.method]} · ${p.receipt_number}`}
                  right={p.status === 'voided' ? <Badge label="Voided" tone="danger" /> : <Badge label="Received" tone="success" />}
                  onPress={() => router.push(`/payment/${p.id}`)}
                />
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
