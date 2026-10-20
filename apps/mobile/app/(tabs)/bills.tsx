import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { useResident } from '@pg/api-client/react';
import { INVOICE_PAYMENT_STATUS_LABELS, formatDate, formatINR, formatMonth } from '@pg/shared';
import { useResidentContext } from '../../src/session';
import { STATUS_TONE } from '../../src/status';
import { Badge, Card, Divider, EmptyState, ErrorView, LoadingList, Row, Screen, Segmented, Txt } from '../../src/ui';

export default function Bills() {
  const { tenantId, residentId } = useResidentContext();
  const q = useResident(tenantId, residentId);
  const [filter, setFilter] = useState<'unpaid' | 'all'>('unpaid');
  const bills = (q.data?.invoices ?? []).filter((i) => (filter === 'all' ? true : i.status === 'issued' && i.balance_paise > 0));

  return (
    <Screen title="Bills" subtitle="Rent and other charges from your PG" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'unpaid', label: 'To pay' },
          { value: 'all', label: 'All bills' },
        ]}
      />
      {q.isError ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <LoadingList />
      ) : bills.length === 0 ? (
        <EmptyState icon={FileText} title={filter === 'unpaid' ? 'Nothing to pay' : 'No bills yet'} description={filter === 'unpaid' ? 'You’re all paid up.' : undefined} />
      ) : (
        <Card padded={false}>
          {bills.map((i, idx) => (
            <View key={i.id}>
              {idx > 0 && <Divider />}
              <Row
                title={i.period_start ? `Rent · ${formatMonth(i.period_start)}` : `Bill ${i.invoice_number}`}
                subtitle={`Due ${formatDate(i.due_date)} · ${i.invoice_number}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Txt variant="label" tabular>
                      {formatINR(i.status === 'issued' && i.balance_paise > 0 ? i.balance_paise : i.total_paise)}
                    </Txt>
                    <Badge label={INVOICE_PAYMENT_STATUS_LABELS[i.payment_status]} tone={STATUS_TONE[i.payment_status]} />
                  </View>
                }
                onPress={() => router.push(`/bill/${i.id}`)}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
