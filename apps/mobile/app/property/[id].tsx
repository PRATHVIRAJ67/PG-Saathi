import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { useProperty, useRooms } from '@pg/api-client/react';
import { formatINR, occupancyRate, type Bed } from '@pg/shared';
import { useWorkspaceContext } from '../../src/session';
import { Badge, Card, ErrorView, IconButton, LoadingList, ProgressBar, Screen, SectionHeader, Stat, Txt } from '../../src/ui';

function BedTile({ bed, roomName }: { bed: Bed; roomName: string }) {
  const { can } = useWorkspaceContext();
  const style = {
    vacant: { bg: colors.success[50], border: colors.success[100], fg: colors.success[700] },
    occupied: { bg: colors.accent[50], border: colors.accent[200], fg: colors.accent[700] },
    unavailable: { bg: colors.warning[50], border: colors.warning[100], fg: colors.warning[700] },
  }[bed.status];
  const onPress = bed.occupant
    ? () => router.push(`/resident/${bed.occupant!.resident_id}`)
    : bed.status === 'vacant' && can('residents.write')
      ? () => router.push({ pathname: '/assign-bed', params: { bedId: bed.id } })
      : undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Room ${roomName} bed ${bed.label}, ${bed.status}${bed.occupant ? `, ${bed.occupant.full_name}` : ''}`}
      style={({ pressed }) => ({ width: '48%', flexGrow: 1, minHeight: 64, borderRadius: 12, borderWidth: 1, borderColor: style.border, backgroundColor: style.bg, padding: 10, gap: 2, opacity: pressed ? 0.8 : 1 })}
    >
      <Txt variant="label" color={style.fg}>
        Bed {bed.label}
      </Txt>
      <Txt variant="caption" numberOfLines={1}>
        {bed.occupant?.full_name ?? (bed.status === 'vacant' ? 'Vacant · tap to assign' : (bed.unavailable_reason ?? 'Unavailable'))}
      </Txt>
    </Pressable>
  );
}

export default function PropertyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tenantId } = useWorkspaceContext();
  const property = useProperty(tenantId, id);
  const rooms = useRooms(tenantId, id);
  const p = property.data;

  return (
    <Screen refreshing={rooms.isRefetching} onRefresh={() => void Promise.all([property.refetch(), rooms.refetch()])}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <Txt variant="title" numberOfLines={1} style={{ flex: 1 }}>
          {p?.name ?? 'Property'}
        </Txt>
      </View>
      {property.isError ? (
        <ErrorView error={property.error} onRetry={() => void property.refetch()} />
      ) : !p ? (
        <LoadingList />
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Stat label="Occupancy" value={`${occupancyRate(p.occupied_count, p.bed_count, p.unavailable_count)}%`} hint={`${p.occupied_count} of ${p.bed_count - p.unavailable_count} beds`} />
              <Stat label="Rooms" value={String(p.room_count)} hint={`${p.bed_count} beds`} />
            </View>
            <ProgressBar value={occupancyRate(p.occupied_count, p.bed_count, p.unavailable_count)} />
            {p.facilities.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {p.facilities.map((f) => (
                  <Badge key={f} label={f} />
                ))}
              </View>
            )}
          </Card>
          <SectionHeader title="Rooms & beds" />
          {rooms.isPending ? (
            <LoadingList />
          ) : (
            rooms.data?.map((r, i) => (
              <Card key={r.id} delay={i * 30} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="heading">Room {r.name}</Txt>
                    <Txt variant="caption">{[r.floor, r.category].filter(Boolean).join(' · ') || '—'}</Txt>
                  </View>
                  <Txt variant="caption" tabular>
                    {formatINR(r.rent_paise)}/{r.rent_mode === 'per_bed' ? 'bed' : 'room'}
                  </Txt>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {r.beds.map((b) => (
                    <BedTile key={b.id} bed={b} roomName={r.name} />
                  ))}
                </View>
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
