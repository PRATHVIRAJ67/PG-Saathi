import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useBackend, useResident } from '@pg/api-client/react';
import { formatDate } from '@pg/shared';
import { passwordField } from '@pg/validation';
import { useAuth, useResidentContext } from '../../src/session';
import { Avatar, Button, Card, Field, InlineError, Input, Picker, Row, Screen, SectionHeader, Txt } from '../../src/ui';

export default function Profile() {
  const { auth, mode } = useBackend();
  const { signOut } = useAuth();
  const { me, links, link, tenantId, residentId, switchTo } = useResidentContext();
  const q = useResident(tenantId, residentId);
  const r = q.data;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const detail = (label: string, value: string | null | undefined) => (
    <View key={label} style={{ gap: 2 }}>
      <Txt variant="caption">{label}</Txt>
      <Txt variant="label" style={{ color: colors.gray[900] }}>
        {value || '—'}
      </Txt>
    </View>
  );

  return (
    <Screen title="Profile">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={r?.full_name ?? link?.resident_name ?? '?'} size={48} />
        <View style={{ flex: 1 }}>
          <Txt variant="heading">{r?.full_name ?? link?.resident_name}</Txt>
          <Txt variant="caption">{me.data?.user.email}</Txt>
        </View>
      </Card>

      {links.length > 1 && (
        <Field label="PG">
          <Picker
            title="Choose PG"
            value={residentId ?? ''}
            onChange={switchTo}
            placeholder="Choose"
            options={links.map((l) => ({ value: l.resident_id, label: l.tenant_name }))}
          />
        </Field>
      )}

      <View>
        <SectionHeader title="Your details" />
        <Card style={{ gap: 14 }}>
          {detail('Phone', r?.phone)}
          {detail('Email', r?.email)}
          {detail('Occupation', r?.occupation)}
          {detail('Emergency contact', [r?.emergency_contact_name, r?.emergency_contact_relation, r?.emergency_contact_phone].filter(Boolean).join(' · '))}
          <Txt variant="caption">To change these details, ask your PG. They keep your records up to date.</Txt>
        </Card>
      </View>

      {r && r.stays.length > 0 && (
        <View>
          <SectionHeader title="Stay history" />
          <Card padded={false}>
            {r.stays.map((s) => (
              <Row
                key={s.id}
                title={`${s.property_name} · Room ${s.room_name} / ${s.bed_label}`}
                subtitle={`${formatDate(s.move_in_date)} → ${s.move_out_date ? formatDate(s.move_out_date) : 'present'}`}
              />
            ))}
          </Card>
        </View>
      )}

      {mode === 'supabase' && (
        <View>
          <SectionHeader title="Change password" />
          <Card style={{ gap: 12 }}>
            <Field label="New password" hint="At least 8 characters.">
              <Input value={password} onChangeText={(t) => { setPassword(t); setSaved(false); }} secureTextEntry autoComplete="new-password" accessibilityLabel="New password" />
            </Field>
            <InlineError error={error} />
            {saved && <Txt variant="caption" color={colors.success[700]}>Password updated.</Txt>}
            <Button
              title="Update password"
              variant="secondary"
              loading={busy}
              disabled={!passwordField.safeParse(password).success}
              onPress={async () => {
                setBusy(true);
                setError(null);
                try {
                  await auth.updatePassword(password);
                  setPassword('');
                  setSaved(true);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Card>
        </View>
      )}

      <Card padded={false}>
        <Row title="Sign out" left={<LogOut size={20} color={colors.danger[600]} />} onPress={() => void signOut().then(() => router.replace('/sign-in'))} />
      </Card>
    </Screen>
  );
}
