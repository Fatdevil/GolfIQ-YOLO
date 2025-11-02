import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { getItem, removeItem, setItem } from '../../../../shared/core/pstore';
import { decodeSharedRoundV1, type SharedRoundV1 } from '../../../../shared/event/payload';
import {
  computeLeaderboard,
  type EventFormat,
  type EventState,
  type LeaderRow,
  type Participant,
} from '../../../../shared/event/models';
import { tryShareSvg } from '../lib/share';
import { renderEventBoardSVG } from '../components/event/LeaderboardShare';
import { scanCode, subscribeToScanRequests, type ScanSession } from '../modules/qr/scan';

type LeaderboardTab = 'gross' | 'net' | 'stableford' | 'sg';

type FormState = {
  name: string;
  courseId: string;
  start: string;
  end: string;
  format: EventFormat;
};

type EditParticipantState = {
  round: SharedRoundV1;
  name: string;
  hcp: string;
};

const STORAGE_KEY = '@events/dashboard.v1';

const FORMAT_OPTIONS: readonly { key: EventFormat; label: string }[] = [
  { key: 'gross', label: 'Gross' },
  { key: 'net', label: 'Net' },
  { key: 'stableford', label: 'Stableford' },
];

const TAB_OPTIONS: readonly { key: LeaderboardTab; label: string }[] = [
  { key: 'gross', label: 'Gross' },
  { key: 'net', label: 'Net' },
  { key: 'stableford', label: 'Stableford' },
  { key: 'sg', label: 'SG' },
];

function sanitizeNumber(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function sanitizeParticipant(raw: Participant): Participant {
  return {
    id: raw.id,
    name: raw.name,
    hcp: Number.isFinite(raw.hcp ?? NaN) ? Number(raw.hcp) : undefined,
    rounds: raw.rounds ?? {},
  };
}

function sanitizeEvent(raw: unknown): EventState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : null;
  const name = typeof record.name === 'string' ? record.name : null;
  const format = record.format;
  const formatValid = format === 'gross' || format === 'net' || format === 'stableford';
  const holes = record.holes && typeof record.holes === 'object' ? (record.holes as { start?: unknown; end?: unknown }) : null;
  const start = Number.isFinite(Number(holes?.start)) ? Number(holes?.start) : 1;
  const end = Number.isFinite(Number(holes?.end)) ? Number(holes?.end) : start;
  const participantsRaw = record.participants && typeof record.participants === 'object' ? (record.participants as Record<string, Participant>) : {};
  if (!id || !name || !formatValid) {
    return null;
  }
  const participants: Record<string, Participant> = {};
  for (const [key, participant] of Object.entries(participantsRaw)) {
    if (participant && typeof participant === 'object' && typeof participant.id === 'string') {
      participants[key] = sanitizeParticipant(participant);
    }
  }
  return {
    id,
    name,
    courseId: typeof record.courseId === 'string' ? record.courseId : undefined,
    format: format as EventFormat,
    holes: { start, end },
    participants,
    createdAt: Number.isFinite(Number(record.createdAt)) ? Number(record.createdAt) : Date.now(),
  };
}

function formatLeaderboardValue(row: LeaderRow, tab: LeaderboardTab): string {
  switch (tab) {
    case 'gross':
      return Number.isFinite(row.gross ?? NaN) ? String(Math.round(Number(row.gross))) : '--';
    case 'net':
      return Number.isFinite(row.net ?? NaN) ? String(Math.round(Number(row.net))) : '--';
    case 'stableford':
      return Number.isFinite(row.stableford ?? NaN) ? `${Math.round(Number(row.stableford))}` : '--';
    case 'sg':
      return Number.isFinite(row.sg ?? NaN) ? Number(row.sg).toFixed(1) : '--';
    default:
      return '--';
  }
}

function metricForTab(row: LeaderRow, tab: LeaderboardTab): number | null {
  switch (tab) {
    case 'gross':
      return Number.isFinite(row.gross ?? NaN) ? Number(row.gross) : null;
    case 'net':
      return Number.isFinite(row.net ?? NaN) ? Number(row.net) : null;
    case 'stableford':
      return Number.isFinite(row.stableford ?? NaN) ? Number(row.stableford) : null;
    case 'sg':
      return Number.isFinite(row.sg ?? NaN) ? Number(row.sg) : null;
    default:
      return null;
  }
}

