import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, CreditCard, Plus } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { usePayments } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, addMonthsISO, endOfMonthISO, formatINR, formatMonth, formatShortDate, startOfMonthISO, todayISO } from '@pg/shared';
import { useWorkspaceContext } from '../../src/session';
import { Avatar, Badge, Card, EmptyState, ErrorView, IconButton, LoadingList, Row, Screen, Txt } from '../../src/ui';

export default function Payments() {
  const { tenantId, propertyId, can } = useWorkspaceContext();
  const [month, setMonth] = useState(startOfMonthISO(todayISO()));
  const allowed = can('finance.read');
  const q = usePayments(tenantId, { from: month, to: endOfMonthISO(month), property_id: propertyId, status: 'all', limit: 200 }, { enabled: allowed });

  if (!allowed) {
    return (
      <Screen title="Payments">
        <EmptyState icon={CreditCard} title="No access" description="Your role can’t view payments." />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} title="Payments" right={can('finance.write') ? <IconButton icon={Plus} label="Record payment" onPress={() => router.push('/payment/new')} /> : undefined}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton icon={ChevronLeft} label="Previous month" onPress={() => setMonth(addMonthsISO(month, -1))} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt variant="caption">{formatMonth(month)}</Txt>
            <Txt variant="title" tabular color={colors.success[700]}>
              {formatINR(q.data?.totals.amount_paise ?? 0)}
            </Txt>
          </View>
          <IconButton icon={ChevronRight} label="Next month" onPress={() => setMonth(addMonthsISO(month, 1))} />
        </Card>
      </View>
      {q.isError ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <View style={{ paddingHorizontal: 16 }}>
          <LoadingList rows={6} />
        </View>
      ) : (
        <FlatList
          data={q.data.rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} colors={[colors.accent[600]]} />}
          ListEmptyComponent={<EmptyState icon={CreditCard} title="No payments this month" />}
          renderItem={({ item: p }) => (
            <Card padded={false} style={{ marginBottom: 8 }}>
              <Row
                title={p.resident_name}
                subtitle={`${formatShortDate(p.paid_on)} · ${PAYMENT_METHOD_LABELS[p.method]} · ${p.receipt_number}`}
                left={<Avatar name={p.resident_name} />}
                right={
                  p.status === 'voided' ? (
                    <Badge label="Voided" tone="danger" />
                  ) : (
                    <Txt variant="label" tabular color={colors.success[700]}>
                      {formatINR(p.amount_paise)}
                    </Txt>
                  )
                }
                onPress={() => router.push(`/payment/${p.id}`)}
              />
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
