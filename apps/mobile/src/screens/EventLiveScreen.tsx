import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Audio } from 'expo-av';

import { requestClipCommentary } from '@app/api/events';
import { useLiveBoard } from '@app/hooks/useLiveBoard';
import type { ClipCommentaryParams, RootStackParamList } from '@app/navigation/types';
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

type ClipCommentaryState = {
  id: string;
  title: string;
  summary: string;
  ttsUrl: string | null;
  videoUrl?: string | null;
};

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

function normalizeClipCommentary(clip: ClipCommentaryParams | null | undefined): ClipCommentaryState | null {
  if (!clip || !clip.id) {
    return null;
  }
  return {
    id: clip.id,
    title: typeof clip.ai_title === 'string' ? clip.ai_title : '',
    summary: typeof clip.ai_summary === 'string' ? clip.ai_summary : '',
    ttsUrl: clip.ai_tts_url ?? null,
    videoUrl: clip.video_url ?? null,
  };
}

export default function EventLiveScreen({ route }: Props): JSX.Element {
  const eventId = route.params?.id ?? '';
  const role = route.params?.role ?? 'spectator';
  const tournamentSafe = route.params?.tournamentSafe ?? false;
  const coachMode = route.params?.coachMode ?? false;
  const [clipCommentary, setClipCommentary] = useState<ClipCommentaryState | null>(() =>
    normalizeClipCommentary(route.params?.clip ?? null),
  );
  const [commentaryError, setCommentaryError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const { players, loading, error: boardError, updatedAt } = useLiveBoard(eventId);
  const sanitized = useMemo(() => sanitizePlayers(players), [players]);
  const showSpectatorSummary = !(tournamentSafe && coachMode);

  useEffect(() => {
    setClipCommentary(normalizeClipCommentary(route.params?.clip ?? null));
  }, [route.params?.clip]);

  useEffect(() => {
    if (!clipCommentary) {
      return () => undefined;
    }
    setCommentaryError(null);
    setVoicePlaying(false);
    if (soundRef.current) {
      soundRef.current.unloadAsync().catch(() => undefined);
      soundRef.current = null;
    }
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => undefined);
        soundRef.current = null;
      }
    };
  }, [clipCommentary?.ttsUrl]);

  const handleRequestCommentary = async () => {
    const targetId = clipCommentary?.id ?? route.params?.clip?.id;
    if (!targetId) {
      setCommentaryError('Missing clip identifier');
      return;
    }
    setRequesting(true);
    setCommentaryError(null);
    try {
      const result = await requestClipCommentary(targetId);
      setClipCommentary((prev) => ({
        id: targetId,
        title: result.title,
        summary: result.summary,
        ttsUrl: result.ttsUrl ?? null,
        videoUrl: prev?.videoUrl ?? route.params?.clip?.video_url ?? null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request commentary';
      setCommentaryError(message);
    } finally {
      setRequesting(false);
    }
  };

  const handleToggleVoice = async () => {
    if (!clipCommentary?.ttsUrl) {
      return;
    }
    try {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync({ uri: clipCommentary.ttsUrl });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) {
            return;
          }
          if (!status.isPlaying) {
            setVoicePlaying(false);
          }
        });
      }
      if (voicePlaying) {
        await soundRef.current?.pauseAsync();
        setVoicePlaying(false);
      } else {
        await soundRef.current?.playAsync();
        setVoicePlaying(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to play voice-over';
      setCommentaryError(message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live Leaderboard</Text>
      {updatedAt && (
        <Text style={styles.meta} testID="live-updated">
          Updated at {updatedAt}
        </Text>
      )}
      {loading && (
        <Text>
          Loading leaderboard…
        </Text>
      )}
      {boardError && (
        <Text style={styles.error} testID="live-error">
          {boardError}
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

      {clipCommentary && showSpectatorSummary && (
        <View style={styles.commentaryCard}>
          {clipCommentary.title ? <Text style={styles.commentaryTitle}>{clipCommentary.title}</Text> : null}
          {clipCommentary.summary ? (
            <Text style={styles.commentarySummary}>{clipCommentary.summary}</Text>
          ) : (
            <Text style={styles.commentaryPlaceholder}>No commentary generated yet.</Text>
          )}
          {clipCommentary.ttsUrl ? (
            <TouchableOpacity style={styles.voiceButton} onPress={handleToggleVoice}>
              <Text style={styles.voiceButtonText}>{voicePlaying ? 'Pause voice-over' : 'Play voice-over'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {role === 'admin' && clipCommentary ? (
        <TouchableOpacity
          style={[styles.requestButton, requesting && styles.requestButtonDisabled]}
          onPress={handleRequestCommentary}
          disabled={requesting}
        >
          <View style={styles.requestButtonContent}>
            {requesting ? (
              <>
                <ActivityIndicator size="small" color="#0f172a" style={styles.requestSpinner} />
                <Text style={styles.requestButtonText}>Requesting…</Text>
              </>
            ) : (
              <Text style={styles.requestButtonText}>Request commentary</Text>
            )}
          </View>
        </TouchableOpacity>
      ) : null}

      {commentaryError && <Text style={styles.error}>{commentaryError}</Text>}
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
  commentaryCard: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    gap: 8,
  },
  commentaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  commentarySummary: {
    fontSize: 14,
    color: '#cbd5f5',
    lineHeight: 20,
  },
  commentaryPlaceholder: {
    fontSize: 14,
    color: '#64748b',
  },
  voiceButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderRadius: 8,
  },
  voiceButtonText: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  requestButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#14b8a6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  requestButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestButtonDisabled: {
    opacity: 0.6,
  },
  requestButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  requestSpinner: {
    marginRight: 4,
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
