import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, CalendarCheck, FileText } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useBackend, useDashboard, useInvoices, useTenantMutation } from '@pg/api-client/react';
import { INVOICE_PAYMENT_STATUS_LABELS, formatDate, formatINR, formatMonth, startOfMonthISO, todayISO } from '@pg/shared';
import { useWorkspaceContext } from '../src/session';
import { Badge, Button, Card, Divider, EmptyState, ErrorView, IconButton, InlineError, LoadingList, Row, Screen, Segmented, Txt } from '../src/ui';

const tone = { paid: 'success', partially_paid: 'accent', pending: 'neutral', overdue: 'danger', void: 'neutral' } as const;

export default function Rent() {
  const { tenantId, propertyId, can } = useWorkspaceContext();
  const { data } = useBackend();
  const month = startOfMonthISO(todayISO());
  const [status, setStatus] = useState<'open' | 'overdue' | 'paid' | 'all'>('open');
  const invoices = useInvoices(tenantId, { status, property_id: propertyId, limit: 200 });
  const dash = useDashboard(tenantId, propertyId);
  const pending = dash.data?.finance?.stays_without_invoice ?? 0;
  const generate = useTenantMutation(tenantId, () => data.generateRentInvoices(tenantId!, month, propertyId));

  return (
    <Screen refreshing={invoices.isRefetching} onRefresh={() => void invoices.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <Txt variant="title">Rent bills</Txt>
      </View>
      {can('finance.write') && (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <CalendarCheck size={20} color={colors.accent[600]} />
            <Txt variant="heading">{formatMonth(month)}</Txt>
          </View>
          <Txt variant="caption">
            {pending > 0 ? `${pending} staying residents have no rent bill this month.` : 'Everyone staying is billed for this month.'} Safe to run more than once — billed residents are skipped.
          </Txt>
          {generate.data && <Txt variant="caption" color={colors.success[700]}>Created {generate.data.created} bills · {formatINR(generate.data.total_paise)}</Txt>}
          <InlineError error={generate.error} />
          <Button title={pending > 0 ? `Generate ${pending} rent bills` : 'Nothing to generate'} disabled={pending === 0} loading={generate.isPending} onPress={() => generate.mutate()} />
        </Card>
      )}
      <Segmented value={status} onChange={setStatus} options={[{ value: 'open', label: 'Unpaid' }, { value: 'overdue', label: 'Overdue' }, { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' }]} />
      {invoices.isError ? (
        <ErrorView error={invoices.error} onRetry={() => void invoices.refetch()} />
      ) : invoices.isPending ? (
        <LoadingList />
      ) : invoices.data.rows.length === 0 ? (
        <EmptyState icon={FileText} title="No bills here" />
      ) : (
        <Card padded={false}>
          {invoices.data.rows.map((i, idx) => (
            <View key={i.id}>
              {idx > 0 && <Divider />}
              <Row
                title={i.resident_name}
                subtitle={`${i.period_start ? formatMonth(i.period_start) : i.invoice_number} · due ${formatDate(i.due_date)}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Txt variant="label" tabular>{formatINR(i.status === 'void' ? i.total_paise : i.balance_paise || i.total_paise)}</Txt>
                    <Badge label={INVOICE_PAYMENT_STATUS_LABELS[i.payment_status]} tone={tone[i.payment_status]} />
                  </View>
                }
                onPress={() => router.push(`/resident/${i.resident_id}`)}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
