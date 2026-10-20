import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useInvoice } from '@pg/api-client/react';
import { INVOICE_PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, formatDate, formatINR, formatMonth } from '@pg/shared';
import { useResidentContext } from '../../src/session';
import { PayRentButton } from '../../src/pay';
import { Badge, Card, Divider, ErrorView, IconButton, LoadingList, Screen, Txt } from '../../src/ui';
import { STATUS_TONE } from '../../src/status';

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tenantId } = useResidentContext();
  const q = useInvoice(tenantId, id);
  const inv = q.data;
  const line = (label: string, value: string, strong?: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Txt variant={strong ? 'label' : 'caption'} style={strong ? { color: colors.gray[900] } : undefined}>
        {label}
      </Txt>
      <Txt variant="label" tabular style={strong ? { color: colors.gray[900] } : undefined}>
        {value}
      </Txt>
    </View>
  );

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <Txt variant="heading">Bill</Txt>
      </View>
      {q.isError ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : !inv ? (
        <LoadingList />
      ) : (
        <>
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt variant="overline">{inv.invoice_number}</Txt>
              <Badge label={INVOICE_PAYMENT_STATUS_LABELS[inv.payment_status]} tone={STATUS_TONE[inv.payment_status]} />
            </View>
            <Txt variant="title">{inv.period_start ? `Rent · ${formatMonth(inv.period_start)}` : 'Bill'}</Txt>
            <Txt variant="caption">
              {inv.business.name} · issued {formatDate(inv.issue_date)} · due {formatDate(inv.due_date)}
            </Txt>
            <View style={{ marginTop: 12 }}>
              {inv.items.map((it) => (
                <View key={it.id}>{line(it.description, formatINR(it.amount_paise))}</View>
              ))}
              <Divider />
              {line('Total', formatINR(inv.total_paise), true)}
              {line('Paid', formatINR(inv.paid_paise))}
              <Divider />
              {line('Balance', formatINR(inv.status === 'void' ? 0 : inv.balance_paise), true)}
            </View>
          </Card>

          {inv.status === 'issued' && inv.balance_paise > 0 && (
            <PayRentButton business={inv.business} amountPaise={inv.balance_paise} note={inv.period_start ? `Rent ${formatMonth(inv.period_start)}` : `Bill ${inv.invoice_number}`} />
          )}

          {inv.allocations.filter((a) => !a.voided_at).length > 0 && (
            <Card style={{ gap: 4 }}>
              <Txt variant="overline">Payments received</Txt>
              {inv.allocations
                .filter((a) => !a.voided_at)
                .map((a) => (
                  <View key={a.id}>{line(`${formatDate(a.paid_on)} · ${PAYMENT_METHOD_LABELS[a.method]}`, formatINR(a.amount_paise))}</View>
                ))}
            </Card>
          )}
          {inv.status === 'void' && <Txt variant="caption">This bill was cancelled by your PG{inv.void_reason ? `: ${inv.void_reason}` : ''}.</Txt>}
        </>
      )}
    </Screen>
  );
}
