import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { newIdempotencyKey } from '@pg/api-client';
import { useBackend, useResident, useResidents, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import { PAYMENT_METHOD_LABELS, formatINR, formatMonth, paiseToRupeesInput, previewAllocation, rupeesToPaise, todayISO, type PaymentMethod } from '@pg/shared';
import { paymentSchema } from '@pg/validation';
import { useWorkspaceContext } from '../../src/session';
import { Button, Card, Field, IconButton, InlineError, Input, MoneyInput, Picker, Screen, Txt } from '../../src/ui';

export default function RecordPayment() {
  const params = useLocalSearchParams<{ residentId?: string }>();
  const { tenantId } = useWorkspaceContext();
  const { data } = useBackend();
  const ws = useWorkspace(tenantId);
  const methods = ws.data?.settings.payment_methods ?? ['cash', 'upi', 'bank_transfer'];
  const residents = useResidents(tenantId, { status: 'all', limit: 500 });
  // One key per screen visit; a retried submit reuses it, so no duplicates.
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [v, setV] = useState({ resident_id: params.residentId ?? '', amount: '', paid_on: todayISO(), method: methods[0] ?? 'cash', reference: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const resident = useResident(tenantId, v.resident_id || null);
  const open = useMemo(() => (resident.data?.invoices ?? []).filter((i) => i.status === 'issued' && i.balance_paise > 0), [resident.data]);
  const outstanding = open.reduce((n, i) => n + i.balance_paise, 0);
  const preview = previewAllocation(rupeesToPaise(v.amount) ?? 0, open.map((i) => ({ id: i.id, due_date: i.due_date, balance_paise: i.balance_paise })));
  const mutation = useTenantMutation(tenantId, data.recordPayment, { onSuccess: (id) => router.replace(`/payment/${id}`) });

  const submit = () => {
    const parsed = paymentSchema.safeParse(v);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    mutation.mutate({
      residentId: parsed.data.resident_id,
      amount_paise: rupeesToPaise(parsed.data.amount)!,
      paid_on: parsed.data.paid_on,
      method: parsed.data.method as PaymentMethod,
      reference: parsed.data.reference || null,
      notes: parsed.data.notes || null,
      idempotency_key: idempotencyKey,
      allow_duplicate: mutation.error?.code === 'possible_duplicate',
    });
  };

  return (
    <Screen
      title="Record payment"
      subtitle="Money already received — cash, UPI or bank transfer"
      right={<IconButton icon={X} label="Close" onPress={() => router.back()} />}
      footer={<Button title={mutation.error?.code === 'possible_duplicate' ? 'Record anyway' : 'Record payment'} loading={mutation.isPending} onPress={submit} />}
    >
      <Card style={{ gap: 16 }}>
        <Field label="Resident" required error={errors.resident_id}>
          <Picker
            title="Choose resident"
            searchable
            value={v.resident_id}
            onChange={(id) => setV({ ...v, resident_id: id })}
            placeholder="Choose a resident"
            invalid={!!errors.resident_id}
            options={(residents.data?.rows ?? []).map((r) => ({ value: r.id, label: r.full_name, description: r.stay ? `${r.stay.room_name}/${r.stay.bed_label}${r.outstanding_paise ? ` · ${formatINR(r.outstanding_paise)} due` : ''}` : (r.phone ?? undefined) }))}
          />
        </Field>
        {v.resident_id ? (
          <View style={{ backgroundColor: colors.gray[50], borderRadius: 10, padding: 12, gap: 4 }}>
            <Txt variant="caption">Outstanding</Txt>
            <Txt variant="heading" tabular>{formatINR(outstanding)}</Txt>
            {open.slice(0, 4).map((i) => {
              const applied = preview.allocations.find((a) => a.invoice_id === i.id)?.amount_paise ?? 0;
              return (
                <Txt key={i.id} variant="caption">
                  {i.period_start ? formatMonth(i.period_start) : i.invoice_number}: {formatINR(i.balance_paise)}
                  {applied ? ` → pays ${formatINR(applied)}` : ''}
                </Txt>
              );
            })}
            {preview.credit_paise > 0 && <Txt variant="caption" color={colors.success[700]}>{formatINR(preview.credit_paise)} becomes advance credit</Txt>}
            {outstanding > 0 && <Button title={`Fill ${formatINR(outstanding)}`} variant="ghost" compact onPress={() => setV({ ...v, amount: paiseToRupeesInput(outstanding) })} style={{ alignSelf: 'flex-start', marginLeft: -12 }} />}
          </View>
        ) : null}
        <Field label="Amount received" required error={errors.amount}>
          <MoneyInput accessibilityLabel="Amount received" value={v.amount} onChangeText={(t) => setV({ ...v, amount: t })} invalid={!!errors.amount} />
        </Field>
        <Field label="Date (YYYY-MM-DD)" required error={errors.paid_on}>
          <Input accessibilityLabel="Payment date" value={v.paid_on} onChangeText={(t) => setV({ ...v, paid_on: t })} keyboardType="numbers-and-punctuation" maxLength={10} invalid={!!errors.paid_on} />
        </Field>
        <Field label="Method">
          <Picker title="Payment method" value={v.method} onChange={(m) => setV({ ...v, method: m })} placeholder="Choose" options={methods.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
        </Field>
        <Field label="Reference" hint="UTR / transaction ID, if any.">
          <Input accessibilityLabel="Reference" value={v.reference} onChangeText={(t) => setV({ ...v, reference: t })} autoCapitalize="characters" />
        </Field>
        <InlineError error={mutation.error} />
      </Card>
    </Screen>
  );
}
