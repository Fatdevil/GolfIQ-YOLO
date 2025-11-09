import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLiveBoard } from '@app/hooks/useLiveBoard';
import type { RootStackParamList } from '@app/navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SpectatorBoardPlayer } from '@shared/events/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EventLive'>;

type SpectatorDisplayRow = {
  name: string;
  gross: number;
  net: number | null;
  thru: number;
  hole: number;
  status: string | null;
};

const ALLOWED_FIELDS: Array<keyof SpectatorDisplayRow> = ['name', 'gross', 'net', 'thru', 'hole', 'status'];

function coerceNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function coerceNullableNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function coerceNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return null;
}

export function sanitizePlayers(players: SpectatorBoardPlayer[] | null | undefined): SpectatorDisplayRow[] {
  if (!Array.isArray(players)) {
    return [];
  }
  return players.map((player, index) => ({
    name: typeof player.name === 'string' ? player.name : `Player ${index + 1}`,
    gross: coerceNumber(player.gross),
    net: coerceNullableNumber(player.net),
    thru: coerceNumber(player.thru),
    hole: coerceNumber(player.hole),
    status: coerceNullableString(player.status),
  }));
}

export default function EventLiveScreen({ route }: Props): JSX.Element {
  const eventId = route.params?.id ?? '';
  const { players, loading, error, updatedAt } = useLiveBoard(eventId);
  const sanitized = useMemo(() => sanitizePlayers(players), [players]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live Leaderboard</Text>
      {updatedAt && (
        <Text style={styles.meta} testID="live-updated">
          Updated at {updatedAt}
        </Text>
      )}
      {loading && <Text>Loading leaderboard…</Text>}
      {error && (
        <Text style={styles.error} testID="live-error">
          {error}
        </Text>
      )}
      <View style={styles.headerRow}>
        {ALLOWED_FIELDS.map((field) => (
          <Text key={field} style={styles.headerCell}>
            {field.toUpperCase()}
          </Text>
        ))}
      </View>
      {sanitized.map((player) => (
        <View style={styles.row} key={`${player.name}-${player.hole}`}>
          <Text style={[styles.cell, styles.name]}>{player.name}</Text>
          <Text style={styles.cell}>{player.gross}</Text>
          <Text style={styles.cell}>{player.net ?? '—'}</Text>
          <Text style={styles.cell}>{player.thru}</Text>
          <Text style={styles.cell}>{player.hole}</Text>
          <Text style={styles.cell}>{player.status ?? 'Active'}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
    color: '#4b5563',
  },
  error: {
    color: '#b91c1c',
  },
  headerRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  headerCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#1f2937',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  cell: {
    flex: 1,
  },
  name: {
    fontWeight: '600',
  },
});
