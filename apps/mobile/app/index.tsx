import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { colors, semantic } from '@pg/design-tokens';
import { useMyContext } from '@pg/api-client/react';
import { useAuth } from '../src/session';
import { ErrorView } from '../src/ui';

/** Signed out → sign in. Signed in but not linked to a PG → explain. Otherwise → the app. */
export default function Index() {
  const { state } = useAuth();
  const me = useMyContext({ enabled: state.status === 'signed_in' });

  if (state.status === 'loading' || (state.status === 'signed_in' && me.isPending)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.background }}>
        <ActivityIndicator color={colors.accent[600]} />
      </View>
    );
  }
  if (state.status === 'signed_out') return <Redirect href="/sign-in" />;
  if (me.isError) return <ErrorView error={me.error} onRetry={() => void me.refetch()} />;
  if ((me.data?.resident_links.length ?? 0) === 0) return <Redirect href="/no-access" />;
  return <Redirect href="/(tabs)" />;
}
