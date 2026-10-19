import { useState } from 'react';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useBackend, useTenantMutation } from '@pg/api-client/react';
import { blankToNull, residentSchema } from '@pg/validation';
import { useWorkspaceContext } from '../../src/session';
import { Button, Card, Field, IconButton, InlineError, Input, Picker, Screen, Txt } from '../../src/ui';

export default function NewResident() {
  const { tenantId } = useWorkspaceContext();
  const { data } = useBackend();
  const [v, setV] = useState({ full_name: '', phone: '', email: '', gender: '' as '' | 'male' | 'female' | 'other', occupation: '', emergency_contact_name: '', emergency_contact_phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useTenantMutation(tenantId, (input: typeof v) =>
    data.createResident(tenantId!, {
      full_name: input.full_name.trim(),
      phone: blankToNull(input.phone),
      email: blankToNull(input.email),
      gender: input.gender || null,
      occupation: blankToNull(input.occupation),
      emergency_contact_name: blankToNull(input.emergency_contact_name),
      emergency_contact_phone: blankToNull(input.emergency_contact_phone),
    }),
  );
  const submit = () => {
    const parsed = residentSchema.safeParse(v);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    mutation.mutate(v, { onSuccess: (id) => router.replace({ pathname: '/assign-bed', params: { residentId: id, fromNew: '1' } }) });
  };
  const set = (k: keyof typeof v) => (t: string) => setV({ ...v, [k]: t });

  return (
    <Screen title="Add resident" right={<IconButton icon={X} label="Close" onPress={() => router.back()} />} footer={<Button title="Save and assign bed" loading={mutation.isPending} onPress={submit} />}>
      <Txt variant="caption">Only the name is required. Residents don’t need to install anything.</Txt>
      <Card style={{ gap: 16 }}>
        <Field label="Full name" required error={errors.full_name}>
          <Input value={v.full_name} onChangeText={set('full_name')} autoCapitalize="words" invalid={!!errors.full_name} />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input value={v.phone} onChangeText={set('phone')} keyboardType="phone-pad" invalid={!!errors.phone} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input value={v.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" invalid={!!errors.email} />
        </Field>
        <Field label="Gender">
          <Picker
            title="Gender"
            value={v.gender}
            onChange={(g) => setV({ ...v, gender: g })}
            placeholder="Prefer not to say"
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </Field>
        <Field label="Occupation">
          <Input value={v.occupation} onChangeText={set('occupation')} />
        </Field>
        <Field label="Emergency contact name">
          <Input value={v.emergency_contact_name} onChangeText={set('emergency_contact_name')} />
        </Field>
        <Field label="Emergency contact phone" error={errors.emergency_contact_phone}>
          <Input value={v.emergency_contact_phone} onChangeText={set('emergency_contact_phone')} keyboardType="phone-pad" />
        </Field>
        <InlineError error={mutation.error} />
      </Card>
    </Screen>
  );
}
