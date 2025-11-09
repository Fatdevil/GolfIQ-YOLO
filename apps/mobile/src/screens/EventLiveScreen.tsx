import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Video, type AVPlaybackStatus } from 'expo-av';

import { useLiveBoard } from '@app/hooks/useLiveBoard';
import { useClips } from '@app/features/clips/useClips';
import type { ShotClip } from '@app/api/events';
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

type ClipListItemProps = {
  clip: ShotClip;
  onPress: (clip: ShotClip) => void;
};

function ClipListItem({ clip, onPress }: ClipListItemProps): JSX.Element {
  return (
    <Pressable style={styles.clipRow} onPress={() => onPress(clip)}>
      <View style={styles.clipThumb}>
        <Text style={styles.clipThumbEmoji}>🎬</Text>
      </View>
      <View style={styles.clipBody}>
        <Text style={styles.clipTitle}>Hole {clip.hole ?? '—'}</Text>
        <Text style={styles.clipMeta}>
          {clip.reactions.total} reactions · {(clip.durationMs ?? 0) / 1000}s
        </Text>
      </View>
      <Text style={styles.clipWeight}>{(clip.weight ?? 0).toFixed(1)}</Text>
    </Pressable>
  );
}

export default function EventLiveScreen({ route }: Props): JSX.Element {
  const eventId = route.params?.id ?? '';
  const { players, loading, error, updatedAt } = useLiveBoard(eventId);
  const sanitized = useMemo(() => sanitizePlayers(players), [players]);
  const { clips, loading: clipsLoading, error: clipsError } = useClips(eventId);
  const [tab, setTab] = useState<'board' | 'clips'>('board');
  const [selectedClip, setSelectedClip] = useState<ShotClip | null>(null);
  const videoRef = useRef<Video | null>(null);

  const openClip = useCallback((clip: ShotClip) => {
    setSelectedClip(clip);
  }, []);

  const closeClip = useCallback(() => {
    setSelectedClip(null);
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded || !videoRef.current) {
      return;
    }
    if (!status.isPlaying) {
      void videoRef.current.playAsync().catch(() => undefined);
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live Leaderboard</Text>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabButton, tab === 'board' && styles.tabActive]}
          onPress={() => setTab('board')}
        >
          <Text style={[styles.tabText, tab === 'board' && styles.tabTextActive]}>Leaderboard</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === 'clips' && styles.tabActive]}
          onPress={() => setTab('clips')}
        >
          <Text style={[styles.tabText, tab === 'clips' && styles.tabTextActive]}>
            Top Shots ({clips.length})
          </Text>
        </Pressable>
      </View>
      {tab === 'board' ? (
        <View>
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
      ) : (
        <View>
          {clipsLoading && <Text style={styles.meta}>Loading clips…</Text>}
          {clipsError && <Text style={styles.error}>{clipsError}</Text>}
          {clips.length === 0 ? (
            <Text style={styles.meta}>No clips yet.</Text>
          ) : (
            <FlatList
              data={clips}
              keyExtractor={(clip) => clip.id}
              renderItem={({ item }) => <ClipListItem clip={item} onPress={openClip} />}
              ItemSeparatorComponent={() => <View style={styles.clipSeparator} />}
            />
          )}
        </View>
      )}
      <Modal visible={selectedClip != null} transparent animationType="slide" onRequestClose={closeClip}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Top Shot</Text>
            {selectedClip ? (
              <Video
                ref={videoRef}
                style={styles.video}
                source={{ uri: selectedClip.hlsUrl || selectedClip.mp4Url || '' }}
                shouldPlay
                useNativeControls
                resizeMode="contain"
                onPlaybackStatusUpdate={onPlaybackStatusUpdate}
              />
            ) : (
              <Text>No clip selected.</Text>
            )}
            <Pressable style={styles.closeButton} onPress={closeClip}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  tabActive: {
    backgroundColor: '#111827',
  },
  tabText: {
    textAlign: 'center',
    color: '#d1d5db',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#facc15',
  },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  clipSeparator: {
    height: 1,
    backgroundColor: '#1f2937',
  },
  clipThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipThumbEmoji: {
    fontSize: 20,
  },
  clipBody: {
    flex: 1,
  },
  clipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f3f4f6',
  },
  clipMeta: {
    fontSize: 12,
    color: '#9ca3af',
  },
  clipWeight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f59e0b',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#111827',
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f3f4f6',
  },
  video: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
    borderRadius: 12,
  },
  closeButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  closeButtonText: {
    color: '#f3f4f6',
    fontWeight: '600',
  },
});
