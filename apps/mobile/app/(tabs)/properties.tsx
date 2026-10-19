import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Building2, ChevronRight, MapPin } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useProperties } from '@pg/api-client/react';
import { PROPERTY_TYPE_LABELS, occupancyRate } from '@pg/shared';
import { useWorkspaceContext } from '../../src/session';
import { Badge, Card, EmptyState, ErrorView, LoadingList, ProgressBar, Screen, Txt } from '../../src/ui';

export default function Properties() {
  const { tenantId } = useWorkspaceContext();
  const q = useProperties(tenantId);
  return (
    <Screen title="Properties" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isError ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <LoadingList />
      ) : q.data.length === 0 ? (
        <EmptyState icon={Building2} title="No properties yet" description="Add properties from the web dashboard or during onboarding." />
      ) : (
        q.data.map((p, i) => {
          const rate = occupancyRate(p.occupied_count, p.bed_count, p.unavailable_count);
          return (
            <Pressable key={p.id} onPress={() => router.push(`/property/${p.id}`)} accessibilityRole="button" accessibilityLabel={p.name}>
              <Card delay={i * 40} style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.navy[900], alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={20} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="heading" numberOfLines={1}>{p.name}</Txt>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} color={colors.gray[400]} />
                      <Txt variant="caption" numberOfLines={1}>{[p.locality, p.city].filter(Boolean).join(', ') || 'No address'}</Txt>
                    </View>
                  </View>
                  <ChevronRight size={20} color={colors.gray[300]} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Badge label={PROPERTY_TYPE_LABELS[p.property_type]} />
                  <Badge label={`${p.room_count} rooms`} />
                  <Badge label={`${p.bed_count} beds`} />
                </View>
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt variant="caption">Occupancy</Txt>
                    <Txt variant="caption" tabular>
                      {rate}% · {Math.max(p.bed_count - p.unavailable_count - p.occupied_count, 0)} vacant
                    </Txt>
                  </View>
                  <ProgressBar value={rate} />
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
