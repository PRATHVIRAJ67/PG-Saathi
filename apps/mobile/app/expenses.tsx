import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Receipt } from 'lucide-react-native';
import { useExpenses } from '@pg/api-client/react';
import { addMonthsISO, endOfMonthISO, formatINR, formatMonth, formatShortDate, startOfMonthISO, todayISO } from '@pg/shared';
import { useWorkspaceContext } from '../src/session';
import { Card, Divider, EmptyState, ErrorView, IconButton, LoadingList, Row, Screen, Txt } from '../src/ui';

export default function Expenses() {
  const { tenantId, propertyId, can } = useWorkspaceContext();
  const [month, setMonth] = useState(startOfMonthISO(todayISO()));
  const q = useExpenses(tenantId, { from: month, to: endOfMonthISO(month), property_id: propertyId, limit: 200 });
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <Txt variant="title" style={{ flex: 1 }}>Expenses</Txt>
        {can('finance.write') && <IconButton icon={Plus} label="Add expense" onPress={() => router.push('/expense/new')} />}
      </View>
      <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton icon={ChevronLeft} label="Previous month" onPress={() => setMonth(addMonthsISO(month, -1))} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="caption">{formatMonth(month)}</Txt>
          <Txt variant="title" tabular>{formatINR(q.data?.totals.amount_paise ?? 0)}</Txt>
        </View>
        <IconButton icon={ChevronRight} label="Next month" onPress={() => setMonth(addMonthsISO(month, 1))} />
      </Card>
      {q.isError ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <LoadingList />
      ) : q.data.rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No expenses this month" />
      ) : (
        <Card padded={false}>
          {q.data.rows.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <Divider />}
              <Row title={e.category} subtitle={`${formatShortDate(e.expense_date)} · ${e.payee ?? e.property_name ?? 'Business-wide'}`} right={<Txt variant="label" tabular>{formatINR(e.amount_paise)}</Txt>} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
