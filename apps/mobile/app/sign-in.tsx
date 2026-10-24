import { useState } from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { QrCode } from 'lucide-react-native';
import { useBackend } from '@pg/api-client/react';
import { signInSchema } from '@pg/validation';
import { Button, Card, Field, InlineError, Input, Screen, Txt } from '../src/ui';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logo = require('../assets/icon.png');

export default function SignIn() {
  const { auth, mode, demo } = useBackend();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (creds?: { email: string; password: string }) => {
    setError(null);
    const parsed = signInSchema.safeParse(creds ?? { email, password });
    if (!creds && !parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await auth.signIn(creds ?? { email: email.trim(), password });
      router.replace('/');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: 32, gap: 8 }}>
        <Image source={logo} style={{ width: 56, height: 56, borderRadius: 14 }} accessibilityIgnoresInvertColors />
        <Txt variant="display" style={{ marginTop: 16 }}>
          Welcome to PG Sathi
        </Txt>
        <Txt>Sign in with your email and password.</Txt>
      </View>
      {mode === 'demo-snapshot' && demo ? (
        <Card>
          <Txt variant="heading">Explore the demo</Txt>
          <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>
            This build isn’t connected to a server, so it shows a read-only sample resident.
          </Txt>
          <Button title="Open sample resident" variant="accent" loading={busy} onPress={() => void submit({ email: demo.sampleAccount?.email ?? '', password: '' })} />
        </Card>
      ) : (
        <Card style={{ gap: 16 }}>
          <Field label="Email" error={fieldErrors.email}>
            <Input
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel="Email"
              invalid={!!fieldErrors.email}
            />
          </Field>
          <Field label="Password" error={fieldErrors.password}>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              accessibilityLabel="Password"
              invalid={!!fieldErrors.password}
              onSubmitEditing={() => void submit()}
            />
          </Field>
          <InlineError error={error} />
          <Button title="Sign in" loading={busy} onPress={() => void submit()} />
          <Button title="Forgot password?" variant="ghost" compact onPress={() => router.push(email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : '/forgot-password')} />
        </Card>
      )}
      {mode !== 'demo-snapshot' && (
        <Card style={{ gap: 10 }}>
          <Txt variant="heading">New to a PG?</Txt>
          <Txt variant="caption">Scan your PG’s join QR code, fill in your details and create your login. You’ll get in once the PG approves you.</Txt>
          <Button title="Join a PG by scanning QR" icon={QrCode} variant="secondary" onPress={() => router.push('/join')} />
        </Card>
      )}
    </Screen>
  );
}
