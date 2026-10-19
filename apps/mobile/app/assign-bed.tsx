import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useBackend, useResidents, useRooms, useTenantMutation } from '@pg/api-client/react';
import { formatINR, isISODate, paiseToRupeesInput, rupeesToPaise, todayISO } from '@pg/shared';
import { useWorkspaceContext } from '../src/session';
import { Button, Card, Field, IconButton, InlineError, Input, MoneyInput, Picker, Screen, Txt } from '../src/ui';

export default function AssignBed() {
  const params = useLocalSearchParams<{ residentId?: string; bedId?: string; fromNew?: string }>();
  const { tenantId } = useWorkspaceContext();
  const { data } = useBackend();
  const rooms = useRooms(tenantId);
  const residents = useResidents(tenantId, { status: 'unassigned', limit: 500 });
  const [residentId, setResidentId] = useState(params.residentId ?? '');
  const [bedId, setBedId] = useState(params.bedId ?? '');
  const [moveIn, setMoveIn] = useState(todayISO());
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [collected, setCollected] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const beds = useMemo(
    () =>
      (rooms.data ?? []).flatMap((r) =>
        r.beds
          .filter((b) => b.status === 'vacant')
          .map((b) => ({ value: b.id, label: `${r.property_name} · Room ${r.name} / ${b.label}`, description: `${formatINR(b.suggested_rent_paise)}/month${r.category ? ` · ${r.category}` : ''}`, rent: b.suggested_rent_paise, deposit: r.deposit_paise })),
      ),
    [rooms.data],
  );
  const mutation = useTenantMutation(tenantId, () =>
    data.assignBed({
      residentId,
      bedId,
      move_in_date: moveIn,
      monthly_rent_paise: rupeesToPaise(rent) ?? undefined,
      deposit_paise: rupeesToPaise(deposit) ?? 0,
      deposit_collected_paise: rupeesToPaise(collected) ?? undefined,
      deposit_method: 'cash',
    }),
  );

  const submit = () => {
    const e: Record<string, string> = {};
    if (!residentId) e.resident = 'Choose a resident';
    if (!bedId) e.bed = 'Choose a vacant bed';
    if (!isISODate(moveIn)) e.moveIn = 'Use YYYY-MM-DD';
    if (rupeesToPaise(rent) === null) e.rent = 'Enter the monthly rent';
    setErrors(e);
    if (Object.keys(e).length) return;
    mutation.mutate(undefined, { onSuccess: () => router.replace(`/resident/${residentId}`) });
  };

  return (
    <Screen
      title="Assign a bed"
      right={<IconButton icon={X} label="Close" onPress={() => (params.fromNew && residentId ? router.replace(`/resident/${residentId}`) : router.back())} />}
      footer={<Button title="Assign bed" loading={mutation.isPending} onPress={submit} />}
    >
      <Txt variant="caption">The agreed rent is saved with this stay. Later changes to room prices won’t affect it.</Txt>
      <Card style={{ gap: 16 }}>
        <Field label="Resident" required error={errors.resident}>
          <Picker
            title="Resident without a bed"
            searchable
            value={residentId}
            onChange={setResidentId}
            placeholder="Choose a resident"
            invalid={!!errors.resident}
            options={(residents.data?.rows ?? []).map((r) => ({ value: r.id, label: r.full_name, description: r.phone ?? undefined }))}
          />
        </Field>
        <Field label="Bed" required error={errors.bed}>
          <Picker
            title="Vacant beds"
            searchable
            value={bedId}
            invalid={!!errors.bed}
            onChange={(id) => {
              setBedId(id);
              const b = beds.find((x) => x.value === id);
              if (b) {
                setRent(paiseToRupeesInput(b.rent));
                if (b.deposit) setDeposit(paiseToRupeesInput(b.deposit));
              }
            }}
            placeholder={beds.length ? 'Choose a vacant bed' : 'No vacant beds'}
            options={beds}
          />
        </Field>
        <Field label="Move-in date (YYYY-MM-DD)" error={errors.moveIn}>
          <Input value={moveIn} onChangeText={setMoveIn} maxLength={10} keyboardType="numbers-and-punctuation" />
        </Field>
        <Field label="Monthly rent" required error={errors.rent}>
          <MoneyInput value={rent} onChangeText={setRent} invalid={!!errors.rent} />
        </Field>
        <Field label="Security deposit (agreed)">
          <MoneyInput value={deposit} onChangeText={setDeposit} />
        </Field>
        <Field label="Deposit collected now (cash)" hint="Leave blank if not yet paid.">
          <MoneyInput value={collected} onChangeText={setCollected} />
        </Field>
        <InlineError error={mutation.error} />
      </Card>
    </Screen>
  );
}
