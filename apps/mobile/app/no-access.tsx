import { useEffect } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Clock, Home, Phone, QrCode, XCircle } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { formatDate } from '@pg/shared';
import { queryKeys, useBackend, useMyContext } from '@pg/api-client/react';
import { useAuth } from '../src/session';
import { Badge, Button, Card, Screen, Txt } from '../src/ui';

/**
 * Signed in, but not linked to any PG as a resident yet. Shows join requests
 * waiting for approval, and moves on by itself once the PG approves.
 */
export default function NoAccess() {
  const { signOut } = useAuth();
  const { data, mode } = useBackend();
  const me = useMyContext();
  const requests = useQuery({
    queryKey: queryKeys.myJoinRequests(),
    queryFn: () => data.myJoinRequests(),
    enabled: mode !== 'demo-snapshot',
    refetchInterval: 30_000,
  });
  const isOwner = (me.data?.workspaces.length ?? 0) > 0;
  const pending = (requests.data ?? []).filter((r) => r.status === 'pending');
  const latest = requests.data?.[0];

  // Approved while waiting: refresh access and go to the app.
  useEffect(() => {
    if (latest?.status === 'approved') void me.refetch();
  }, [latest?.status, me]);
  useEffect(() => {
    if ((me.data?.resident_links.length ?? 0) > 0) router.replace('/');
  }, [me.data]);

  const Icon = pending.length ? Clock : isOwner ? Building2 : Home;
  const title = pending.length ? 'Waiting for approval' : latest?.status === 'rejected' ? 'Request not approved' : isOwner ? 'This app is for residents' : 'No PG linked yet';
  const text = pending.length
    ? `${pending[0]!.business_name} has your request. Once they approve you and give you a bed, your room, rent and bills show up here.`
    : latest?.status === 'rejected'
      ? `${latest.business_name} didn’t approve your request${latest.reject_reason ? `: “${latest.reject_reason}”` : '.'} You can contact them or scan another PG’s QR.`
      : isOwner
        ? 'PG owners and staff manage everything from the PG Sathi web dashboard. Residents use this app to see their room, rent and receipts.'
        : 'Scan your PG’s join QR code to send them a request, or ask your PG owner to give you an app login.';

  return (
    <Screen refreshing={me.isRefetching || requests.isRefetching} onRefresh={() => void Promise.all([me.refetch(), requests.refetch()])}>
      <View style={{ paddingTop: 40, alignItems: 'center', gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: latest?.status === 'rejected' && !pending.length ? colors.danger[50] : colors.accent[50], alignItems: 'center', justifyContent: 'center' }}>
          {latest?.status === 'rejected' && !pending.length ? <XCircle size={26} color={colors.danger[600]} /> : <Icon size={26} color={colors.accent[600]} />}
        </View>
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {title}
        </Txt>
        <Txt style={{ textAlign: 'center', maxWidth: 320 }}>{text}</Txt>
      </View>

      {(requests.data ?? []).slice(0, 3).map((r) => (
        <Card key={r.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt variant="heading">{r.property_name ?? r.business_name}</Txt>
            <Badge label={r.status === 'pending' ? 'Waiting' : r.status === 'approved' ? 'Approved' : 'Not approved'} tone={r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'danger'} />
          </View>
          <Txt variant="caption">Sent {formatDate(r.created_at.slice(0, 10))}</Txt>
          {r.contact_phone && r.status !== 'approved' ? (
            <Button title={`Call ${r.business_name}`} variant="secondary" icon={Phone} compact onPress={() => void Linking.openURL(`tel:${r.contact_phone}`)} />
          ) : null}
        </Card>
      ))}

      <Card style={{ gap: 10 }}>
        {!isOwner && <Button title={pending.length ? 'Join another PG' : 'Scan a PG’s QR code'} icon={QrCode} variant={pending.length ? 'secondary' : 'accent'} onPress={() => router.push('/join')} />}
        <Button title="Check again" variant="secondary" onPress={() => void Promise.all([me.refetch(), requests.refetch()]).then(() => router.replace('/'))} />
        <Button title="Sign out" variant="ghost" onPress={() => void signOut().then(() => router.replace('/sign-in'))} />
      </Card>
    </Screen>
  );
}
