import { useDeferredValue, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { Plus, Users } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useResidents } from '@pg/api-client/react';
import type { ResidentListParams } from '@pg/api-client';
import { RESIDENT_STATUS_LABELS, formatINR } from '@pg/shared';
import { useWorkspaceContext } from '../../src/session';
import { Avatar, Badge, Card, EmptyState, ErrorView, IconButton, LoadingList, Row, Screen, SearchBar, Segmented, Txt } from '../../src/ui';

export default function Residents() {
  const { tenantId, propertyId, can } = useWorkspaceContext();
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const [status, setStatus] = useState<NonNullable<ResidentListParams['status']>>('current');
  const q = useResidents(tenantId, { search: deferred.trim() || undefined, status, property_id: propertyId, limit: 200 });

  return (
    <Screen
      scroll={false}
      title="Residents"
      subtitle={q.data ? `${q.data.total} ${status === 'current' ? 'current' : RESIDENT_STATUS_LABELS[status as keyof typeof RESIDENT_STATUS_LABELS]?.toLowerCase() ?? ''}` : undefined}
      right={can('residents.write') ? <IconButton icon={Plus} label="Add resident" onPress={() => router.push('/resident/new')} /> : undefined}
    >
      <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 12 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or phone" />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'current', label: 'Current' },
            { value: 'active', label: 'Staying' },
            { value: 'unassigned', label: 'No bed' },
            { value: 'moved_out', label: 'Moved out' },
          ]}
        />
      </View>
      {q.isError ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <View style={{ paddingHorizontal: 16 }}>
          <LoadingList rows={6} />
        </View>
      ) : (
        <FlatList
          data={q.data.rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} colors={[colors.accent[600]]} />}
          ListEmptyComponent={<EmptyState icon={Users} title={search ? 'No matches' : 'No residents here'} description={search ? 'Try another name or number.' : undefined} />}
          renderItem={({ item: r, index }) => (
            <Card padded={false} delay={Math.min(index, 8) * 25} style={{ marginBottom: 8 }}>
              <Row
                title={r.full_name}
                subtitle={r.stay ? `${r.stay.property_name} · ${r.stay.room_name}/${r.stay.bed_label}` : (r.phone ?? RESIDENT_STATUS_LABELS[r.status])}
                left={<Avatar name={r.full_name} />}
                right={
                  r.outstanding_paise ? (
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Txt variant="label" tabular color={r.overdue_paise ? colors.danger[600] : undefined}>
                        {formatINR(r.outstanding_paise)}
                      </Txt>
                      <Txt variant="caption">due</Txt>
                    </View>
                  ) : r.status !== 'active' ? (
                    <Badge label={RESIDENT_STATUS_LABELS[r.status]} tone={r.status === 'unassigned' ? 'warning' : 'neutral'} />
                  ) : undefined
                }
                onPress={() => router.push(`/resident/${r.id}`)}
              />
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
