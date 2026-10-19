import { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { newIdempotencyKey } from '@pg/api-client';
import { queryKeys, useBackend, useMyContext, useProperties } from '@pg/api-client/react';
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, rupeesToPaise, type PropertyType } from '@pg/shared';
import { businessSchema } from '@pg/validation';
import { useAuth, usePrefs } from '../src/session';
import { Button, Card, Field, InlineError, Input, MoneyInput, Picker, ProgressBar, Screen, Txt } from '../src/ui';

/**
 * Compact mobile onboarding: business → first property → rooms → done. Rent
 * defaults, charges and residents can be refined later (or on the web).
 */
export default function Onboarding() {
  const { data } = useBackend();
  const { state, signOut } = useAuth();
  const me = useMyContext();
  const queryClient = useQueryClient();
  const setActive = usePrefs((s) => s.setActiveTenant);
  const incomplete = me.data?.workspaces.find((w) => w.role === 'owner' && !w.onboarding_completed_at);
  const tenantId = incomplete?.tenant_id ?? null;
  const properties = useProperties(tenantId);
  const [finished, setFinished] = useState(false);
  const step = finished ? 'finish' : !incomplete ? 'business' : incomplete.onboarding_step === 'property' ? 'property' : incomplete.onboarding_step === 'rooms' ? 'rooms' : 'finish';
  const index = { business: 0, property: 1, rooms: 2, finish: 3 }[step];

  const [business, setBusiness] = useState({ businessName: '', ownerName: '', contactPhone: '', contactEmail: '', city: '', state: '' });
  const [property, setProperty] = useState({ name: '', property_type: 'pg' as PropertyType, address_line1: '', city: '' });
  const [rooms, setRooms] = useState({ prefix: '', start: '101', count: '5', beds: '2', rent: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (me.data?.user.full_name) setBusiness((b) => ({ ...b, ownerName: b.ownerName || me.data!.user.full_name! }));
  }, [me.data]);
  useEffect(() => {
    if (tenantId) setActive(tenantId);
  }, [tenantId, setActive]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const createWorkspace = () =>
    run(async () => {
      const parsed = businessSchema.safeParse(business);
      if (!parsed.success) {
        setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
        return;
      }
      setErrors({});
      const userId = state.status === 'signed_in' ? state.session.userId : 'anon';
      const key = `pg-saas-provision:${userId}`;
      let requestId = await AsyncStorage.getItem(key);
      if (!requestId) {
        requestId = newIdempotencyKey();
        await AsyncStorage.setItem(key, requestId);
      }
      const id = await data.provisionWorkspace({ requestId, ...parsed.data, contactPhone: parsed.data.contactPhone || undefined, contactEmail: parsed.data.contactEmail || undefined });
      await AsyncStorage.removeItem(key);
      setActive(id);
    });

  const saveProperty = () =>
    run(async () => {
      if (property.name.trim().length < 2) {
        setErrors({ name: 'Property name must be at least 2 characters' });
        return;
      }
      setErrors({});
      await data.createProperty(tenantId!, { name: property.name.trim(), property_type: property.property_type, address_line1: property.address_line1 || null, city: property.city || null });
      await data.setOnboardingStep(tenantId!, 'rooms');
    });

  const saveRooms = () =>
    run(async () => {
      const start = Number(rooms.start);
      const count = Number(rooms.count);
      const beds = Number(rooms.beds);
      const rent = rupeesToPaise(rooms.rent);
      const errs: Record<string, string> = {};
      if (!Number.isInteger(start) || start < 0) errs.start = 'Enter a room number';
      if (!Number.isInteger(count) || count < 1 || count > 100) errs.count = '1–100 rooms';
      if (!Number.isInteger(beds) || beds < 1 || beds > 30) errs.beds = '1–30 beds';
      if (rent === null || rent <= 0) errs.rent = 'Enter the rent per bed';
      setErrors(errs);
      if (Object.keys(errs).length) return;
      const propertyId = properties.data?.[0]?.id;
      if (!propertyId) throw new Error('Property not found');
      await data.createRooms(
        propertyId,
        Array.from({ length: count }, (_, i) => ({ name: `${rooms.prefix}${start + i}`, rent_mode: 'per_bed' as const, rent_paise: rent!, bed_count: beds })),
      );
      await data.setOnboardingStep(tenantId!, 'done');
      setFinished(true);
    });

  return (
    <Screen
      title={['Your business', 'First property', 'Rooms & beds', 'All set'][index]}
      subtitle={`Step ${index + 1} of 4`}
      right={<Button title="Exit" variant="ghost" compact onPress={() => void signOut().then(() => router.replace('/sign-in'))} />}
    >
      <ProgressBar value={((index + 1) / 4) * 100} />
      {step === 'business' && (
        <Card style={{ gap: 16 }}>
          <Txt>This creates your private workspace. You can add more properties later.</Txt>
          <Field label="Business name" required error={errors.businessName}>
            <Input value={business.businessName} onChangeText={(t) => setBusiness({ ...business, businessName: t })} placeholder="e.g. Sunrise Stays" invalid={!!errors.businessName} />
          </Field>
          <Field label="Your name" required error={errors.ownerName}>
            <Input value={business.ownerName} onChangeText={(t) => setBusiness({ ...business, ownerName: t })} invalid={!!errors.ownerName} />
          </Field>
          <Field label="Phone" error={errors.contactPhone}>
            <Input value={business.contactPhone} onChangeText={(t) => setBusiness({ ...business, contactPhone: t })} keyboardType="phone-pad" />
          </Field>
          <Field label="City">
            <Input value={business.city} onChangeText={(t) => setBusiness({ ...business, city: t })} />
          </Field>
          <InlineError error={error} />
          <Button title="Create workspace" loading={busy} onPress={() => void createWorkspace()} />
        </Card>
      )}
      {step === 'property' && (
        <Card style={{ gap: 16 }}>
          <Field label="Property name" required error={errors.name}>
            <Input value={property.name} onChangeText={(t) => setProperty({ ...property, name: t })} invalid={!!errors.name} />
          </Field>
          <Field label="Type">
            <Picker title="Property type" value={property.property_type} onChange={(v) => setProperty({ ...property, property_type: v })} placeholder="Choose" options={PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABELS[t] }))} />
          </Field>
          <Field label="Address">
            <Input value={property.address_line1} onChangeText={(t) => setProperty({ ...property, address_line1: t })} />
          </Field>
          <Field label="City">
            <Input value={property.city} onChangeText={(t) => setProperty({ ...property, city: t })} />
          </Field>
          <InlineError error={error} />
          <Button title="Save and continue" loading={busy} onPress={() => void saveProperty()} />
        </Card>
      )}
      {step === 'rooms' && (
        <Card style={{ gap: 16 }}>
          <Txt>Add a numbered range of rooms. You can add or edit individual rooms later.</Txt>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Prefix">
                <Input value={rooms.prefix} onChangeText={(t) => setRooms({ ...rooms, prefix: t })} placeholder="Optional" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="First no." error={errors.start}>
                <Input value={rooms.start} onChangeText={(t) => setRooms({ ...rooms, start: t })} keyboardType="number-pad" />
              </Field>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Rooms" error={errors.count}>
                <Input value={rooms.count} onChangeText={(t) => setRooms({ ...rooms, count: t })} keyboardType="number-pad" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Beds each" error={errors.beds}>
                <Input value={rooms.beds} onChangeText={(t) => setRooms({ ...rooms, beds: t })} keyboardType="number-pad" />
              </Field>
            </View>
          </View>
          <Field label="Monthly rent per bed" required error={errors.rent}>
            <MoneyInput value={rooms.rent} onChangeText={(t) => setRooms({ ...rooms, rent: t })} invalid={!!errors.rent} />
          </Field>
          <InlineError error={error} />
          <Button title="Create rooms" loading={busy} onPress={() => void saveRooms()} />
        </Card>
      )}
      {step === 'finish' && (
        <Card style={{ gap: 12, alignItems: 'flex-start' }}>
          <CheckCircle2 size={28} color={colors.success[600]} />
          <Txt variant="heading">Your workspace is ready</Txt>
          <Txt>Add residents, assign beds and start recording rent.</Txt>
          <InlineError error={error} />
          <Button
            title="Go to dashboard"
            loading={busy}
            style={{ alignSelf: 'stretch' }}
            onPress={() =>
              void run(async () => {
                // Also completes a setup that was started on the web and paused later.
                if (tenantId) await data.setOnboardingStep(tenantId, 'done');
                router.replace('/(tabs)');
              })
            }
          />
        </Card>
      )}
    </Screen>
  );
}
