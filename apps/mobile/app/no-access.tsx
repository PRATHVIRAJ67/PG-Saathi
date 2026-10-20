import { View } from 'react-native';
import { router } from 'expo-router';
import { Building2, Home } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useMyContext } from '@pg/api-client/react';
import { useAuth } from '../src/session';
import { Button, Card, Screen, Txt } from '../src/ui';

/** Signed in, but this account is not linked to any PG as a resident. */
export default function NoAccess() {
  const { signOut } = useAuth();
  const me = useMyContext();
  const isOwner = (me.data?.workspaces.length ?? 0) > 0;
  const Icon = isOwner ? Building2 : Home;

  return (
    <Screen>
      <View style={{ paddingTop: 40, alignItems: 'center', gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent[50], alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={26} color={colors.accent[600]} />
        </View>
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {isOwner ? 'This app is for residents' : 'No PG linked yet'}
        </Txt>
        <Txt style={{ textAlign: 'center', maxWidth: 300 }}>
          {isOwner
            ? 'PG owners and staff manage everything from the PG Sathi web dashboard. Residents use this app to see their room, rent and receipts.'
            : `${me.data?.user.email ?? 'This account'} isn’t linked to a PG. Ask your PG owner to give you an app login from their dashboard.`}
        </Txt>
      </View>
      <Card style={{ gap: 10 }}>
        <Button title="Try again" variant="secondary" onPress={() => void me.refetch().then(() => router.replace('/'))} />
        <Button title="Sign out" variant="ghost" onPress={() => void signOut().then(() => router.replace('/sign-in'))} />
      </Card>
    </Screen>
  );
}
