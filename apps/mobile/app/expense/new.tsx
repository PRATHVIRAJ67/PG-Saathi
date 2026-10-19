import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useBackend, useProperties, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, rupeesToPaise, todayISO, type PaymentMethod } from '@pg/shared';
import { blankToNull, expenseSchema } from '@pg/validation';
import { useWorkspaceContext } from '../../src/session';
import { Button, Card, Field, IconButton, InlineError, Input, MoneyInput, Picker, Screen, Segmented } from '../../src/ui';

export default function NewExpense() {
  const { tenantId, propertyId } = useWorkspaceContext();
  const { data } = useBackend();
  const ws = useWorkspace(tenantId);
  const properties = useProperties(tenantId);
  const categories = ws.data?.settings.expense_categories ?? [];
  const [v, setV] = useState({ property_id: propertyId ?? '', category: '', amount: '', expense_date: todayISO(), payee: '', method: 'upi', reference: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useTenantMutation(tenantId, () =>
    data.createExpense(tenantId!, {
      property_id: v.property_id || null,
      category: v.category.trim(),
      amount_paise: rupeesToPaise(v.amount)!,
      expense_date: v.expense_date,
      payee: blankToNull(v.payee),
      method: (v.method || null) as PaymentMethod | null,
      notes: blankToNull(v.notes),
    }),
  );
  const submit = () => {
    const parsed = expenseSchema.safeParse(v);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    mutation.mutate(undefined, { onSuccess: () => router.back() });
  };

  return (
    <Screen title="Add expense" right={<IconButton icon={X} label="Close" onPress={() => router.back()} />} footer={<Button title="Save expense" loading={mutation.isPending} onPress={submit} />}>
      <Card style={{ gap: 16 }}>
        <Field label="Category" required error={errors.category}>
          <View style={{ gap: 10 }}>
            <Segmented value={v.category} onChange={(c) => setV({ ...v, category: c })} options={categories.map((c) => ({ value: c, label: c }))} />
            <Input value={v.category} onChangeText={(t) => setV({ ...v, category: t })} placeholder="Or type a category" invalid={!!errors.category} />
          </View>
        </Field>
        <Field label="Amount" required error={errors.amount}>
          <MoneyInput value={v.amount} onChangeText={(t) => setV({ ...v, amount: t })} invalid={!!errors.amount} />
        </Field>
        <Field label="Date (YYYY-MM-DD)" error={errors.expense_date}>
          <Input value={v.expense_date} onChangeText={(t) => setV({ ...v, expense_date: t })} maxLength={10} keyboardType="numbers-and-punctuation" />
        </Field>
        <Field label="Property">
          <Picker title="Property" value={v.property_id || 'all'} onChange={(id) => setV({ ...v, property_id: id === 'all' ? '' : id })} placeholder="Business-wide" options={[{ value: 'all', label: 'Business-wide' }, ...(properties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field label="Paid to">
          <Input value={v.payee} onChangeText={(t) => setV({ ...v, payee: t })} />
        </Field>
        <Field label="Paid via">
          <Picker title="Method" value={v.method as PaymentMethod} onChange={(m) => setV({ ...v, method: m })} placeholder="Choose" options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
        </Field>
        <InlineError error={mutation.error} />
      </Card>
    </Screen>
  );
}
