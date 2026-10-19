import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { colors, semantic } from '@pg/design-tokens';
import { useMyContext } from '@pg/api-client/react';
import { useAuth, usePrefs } from '../src/session';
import { ErrorView } from '../src/ui';

/** Routes a user to sign-in, onboarding or the app based on verified memberships. */
export default function Index() {
  const { state } = useAuth();
  const me = useMyContext({ enabled: state.status === 'signed_in' });
  const preferred = usePrefs((s) => s.activeTenantId);

  if (state.status === 'loading' || (state.status === 'signed_in' && me.isPending)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.background }}>
        <ActivityIndicator color={colors.accent[600]} />
      </View>
    );
  }
  if (state.status === 'signed_out') return <Redirect href="/sign-in" />;
  if (me.isError) return <ErrorView error={me.error} onRetry={() => void me.refetch()} />;
  const ws = me.data!.workspaces.find((w) => w.tenant_id === preferred) ?? me.data!.workspaces[0];
  if (!ws || (!ws.onboarding_completed_at && ws.role === 'owner')) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
