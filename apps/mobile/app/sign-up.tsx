import { useState } from 'react';
import { router } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useBackend } from '@pg/api-client/react';
import { signUpSchema } from '@pg/validation';
import { Button, Card, EmptyState, Field, InlineError, Input, Screen, Txt } from '../src/ui';

export default function SignUp() {
  const { auth } = useBackend();
  const [v, setV] = useState({ fullName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const parsed = signUpSchema.safeParse(v);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      const res = await auth.signUp({ email: parsed.data.email, password: parsed.data.password, fullName: parsed.data.fullName });
      if (res.needsVerification) setSent(true);
      else router.replace('/');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        <EmptyState
          icon={MailCheck}
          title="Check your email"
          description={`We sent a confirmation link to ${v.email}. Open it, then come back and sign in.`}
          action={<Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/sign-in')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Create your account" subtitle="Set up your PG in a few minutes.">
      <Card style={{ gap: 16 }}>
        <Field label="Your name" error={errors.fullName}>
          <Input value={v.fullName} onChangeText={(t) => setV({ ...v, fullName: t })} autoComplete="name" invalid={!!errors.fullName} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input value={v.email} onChangeText={(t) => setV({ ...v, email: t })} autoCapitalize="none" keyboardType="email-address" autoComplete="email" invalid={!!errors.email} />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters.">
          <Input value={v.password} onChangeText={(t) => setV({ ...v, password: t })} secureTextEntry autoComplete="new-password" invalid={!!errors.password} />
        </Field>
        <InlineError error={error} />
        <Button title="Create account" loading={busy} onPress={() => void submit()} />
      </Card>
      <Txt variant="caption" style={{ textAlign: 'center' }}>You’ll verify your email before your workspace is created.</Txt>
    </Screen>
  );
}