function compareByMetric(a: LeaderRow, b: LeaderRow, tab: LeaderboardTab): number {
  const direction = tab === 'stableford' || tab === 'sg' ? -1 : 1;
  const aValue = metricForTab(a, tab);
  const bValue = metricForTab(b, tab);
  const safeA = aValue ?? (direction === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  const safeB = bValue ?? (direction === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  return (safeA - safeB) * direction;
}

function rankRows(rows: LeaderRow[], tab: LeaderboardTab): LeaderRow[] {
  const sorted = [...rows].sort((a, b) => compareByMetric(a, b, tab));
  let lastValue: number | null = null;
  let lastRank = 0;
  let index = 0;
  return sorted.map((row) => {
    index += 1;
    const value = metricForTab(row, tab);
    let rank = index;
    if (lastValue !== null && value !== null && Math.abs(value - lastValue) < 1e-9) {
      rank = lastRank;
    } else {
      lastValue = value;
      lastRank = rank;
    }
    return { ...row, rank };
  });
}

export default function EventDashboardScreen(): JSX.Element {
  const [event, setEvent] = useState<EventState | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: '',
    courseId: '',
    start: '1',
    end: '18',
    format: 'gross',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<LeaderboardTab>('gross');
  const [pasteVisible, setPasteVisible] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditParticipantState | null>(null);
  const [scanSession, setScanSession] = useState<ScanSession | null>(null);
  const [scanned, setScanned] = useState(false);
  const [ScannerComponent, setScannerComponent] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await getItem(STORAGE_KEY);
        if (cancelled) {
          return;
        }
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            const normalized = sanitizeEvent(parsed);
            if (normalized) {
              setEvent(normalized);
            }
          } catch {
            // ignore corrupt storage
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    let cancelled = false;
    import('expo-barcode-scanner')
      .then((mod) => {
        if (!cancelled) {
          setScannerComponent(() => mod.BarCodeScanner);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScannerComponent(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeToScanRequests((session) => {
      setScanned(false);
      setScanSession(session);
    });
  }, []);

  const leaderboards = useMemo(() => {
    if (!event) {
      return null;
    }
    const grossRows = computeLeaderboard({ ...event, format: 'gross' });
    const netRows = computeLeaderboard({ ...event, format: 'net' });
    const stablefordRows = computeLeaderboard({ ...event, format: 'stableford' });
    const sgRanked = rankRows(grossRows.map((row) => ({ ...row })), 'sg');
    return {
      gross: grossRows,
      net: netRows,
      stableford: stablefordRows,
      sg: sgRanked,
    } satisfies Record<LeaderboardTab, LeaderRow[]>;
  }, [event]);

  const currentRows = leaderboards ? leaderboards[tab] : [];
  const leaderMetric = metricForTab(currentRows[0] ?? ({} as LeaderRow), tab);

  const shareLeaderboard = useCallback(async () => {
    if (!event || !currentRows.length) {
      return;
    }
    try {
      const svg = renderEventBoardSVG({ ...event, createdAt: Date.now() }, currentRows, tab);
      const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      const { msg } = await tryShareSvg(dataUri, svg, { dialogTitle: 'Share Event Leaderboard' });
      setStatus(msg);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to share leaderboard.');
    }
  }, [currentRows, event, tab]);

  const persistEvent = useCallback(async (next: EventState | null) => {
    if (!next) {
      await removeItem(STORAGE_KEY);
      return;
    }
    await setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const finalizeRound = useCallback(
    async (round: SharedRoundV1, details?: { name?: string; hcp?: number }) => {
      setEvent((prev) => {
        if (!prev) {
          return prev;
        }
        const participants = { ...prev.participants };
        const existing = participants[round.player.id];
        const name = (details?.name ?? existing?.name ?? round.player.name ?? `Player ${round.player.id.slice(0, 6)}`).trim();
        const hcp = Number.isFinite(details?.hcp ?? NaN)
          ? Number(details?.hcp)
          : Number.isFinite(existing?.hcp ?? NaN)
            ? Number(existing?.hcp)
            : Number.isFinite(round.player.hcp ?? NaN)
              ? Number(round.player.hcp)
              : undefined;
        const storedRound: SharedRoundV1 = {
          ...round,
          player: {
            ...round.player,
            name,
            hcp,
          },
        };
        const nextParticipant: Participant = existing
          ? {
              ...existing,
              name,
              hcp,
              rounds: { ...existing.rounds, [round.roundId]: storedRound },
            }
          : {
              id: storedRound.player.id,
              name,
              hcp,
              rounds: { [round.roundId]: storedRound },
            };
        participants[nextParticipant.id] = nextParticipant;
        const next: EventState = {
          ...prev,
          participants,
          courseId: prev.courseId ?? storedRound.courseId,
        };
        void persistEvent(next);
        return next;
      });
      setStatus('Participant updated');
    },
    [persistEvent],
  );

  const requestParticipantDetails = useCallback(
    (round: SharedRoundV1) => {
      const participant = event?.participants[round.player.id];
      const name = participant?.name ?? round.player.name ?? '';
      const hcpValue = participant?.hcp ?? round.player.hcp;
      setEditState({
        round,
        name,
        hcp: Number.isFinite(hcpValue ?? NaN) ? String(hcpValue) : '',
      });
    },
    [event?.participants],
  );

  const handleRoundPayload = useCallback(
    (round: SharedRoundV1) => {
      if (!event) {
        setStatus('Create an event before importing rounds');
        return;
      }
      const participant = event.participants[round.player.id];
      const hasName = (participant?.name ?? round.player.name)?.trim();
      const hasHcp = Number.isFinite(
        (participant?.hcp ?? round.player.hcp) as number,
      );
      if (!hasName || !hasHcp) {
        requestParticipantDetails(round);
        return;
      }
      void finalizeRound(round, {
        name: participant?.name ?? round.player.name,
        hcp: Number(participant?.hcp ?? round.player.hcp),
      });
    },
    [event, finalizeRound, requestParticipantDetails],
  );

  const processEncodedPayload = useCallback(
    (encoded: string) => {
      try {
        const round = decodeSharedRoundV1(encoded);
        handleRoundPayload(round);
        setPasteValue('');
        setPasteVisible(false);
        setPasteError(null);
      } catch (error) {
        setPasteError(error instanceof Error ? error.message : 'Invalid payload');
      }
    },
    [handleRoundPayload],
  );

  const handleScan = useCallback(async () => {
    try {
      const result = await scanCode();
      if (typeof result === 'string' && result.trim()) {
        processEncodedPayload(result.trim());
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Scan failed.');
    }
  }, [processEncodedPayload]);

  const handlePasteSubmit = useCallback(() => {
    if (!pasteValue.trim()) {
      setPasteError('Enter a payload to import');
      return;
    }
    processEncodedPayload(pasteValue.trim());
  }, [pasteValue, processEncodedPayload]);

  const handleCreateEvent = useCallback(() => {
    setFormError(null);
    const name = form.name.trim();
    if (!name) {
      setFormError('Event name is required');
      return;
    }
    const start = Math.max(1, sanitizeNumber(form.start, 1));
    const end = Math.max(start, sanitizeNumber(form.end, start));
    const courseId = form.courseId.trim();
    const nextEvent: EventState = {
      id: `event-${Date.now()}`,
      name,
      courseId: courseId || undefined,
      format: form.format,
      holes: { start, end },
      participants: {},
      createdAt: Date.now(),
    };
    setEvent(nextEvent);
    void persistEvent(nextEvent);
    setStatus('Event created');
  }, [form, persistEvent]);

  const handleResetEvent = useCallback(() => {
    Alert.alert('Reset event', 'Remove current event and start fresh?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          setEvent(null);
          void persistEvent(null);
          setStatus('Event cleared');
        },
      },
    ]);
  }, [persistEvent]);

  const handleEditSave = useCallback(() => {
    if (!editState) {
      return;
    }
    const name = editState.name.trim();
    const hcpValue = Number.parseFloat(editState.hcp);
    void finalizeRound(editState.round, {
      name,
      hcp: Number.isFinite(hcpValue) ? hcpValue : undefined,
    });
    setEditState(null);
  }, [editState, finalizeRound]);

  const handleEditCancel = useCallback(() => {
    setEditState(null);
  }, []);

  const leaderDelta = useCallback(
    (row: LeaderRow): string => {
      const value = metricForTab(row, tab);
      if (value == null || leaderMetric == null) {
        return '';
      }
      if (tab === 'stableford' || tab === 'sg') {
        const diff = leaderMetric - value;
        if (Math.abs(diff) < 1e-9) {
          return 'E';
        }
        const rounded = Math.round(diff);
        return rounded >= 0 ? `+${rounded}` : String(rounded);
      }
      const diff = value - leaderMetric;
      if (Math.abs(diff) < 1e-9) {
        return 'E';
      }
      const rounded = Math.round(diff);
      return rounded > 0 ? `+${rounded}` : String(rounded);
    },
    [leaderMetric, tab],
  );

  const participantsList = useMemo(() => {
    if (!event) {
      return [] as Participant[];
    }
    return Object.values(event.participants).sort((a, b) => a.name.localeCompare(b.name));
  }, [event]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {loading ? (
        <ActivityIndicator color="#4da3ff" style={styles.loader} />
      ) : event ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{event.name}</Text>
          <Text style={styles.cardSubtitle}>
            {`Format ${event.format.toUpperCase()} • Holes ${event.holes.start}-${event.holes.end}`}
            {event.courseId ? ` • Course ${event.courseId}` : ''}
          </Text>
          <View style={styles.tabRow}>
            {TAB_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.tabButton, tab === option.key && styles.tabButtonActive]}
                onPress={() => setTab(option.key)}
              >
                <Text style={[styles.tabLabel, tab === option.key && styles.tabLabelActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.leaderboard}>
            {currentRows.length === 0 ? (
              <Text style={styles.emptyState}>No rounds imported yet.</Text>
            ) : (
              currentRows.slice(0, 10).map((row) => (
                <View key={`${tab}-${row.participantId}`} style={styles.leaderRow}>
                  <Text style={styles.leaderRank}>{row.rank}</Text>
                  <Text style={styles.leaderName}>{row.name}</Text>
                  <Text style={styles.leaderScore}>{formatLeaderboardValue(row, tab)}</Text>
                  <Text style={styles.leaderDelta}>{leaderDelta(row)}</Text>
                </View>
              ))
            )}
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleScan}>
              <Text style={styles.primaryButtonLabel}>Scan Round QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setPasteVisible(true)}>
              <Text style={styles.secondaryButtonLabel}>Paste JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleResetEvent}>
              <Text style={styles.secondaryButtonLabel}>Reset</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.shareButton} onPress={shareLeaderboard} disabled={!currentRows.length}>
            <Text style={styles.shareButtonLabel}>Share Leaderboard</Text>
          </TouchableOpacity>
          <View style={styles.participantSection}>
            <Text style={styles.sectionHeading}>Participants</Text>
            {participantsList.length === 0 ? (
              <Text style={styles.emptyState}>No participants yet.</Text>
            ) : (
              participantsList.map((participant) => (
                <View key={participant.id} style={styles.participantRow}>
                  <Text style={styles.participantName}>{participant.name}</Text>
                  <Text style={styles.participantMeta}>
                    {Object.keys(participant.rounds).length} round{Object.keys(participant.rounds).length === 1 ? '' : 's'}
                    {Number.isFinite(participant.hcp ?? NaN) ? ` • HCP ${participant.hcp}` : ''}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create Event</Text>
          <TextInput
            value={form.name}
            onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
            placeholder="Event name"
            placeholderTextColor="#6b7a99"
            style={styles.input}
          />
          <TextInput
            value={form.courseId}
            onChangeText={(text) => setForm((prev) => ({ ...prev, courseId: text }))}
            placeholder="Course (optional)"
            placeholderTextColor="#6b7a99"
            style={styles.input}
          />
          <View style={styles.holeRow}>
            <TextInput
              value={form.start}
              onChangeText={(text) => setForm((prev) => ({ ...prev, start: text }))}
              placeholder="Start hole"
              placeholderTextColor="#6b7a99"
              keyboardType="number-pad"
              style={[styles.input, styles.holeInput]}
            />
            <TextInput
              value={form.end}
              onChangeText={(text) => setForm((prev) => ({ ...prev, end: text }))}
              placeholder="End hole"
              placeholderTextColor="#6b7a99"
              keyboardType="number-pad"
              style={[styles.input, styles.holeInput]}
            />
          </View>
          <View style={styles.segmentRow}>
            {FORMAT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.segmentButton, form.format === option.key && styles.segmentButtonActive]}
                onPress={() => setForm((prev) => ({ ...prev, format: option.key }))}
              >
                <Text style={[styles.segmentLabel, form.format === option.key && styles.segmentLabelActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
          <TouchableOpacity style={styles.primaryButton} onPress={handleCreateEvent}>
            <Text style={styles.primaryButtonLabel}>Create Event</Text>
          </TouchableOpacity>
        </View>
      )}

      {status ? <Text style={styles.statusText}>{status}</Text> : null}

      <Modal visible={pasteVisible} transparent animationType="fade" onRequestClose={() => setPasteVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Paste SharedRound JSON</Text>
            <TextInput
              value={pasteValue}
              onChangeText={setPasteValue}
              multiline
              style={styles.modalInput}
              placeholder="Paste encoded payload"
              placeholderTextColor="#6b7a99"
              autoCapitalize="none"
            />
            {pasteError ? <Text style={styles.errorText}>{pasteError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setPasteVisible(false)}>
                <Text style={styles.secondaryButtonLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handlePasteSubmit}>
                <Text style={styles.primaryButtonLabel}>Import</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editState} transparent animationType="fade" onRequestClose={handleEditCancel}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Participant Details</Text>
            <TextInput
              value={editState?.name ?? ''}
              onChangeText={(text) => setEditState((prev) => (prev ? { ...prev, name: text } : prev))}
              placeholder="Player name"
              placeholderTextColor="#6b7a99"
              style={styles.modalInput}
            />
            <TextInput
              value={editState?.hcp ?? ''}
              onChangeText={(text) => setEditState((prev) => (prev ? { ...prev, hcp: text } : prev))}
              placeholder="Handicap (optional)"
              placeholderTextColor="#6b7a99"
              keyboardType="decimal-pad"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleEditCancel}>
                <Text style={styles.secondaryButtonLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleEditSave}>
                <Text style={styles.primaryButtonLabel}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!scanSession && ScannerComponent != null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.scannerCard}>
            <Text style={styles.modalTitle}>Scan Round QR</Text>
            {ScannerComponent ? (
              <ScannerComponent
                style={styles.scannerView}
                onBarCodeScanned={({ data }: { data: string }) => {
                  if (scanned) {
                    return;
                  }
                  setScanned(true);
                  scanSession?.onResult(data);
                  setScanSession(null);
                }}
              />
            ) : (
              <ActivityIndicator color="#4da3ff" />
            )}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                scanSession?.onCancel();
                setScanSession(null);
              }}
            >
              <Text style={styles.secondaryButtonLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#0a0f1d',
    flexGrow: 1,
    gap: 16,
  },
  loader: {
    marginTop: 48,
  },
  card: {
    backgroundColor: '#141c2f',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#8ea0c9',
    fontSize: 16,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1f2a43',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#4da3ff',
  },
  tabLabel: {
    color: '#8ea0c9',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#0b1221',
  },
  leaderboard: {
    borderRadius: 16,
    backgroundColor: '#0f1628',
    padding: 12,
    gap: 12,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  leaderRank: {
    width: 36,
    color: '#8ea0c9',
    fontSize: 18,
  },
  leaderName: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  leaderScore: {
    width: 80,
    color: '#ffffff',
    fontSize: 18,
    textAlign: 'right',
  },
  leaderDelta: {
    width: 56,
    color: '#8ea0c9',
    fontSize: 16,
    textAlign: 'right',
  },
  emptyState: {
    color: '#6b7a99',
    textAlign: 'center',
    paddingVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#4da3ff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonLabel: {
    color: '#0b1221',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#1f2a43',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    color: '#ffffff',
    fontWeight: '600',
  },
  shareButton: {
    marginTop: 12,
    backgroundColor: '#0b1221',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4da3ff',
  },
  shareButtonLabel: {
    color: '#4da3ff',
    fontWeight: '700',
    fontSize: 16,
  },
  participantSection: {
    marginTop: 16,
    gap: 12,
  },
  sectionHeading: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  participantRow: {
    backgroundColor: '#10172a',
    borderRadius: 12,
    padding: 12,
  },
  participantName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  participantMeta: {
    color: '#8ea0c9',
    marginTop: 4,
  },
  statusText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#4da3ff',
  },
  input: {
    backgroundColor: '#0f1628',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
  },
  holeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  holeInput: {
    flex: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  segmentButton: {
    flex: 1,
    backgroundColor: '#1f2a43',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#4da3ff',
  },
  segmentLabel: {
    color: '#8ea0c9',
    fontWeight: '600',
  },
  segmentLabelActive: {
    color: '#0b1221',
  },
  errorText: {
    color: '#ff7b7b',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 29, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#141c2f',
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalInput: {
    backgroundColor: '#0f1628',
    borderRadius: 12,
    padding: 12,
    color: '#ffffff',
    minHeight: 48,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  scannerCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#141c2f',
    borderRadius: 18,
    padding: 20,
    gap: 16,
    alignItems: 'center',
  },
  scannerView: {
    width: 320,
    height: 320,
  },
});

