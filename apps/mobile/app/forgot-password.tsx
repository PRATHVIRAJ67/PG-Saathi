import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, KeyRound } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useBackend } from '@pg/api-client/react';
import { Button, Card, Field, IconButton, InlineError, Input, Screen, Txt } from '../src/ui';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Forgot password: email → code from the reset email → new password.
 * Only existing logins get an email; the screen looks the same either way so it
 * never reveals who has an account. Verifying the code signs the resident in,
 * then their new password is saved (which also clears any temporary-password flag).
 */
export default function ForgotPassword() {
  const { auth } = useBackend();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const address = email.trim().toLowerCase();
  const digits = code.replace(/\s/g, '');

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.requestPasswordReset(address);
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.verifyEmailOtp(address, digits, 'recovery');
      await auth.updatePassword(password);
      router.replace('/');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))} />
        <Txt variant="heading">Forgot password</Txt>
      </View>
      <View style={{ gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent[50], alignItems: 'center', justifyContent: 'center' }}>
          <KeyRound size={26} color={colors.accent[600]} />
        </View>
        <Txt>
          {sent
            ? `If ${address} has a PG Sathi login, we’ve emailed it a code. Enter it below with your new password.`
            : 'Enter the email you sign in with. We’ll email you a code to set a new password.'}
        </Txt>
      </View>

      {!sent ? (
        <Card style={{ gap: 16 }}>
          <Field label="Email">
            <Input
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel="Email"
              onSubmitEditing={() => EMAIL.test(address) && void sendCode()}
            />
          </Field>
          <InlineError error={error} />
          <Button title="Send code" loading={busy} disabled={!EMAIL.test(address)} onPress={() => void sendCode()} />
        </Card>
      ) : (
        <Card style={{ gap: 16 }}>
          <Field label="Code from the email">
            <Input value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} accessibilityLabel="Code from the email" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel="New password" />
          </Field>
          <InlineError error={error} />
          <Button title="Set new password" loading={busy} disabled={digits.length < 6 || password.length < 8} onPress={() => void reset()} />
          <Button
            title="Send a new code"
            variant="ghost"
            onPress={() => {
              setCode('');
              void sendCode();
            }}
          />
          <Txt variant="caption" style={{ textAlign: 'center' }}>
            Can’t find it? Check spam or promotions.
          </Txt>
        </Card>
      )}
    </Screen>
  );
}
