import { View } from 'react-native';
import { router } from 'expo-router';
import { Building, CalendarCheck, ChevronRight, LogOut, Monitor, Receipt, Repeat } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useBackend, useWorkspace } from '@pg/api-client/react';
import { ROLE_LABELS, formatINR } from '@pg/shared';
import { useAuth, useWorkspaceContext } from '../../src/session';
import { Avatar, Badge, Card, Divider, Picker, Row, Screen, SectionHeader, Txt } from '../../src/ui';

export default function More() {
  const { me, workspace, tenantId, role, can, switchTenant } = useWorkspaceContext();
  const ws = useWorkspace(tenantId);
  const { signOut } = useAuth();
  const { mode } = useBackend();
  const name = me.data?.user.full_name ?? me.data?.user.email ?? 'Account';
  const chevron = <ChevronRight size={18} color={colors.gray[300]} />;

  return (
    <Screen title="More">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} size={44} />
        <View style={{ flex: 1 }}>
          <Txt variant="heading">{name}</Txt>
          <Txt variant="caption">{me.data?.user.email}</Txt>
        </View>
        {role && <Badge label={ROLE_LABELS[role]} tone="accent" />}
      </Card>

      {(me.data?.workspaces.length ?? 0) > 1 && (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Workspace" />
          <Picker title="Switch workspace" value={tenantId ?? ''} onChange={switchTenant} placeholder="Choose" options={(me.data?.workspaces ?? []).map((w) => ({ value: w.tenant_id, label: w.name, description: ROLE_LABELS[w.role] }))} />
        </View>
      )}

      <View>
        <SectionHeader title="Manage" />
        <Card padded={false}>
          {can('finance.read') && (
            <>
              <Row title="Rent bills" subtitle="Generate monthly rent and view bills" left={<CalendarCheck size={20} color={colors.accent[600]} />} right={chevron} onPress={() => router.push('/rent')} />
              <Divider />
              <Row title="Expenses" subtitle="Track running costs" left={<Receipt size={20} color={colors.accent[600]} />} right={chevron} onPress={() => router.push('/expenses')} />
              <Divider />
            </>
          )}
          <Row title="Settings, team & reports" subtitle="Available on the web dashboard" left={<Monitor size={20} color={colors.gray[500]} />} />
        </Card>
      </View>

      {ws.data && (
        <View>
          <SectionHeader title="Plan" />
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Building size={18} color={colors.gray[500]} />
              <Txt variant="heading">{ws.data.plan?.name ?? '—'}</Txt>
              {ws.data.plan && <Txt variant="caption">{ws.data.plan.price_paise ? `${formatINR(ws.data.plan.price_paise)}/${ws.data.plan.billing_interval}` : 'Free'}</Txt>}
            </View>
            <Txt variant="caption">
              {ws.data.usage.properties} properties · {ws.data.usage.residents} residents · {ws.data.usage.staff} team members
            </Txt>
            <Txt variant="caption">{workspace?.name}</Txt>
          </Card>
        </View>
      )}

      <Card padded={false}>
        <Row
          title={mode === 'supabase' ? 'Sign out' : 'Leave demo'}
          left={mode === 'supabase' ? <LogOut size={20} color={colors.danger[600]} /> : <Repeat size={20} color={colors.danger[600]} />}
          onPress={() => void signOut().then(() => router.replace('/sign-in'))}
        />
      </Card>
    </Screen>
  );
}
