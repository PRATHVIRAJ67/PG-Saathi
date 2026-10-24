import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, MapPin } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { toAppError } from '@pg/api-client';
import { queryKeys, useBackend } from '@pg/api-client/react';
import { GENDER_POLICY_LABELS, type JoinRequestInput } from '@pg/shared';
import { useAuth } from '../../src/session';
import { Button, Card, ErrorView, Field, IconButton, InlineError, Input, LoadingList, Picker, Screen, Segmented, Txt } from '../../src/ui';

const ROOM_PREFS = ['Single', 'Double sharing', 'Triple sharing', 'Any'];
/** Indian mobile number: digits only, at most 10 (a leading +91 / 0 is dropped). */
const tenDigits = (v: string) => v.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '').slice(0, 10);

const ID_PROOFS = ['Aadhaar', 'PAN card', 'Driving licence', 'Passport', 'Voter ID', 'College / company ID', 'Other'];

type Step = 'details' | 'account' | 'verify' | 'done';

/**
 * Join a PG from the app: your details, then your own login (email + password,
 * checked with an email code), then the request goes to the PG. When the owner
 * approves, this login opens your room, rent and bills.
 */
export default function JoinForm() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const { data, auth, mode } = useBackend();
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const info = useQuery({ queryKey: ['join-link', code], queryFn: () => data.joinLinkInfo(code), retry: false });
  const signedIn = state.status === 'signed_in';

  const [step, setStep] = useState<Step>('details');
  const [f, setF] = useState({
    full_name: '', phone: '', gender: '' as '' | 'male' | 'female' | 'other', occupation: '', organization: '',
    room_preference: '', preferred_move_in: '', id_proof_type: '', id_proof_number: '', permanent_address: '',
    emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relation: '', property_id: '', note: '',
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [touched, setTouched] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const needsProperty = !!info.data && !info.data.property && info.data.properties.length > 1;
  const detailsProblem =
    f.full_name.trim().length < 2 ? 'Enter your full name.'
    : !/^[6-9]\d{9}$/.test(f.phone) ? 'Enter your 10-digit mobile number.'
    : f.emergency_contact_phone && !/^\d{10}$/.test(f.emergency_contact_phone) ? 'Emergency contact phone should be 10 digits.'
    : needsProperty && !f.property_id ? 'Choose which property you want to join.'
    : f.preferred_move_in && !/^\d{4}-\d{2}-\d{2}$/.test(f.preferred_move_in) ? 'Write the move-in date as YYYY-MM-DD, e.g. 2026-11-01.'
    : null;

  const sendRequest = useMutation({
    mutationFn: async () => {
      try {
        const input = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])) as unknown as JoinRequestInput;
        return await data.submitJoinRequest(code, input);
      } catch (e) {
        throw toAppError(e);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myJoinRequests() });
      setStep('done');
    },
  });

  const account = useMutation({
    mutationFn: async () => {
      try {
        const r = await auth.signUp({ email: email.trim().toLowerCase(), password, fullName: f.full_name.trim() });
        if (r.alreadyRegistered) {
          // Already has a PG Sathi login: the same email and password signs them in.
          await auth.signIn({ email: email.trim().toLowerCase(), password });
          return 'signed_in' as const;
        }
        return r.session ? ('signed_in' as const) : ('verify' as const);
      } catch (e) {
        const err = toAppError(e);
        if (/invalid login/i.test(err.message)) {
          throw Object.assign(err, { message: 'This email already has a PG Sathi login, and that password doesn’t match it. Use your existing password.' });
        }
        throw err;
      }
    },
    onSuccess: (next) => {
      if (next === 'verify') setStep('verify');
      else sendRequest.mutate();
    },
  });

  const verify = useMutation({
    mutationFn: async () => {
      try {
        await auth.verifyEmailOtp(email.trim().toLowerCase(), otp.replace(/\s/g, ''), 'signup');
      } catch (e) {
        throw toAppError(e);
      }
    },
    onSuccess: () => sendRequest.mutate(),
  });

  const back = () => {
    if (step === 'account') setStep('details');
    else if (step === 'verify') setStep('account');
    else router.back();
  };

  if (info.isError) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
          <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
          <Txt variant="heading">Join a PG</Txt>
        </View>
        <ErrorView error={info.error} />
        <Button title="Scan again" variant="secondary" onPress={() => router.replace('/join')} />
      </Screen>
    );
  }
  if (!info.data) {
    return (
      <Screen>
        <LoadingList rows={3} />
      </Screen>
    );
  }
  const pg = info.data;
  const place = [pg.property?.locality, pg.property?.city ?? pg.city].filter(Boolean).join(', ');

  if (step === 'done') {
    return (
      <Screen>
        <View style={{ paddingTop: 48, alignItems: 'center', gap: 12 }}>
          <CheckCircle2 size={56} color={colors.success[600]} />
          <Txt variant="title" style={{ textAlign: 'center' }}>
            Request sent
          </Txt>
          <Txt style={{ textAlign: 'center', maxWidth: 320 }}>
            {pg.business_name} has your details. Once they approve and give you a bed, your room, rent and bills show up in this app.
          </Txt>
        </View>
        <Button title="OK" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={back} />
        <Txt variant="heading">{step === 'details' ? 'Your details' : step === 'account' ? 'Create your login' : 'Check your email'}</Txt>
      </View>

      <Card style={{ gap: 4 }}>
        <Txt variant="overline">Joining</Txt>
        <Txt variant="title">{pg.property?.name ?? pg.business_name}</Txt>
        {place ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MapPin size={14} color={colors.gray[500]} />
            <Txt variant="caption">{place}</Txt>
          </View>
        ) : null}
      </Card>

      {mode === 'demo-snapshot' && <Txt variant="caption">This is a read-only demo, so requests can’t be sent from it.</Txt>}

      {step === 'details' && (
        <>
          <Card style={{ gap: 14 }}>
            {needsProperty && (
              <Field label="Which property?" required>
                <Picker
                  title="Choose a property"
                  placeholder="Choose…"
                  value={f.property_id}
                  onChange={set('property_id')}
                  options={pg.properties.map((p) => ({ value: p.id, label: p.name, description: [p.locality, p.gender_policy !== 'any' ? GENDER_POLICY_LABELS[p.gender_policy] : null].filter(Boolean).join(' · ') }))}
                />
              </Field>
            )}
            <Field label="Full name" required>
              <Input value={f.full_name} onChangeText={set('full_name')} autoComplete="name" accessibilityLabel="Full name" />
            </Field>
            <Field label="Phone" required>
              <Input value={f.phone} onChangeText={(v) => set('phone')(tenDigits(v))} prefix="+91" keyboardType="number-pad" autoComplete="tel" maxLength={10} placeholder="9845000000" accessibilityLabel="Phone" />
            </Field>
            <Field label="Gender">
              <Segmented value={f.gender} onChange={(v) => setF((s) => ({ ...s, gender: v }))} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
            </Field>
            <Field label="Work / study" hint="e.g. Software engineer, Student">
              <Input value={f.occupation} onChangeText={set('occupation')} accessibilityLabel="Work or study" />
            </Field>
            <Field label="Company or college">
              <Input value={f.organization} onChangeText={set('organization')} accessibilityLabel="Company or college" />
            </Field>
          </Card>
          <Card style={{ gap: 14 }}>
            <Field label="Room you prefer">
              <Picker title="Room you prefer" placeholder="No preference" value={f.room_preference} onChange={set('room_preference')} options={ROOM_PREFS.map((r) => ({ value: r, label: r }))} />
            </Field>
            <Field label="When do you want to move in?" hint="YYYY-MM-DD, e.g. 2026-11-01">
              <Input value={f.preferred_move_in} onChangeText={set('preferred_move_in')} keyboardType="numbers-and-punctuation" placeholder="2026-11-01" accessibilityLabel="Move-in date" />
            </Field>
            <Field label="ID proof">
              <Picker title="ID proof" placeholder="Choose…" value={f.id_proof_type} onChange={set('id_proof_type')} options={ID_PROOFS.map((p) => ({ value: p, label: p }))} />
            </Field>
            <Field label="ID number" hint="You’ll show the original at the PG.">
              <Input value={f.id_proof_number} onChangeText={set('id_proof_number')} autoCapitalize="characters" accessibilityLabel="ID number" />
            </Field>
            <Field label="Home address">
              <Input value={f.permanent_address} onChangeText={set('permanent_address')} multiline accessibilityLabel="Home address" />
            </Field>
          </Card>
          <Card style={{ gap: 14 }}>
            <Field label="Emergency contact">
              <Input value={f.emergency_contact_name} onChangeText={set('emergency_contact_name')} placeholder="Name" accessibilityLabel="Emergency contact name" />
            </Field>
            <Field label="Their phone">
              <Input value={f.emergency_contact_phone} onChangeText={(v) => set('emergency_contact_phone')(tenDigits(v))} prefix="+91" keyboardType="number-pad" maxLength={10} accessibilityLabel="Emergency contact phone" />
            </Field>
            <Field label="Relation">
              <Input value={f.emergency_contact_relation} onChangeText={set('emergency_contact_relation')} placeholder="e.g. Father" accessibilityLabel="Relation" />
            </Field>
            <Field label="Anything the PG should know?">
              <Input value={f.note} onChangeText={set('note')} multiline accessibilityLabel="Note for the PG" />
            </Field>
          </Card>
          {touched && detailsProblem ? <Txt variant="caption" color={colors.danger[600]}>{detailsProblem}</Txt> : null}
          <InlineError error={sendRequest.error} />
          <Button
            title={signedIn ? 'Send request' : 'Next: create your login'}
            loading={sendRequest.isPending}
            onPress={() => {
              setTouched(true);
              if (detailsProblem) return;
              if (signedIn) sendRequest.mutate();
              else setStep('account');
            }}
          />
        </>
      )}

      {step === 'account' && (
        <Card style={{ gap: 14 }}>
          <Txt>You’ll sign in to PG Sathi with this. Once {pg.business_name} approves you, your room and rent show up here.</Txt>
          <Field label="Email" required>
            <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" accessibilityLabel="Email" />
          </Field>
          <Field label="Choose a password" required hint="At least 8 characters.">
            <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel="Password" />
          </Field>
          <InlineError error={account.error ?? sendRequest.error} />
          <Button
            title="Continue"
            loading={account.isPending || sendRequest.isPending}
            disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || password.length < 8}
            onPress={() => account.mutate()}
          />
          <Txt variant="caption" style={{ textAlign: 'center' }}>
            Already have a PG Sathi login? Enter the same email and password.
          </Txt>
        </Card>
      )}

      {step === 'verify' && (
        <Card style={{ gap: 14 }}>
          <Txt>
            We emailed a 6-digit code to <Txt variant="label">{email.trim()}</Txt>. Enter it to confirm your email.
          </Txt>
          <Field label="Code">
            <Input value={otp} onChangeText={setOtp} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} accessibilityLabel="Code from the email" />
          </Field>
          <InlineError error={verify.error ?? sendRequest.error} />
          <Button title="Verify and send request" loading={verify.isPending || sendRequest.isPending} disabled={otp.replace(/\s/g, '').length < 6} onPress={() => verify.mutate()} />
          <Button
            title="Send a new code"
            variant="ghost"
            onPress={() => void auth.resendVerification(email.trim().toLowerCase()).catch(() => undefined)}
          />
          <Txt variant="caption" style={{ textAlign: 'center' }}>
            Can’t find it? Check spam or promotions.
          </Txt>
        </Card>
      )}
    </Screen>
  );
}
