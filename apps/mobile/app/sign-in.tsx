import { useState } from 'react';
import { View } from 'react-native';
import { Link, router } from 'expo-router';
import { Building2 } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useBackend } from '@pg/api-client/react';
import { signInSchema } from '@pg/validation';
import { Button, Card, Field, InlineError, Input, Screen, Txt } from '../src/ui';

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
      <View style={{ paddingTop: 24, gap: 8 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.navy[900], alignItems: 'center', justifyContent: 'center' }}>
          <Building2 size={22} color={colors.white} />
        </View>
        <Txt variant="display" style={{ marginTop: 12 }}>Welcome back</Txt>
        <Txt>Manage your PG from anywhere.</Txt>
      </View>
      {mode === 'demo-snapshot' && demo ? (
        <Card>
          <Txt variant="heading">Explore the sample workspace</Txt>
          <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>
            This build has no Supabase connection, so it shows a read-only snapshot of fictional demo data.
          </Txt>
          <Button title="Open sample workspace" variant="accent" loading={busy} onPress={() => void submit({ email: demo.sampleAccount?.email ?? '', password: '' })} />
        </Card>
      ) : (
        <Card style={{ gap: 16 }}>
          <Field label="Email" error={fieldErrors.email}>
            <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" invalid={!!fieldErrors.email} />
          </Field>
          <Field label="Password" error={fieldErrors.password}>
            <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" invalid={!!fieldErrors.password} onSubmitEditing={() => void submit()} />
          </Field>
          <InlineError error={error} />
          <Button title="Sign in" loading={busy} onPress={() => void submit()} />
        </Card>
      )}
      {mode === 'supabase' && (
        <Txt style={{ textAlign: 'center' }}>
          New here?{' '}
          <Link href="/sign-up" style={{ color: colors.accent[700], fontFamily: 'Inter_600SemiBold' }}>
            Create your account
          </Link>
        </Txt>
      )}
    </Screen>
  );
}
