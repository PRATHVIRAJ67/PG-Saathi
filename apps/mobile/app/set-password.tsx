import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useBackend } from '@pg/api-client/react';
import { useAuth } from '../src/session';
import { Button, Card, Field, InlineError, Input, Screen, Txt } from '../src/ui';

/**
 * First sign-in with a temporary password from the PG (emailed or shared):
 * the resident chooses their own password before anything else.
 */
export default function SetPassword() {
  const { auth } = useBackend();
  const { state, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (state.status === 'signed_out') return <Redirect href="/sign-in" />;
  const problem = password.length < 8 ? 'At least 8 characters.' : password !== confirm ? 'The two passwords don’t match.' : null;

  return (
    <Screen>
      <View style={{ paddingTop: 32, gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent[50], alignItems: 'center', justifyContent: 'center' }}>
          <KeyRound size={26} color={colors.accent[600]} />
        </View>
        <Txt variant="display">Choose your password</Txt>
        <Txt>You signed in with a temporary password from your PG. Set your own so only you know it.</Txt>
      </View>
      <Card style={{ gap: 16 }}>
        <Field label="New password" hint="At least 8 characters.">
          <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel="New password" />
        </Field>
        <Field label="Type it again">
          <Input value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel="Confirm new password" />
        </Field>
        {password && confirm && problem ? <Txt variant="caption" color={colors.danger[600]}>{problem}</Txt> : null}
        <InlineError error={error} />
        <Button
          title="Save and continue"
          loading={busy}
          disabled={!!problem}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await auth.updatePassword(password);
              router.replace('/');
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
      <Button title="Sign out" variant="ghost" onPress={() => void signOut().then(() => router.replace('/sign-in'))} />
    </Screen>
  );
}
