import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Switch,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

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
import {
  createEvent as createLiveEvent,
  ensureUser as ensureCloudUser,
  eventsCloudAvailable,
  joinEvent as joinLiveEvent,
  postSharedRound as postLiveRound,
  watchEvent as watchLiveEvent,
} from '../cloud/eventsSync';

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

type CloudInfo = {
  id: string;
  joinCode?: string | null;
  goLive?: boolean;
};

type DashboardEventState = EventState & { cloud?: CloudInfo };

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

function roundsEqual(a: SharedRoundV1 | undefined, b: SharedRoundV1): boolean {
  if (!a) {
    return false;
  }
  const grossMatch = Number.isFinite(a.gross ?? NaN) ? Number(a.gross) === Number(b.gross) : a.gross === b.gross;
  const netMatch = Number.isFinite(a.net ?? NaN) ? Number(a.net) === Number(b.net) : a.net === b.net;
  const sgMatch = Number.isFinite(a.sg ?? NaN) ? Number(a.sg) === Number(b.sg) : a.sg === b.sg;
  const holesMatch = a.holes?.start === b.holes?.start && a.holes?.end === b.holes?.end;
  const breakdownA = Array.isArray(a.holesBreakdown) ? a.holesBreakdown : [];
  const breakdownB = Array.isArray(b.holesBreakdown) ? b.holesBreakdown : [];
  const breakdownMatch =
    breakdownA.length === breakdownB.length &&
    breakdownA.every((entry, idx) => {
      const other = breakdownB[idx];
      return (
        entry.h === other?.h &&
        entry.strokes === other?.strokes &&
        (entry.net ?? null) === (other?.net ?? null) &&
        (entry.sg ?? null) === (other?.sg ?? null)
      );
    });
  const playerNameMatch = (a.player?.name ?? '').trim() === (b.player?.name ?? '').trim();
  const playerHcpMatch =
    Number.isFinite(a.player?.hcp ?? NaN) && Number.isFinite(b.player?.hcp ?? NaN)
      ? Number(a.player?.hcp) === Number(b.player?.hcp)
      : (a.player?.hcp ?? undefined) === (b.player?.hcp ?? undefined);
  return (
    a.roundId === b.roundId &&
    grossMatch &&
    netMatch &&
    sgMatch &&
    holesMatch &&
    breakdownMatch &&
    playerNameMatch &&
    playerHcpMatch &&
    (a.courseId ?? '') === (b.courseId ?? '')
  );
}

function applyRoundToEvent(
  event: DashboardEventState,
  round: SharedRoundV1,
  details?: { name?: string; hcp?: number },
): DashboardEventState {
  const participants = event.participants ?? {};
  const existing = participants[round.player.id];
  const resolvedName = (details?.name ?? existing?.name ?? round.player.name ?? `Player ${round.player.id.slice(0, 6)}`).trim();
  const resolvedHcp = Number.isFinite(details?.hcp ?? NaN)
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
      name: resolvedName,
      hcp: resolvedHcp,
    },
  };
  const existingRound = existing?.rounds?.[round.roundId];
  const unchanged =
    existing &&
    existing.name === resolvedName &&
    ((existing.hcp ?? undefined) === (resolvedHcp ?? undefined) ||
      (!Number.isFinite(existing.hcp ?? NaN) && !Number.isFinite(resolvedHcp ?? NaN))) &&
    roundsEqual(existingRound, storedRound);
  if (unchanged) {
    return event;
  }
  const nextParticipant: Participant = existing
    ? {
        ...existing,
        name: resolvedName,
        hcp: resolvedHcp,
        rounds: { ...existing.rounds, [round.roundId]: storedRound },
      }
    : {
        id: storedRound.player.id,
        name: resolvedName,
        hcp: resolvedHcp,
        rounds: { [round.roundId]: storedRound },
      };
  const nextParticipants = { ...participants, [nextParticipant.id]: nextParticipant };
  return {
    ...event,
    participants: nextParticipants,
    courseId: event.courseId ?? storedRound.courseId,
  } satisfies DashboardEventState;
}

function sanitizeParticipant(raw: Participant): Participant {
  return {
    id: raw.id,
    name: raw.name,
    hcp: Number.isFinite(raw.hcp ?? NaN) ? Number(raw.hcp) : undefined,
    rounds: raw.rounds ?? {},
  };
}

function sanitizeEvent(raw: unknown): DashboardEventState | null {
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
  const participantsRaw =
    record.participants && typeof record.participants === 'object'
      ? (record.participants as Record<string, Participant>)
      : {};
  if (!id || !name || !formatValid) {
    return null;
  }
  const participants: Record<string, Participant> = {};
  for (const [key, participant] of Object.entries(participantsRaw)) {
    if (participant && typeof participant === 'object' && typeof participant.id === 'string') {
      participants[key] = sanitizeParticipant(participant);
    }
  }
  const cloudRaw = record.cloud && typeof record.cloud === 'object' ? (record.cloud as Record<string, unknown>) : null;
  let cloud: CloudInfo | undefined;
  if (cloudRaw && typeof cloudRaw.id === 'string' && cloudRaw.id.trim()) {
    cloud = {
      id: cloudRaw.id,
      joinCode: typeof cloudRaw.joinCode === 'string' ? cloudRaw.joinCode : undefined,
      goLive: typeof cloudRaw.goLive === 'boolean' ? cloudRaw.goLive : undefined,
    } satisfies CloudInfo;
  }
  return {
    id,
    name,
    courseId: typeof record.courseId === 'string' ? record.courseId : undefined,
    format: format as EventFormat,
    holes: { start, end },
    participants,
    createdAt: Number.isFinite(Number(record.createdAt)) ? Number(record.createdAt) : Date.now(),
    ...(cloud ? { cloud } : {}),
  } satisfies DashboardEventState;
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
  const [event, setEvent] = useState<DashboardEventState | null>(null);
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
  const [cloudUser, setCloudUser] = useState<string | null>(null);
  const [cloudCheckingUser, setCloudCheckingUser] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const cloudSubscription = useRef<{ id: string; unsubscribe: () => void } | null>(null);

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
    if (!eventsCloudAvailable) {
      return;
    }
    let cancelled = false;
    setCloudCheckingUser(true);
    ensureCloudUser()
      .then((id) => {
        if (!cancelled) {
          setCloudUser(id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCloudUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCloudCheckingUser(false);
        }
      });
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

  useEffect(() => {
    if (!eventsCloudAvailable) {
      return;
    }
    const eventId = event?.cloud?.id;
    const goLive = event?.cloud?.goLive;
    const current = cloudSubscription.current;
    if (!goLive || !eventId) {
      if (current) {
        current.unsubscribe();
        cloudSubscription.current = null;
      }
      setCloudBusy(false);
      return;
    }
    if (current && current.id === eventId) {
      return;
    }
    if (current) {
      current.unsubscribe();
      cloudSubscription.current = null;
    }
    let cancelled = false;
    setCloudBusy(true);
    setCloudError(null);
    watchLiveEvent(eventId, (rounds) => {
      if (cancelled || rounds.length === 0) {
        return;
      }
      setEvent((prev) => {
        if (!prev) {
          return prev;
        }
        let next = prev;
        let changed = false;
        for (const remoteRound of rounds) {
          const updated = applyRoundToEvent(next, remoteRound, {
            name: remoteRound.player.name ?? undefined,
            hcp: Number.isFinite(remoteRound.player.hcp ?? NaN)
              ? Number(remoteRound.player.hcp)
              : undefined,
          });
          if (updated !== next) {
            next = updated;
            changed = true;
          }
        }
        if (changed) {
          void persistEvent(next);
          return next;
        }
        return prev;
      });
    })
      .then((unsubscribe) => {
        if (cancelled) {
          unsubscribe();
          setCloudBusy(false);
          return;
        }
        cloudSubscription.current = { id: eventId, unsubscribe };
        setCloudBusy(false);
      })
      .catch((error) => {
        if (!cancelled) {
          setCloudError(error instanceof Error ? error.message : 'Unable to subscribe to live updates');
          setCloudBusy(false);
        }
      });
    return () => {
      cancelled = true;
      setCloudBusy(false);
    };
  }, [event?.cloud?.id, event?.cloud?.goLive, persistEvent]);

  useEffect(() => {
    return () => {
      if (cloudSubscription.current) {
        cloudSubscription.current.unsubscribe();
        cloudSubscription.current = null;
      }
      setCloudBusy(false);
    };
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

  const persistEvent = useCallback(async (next: DashboardEventState | null) => {
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
        const next = applyRoundToEvent(prev, round, details);
        if (next === prev) {
          return prev;
        }
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
      const resolvedName = (participant?.name ?? round.player.name ?? '').trim();
      const resolvedHcp = Number.isFinite(participant?.hcp ?? round.player.hcp ?? NaN)
        ? Number(participant?.hcp ?? round.player.hcp)
        : undefined;
      void finalizeRound(round, {
        name: resolvedName,
        hcp: resolvedHcp,
      });
      if (eventsCloudAvailable && event.cloud?.id && event.cloud.goLive) {
        const payload: SharedRoundV1 = {
          ...round,
          player: {
            ...round.player,
            name: resolvedName,
            hcp: resolvedHcp,
          },
        };
        void postLiveRound(event.cloud.id, payload).catch(() => {
          setCloudError('Unable to sync round to cloud');
        });
      }
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

  const handleCreateLiveEvent = useCallback(async () => {
    if (!event) {
      setCloudError('Create an event before going live');
      return;
    }
    if (!eventsCloudAvailable) {
      setCloudError('Cloud sync not configured');
      return;
    }
    setCloudBusy(true);
    setCloudError(null);
    try {
      const ensured = cloudUser ?? (await ensureCloudUser());
      if (!ensured) {
        setCloudError('Offline right now. Try again when connected.');
        return;
      }
      const result = await createLiveEvent(event.name, event.holes, event.format);
      setEvent((prev) => {
        if (!prev) {
          return prev;
        }
        const cloud: CloudInfo = { id: result.id, joinCode: result.joinCode, goLive: true };
        const next: DashboardEventState = { ...prev, cloud };
        void persistEvent(next);
        return next;
      });
      setStatus('Live event created');
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'Unable to create live event');
    } finally {
      setCloudBusy(false);
    }
  }, [cloudUser, event, persistEvent]);

  const handleJoinLiveEvent = useCallback(async () => {
    const code = joinCodeInput.trim();
    if (!code) {
      setCloudError('Enter a join code');
      return;
    }
    if (!eventsCloudAvailable) {
      setCloudError('Cloud sync not configured');
      return;
    }
    setCloudBusy(true);
    setCloudError(null);
    try {
      const ensured = cloudUser ?? (await ensureCloudUser());
      if (!ensured) {
        setCloudError('Offline right now. Try again when connected.');
        return;
      }
      const result = await joinLiveEvent(code);
      if (!result) {
        setCloudError('Join code not found');
        return;
      }
      setEvent((prev) => {
        const fallbackHoles = result.holes ?? prev?.holes ?? { start: 1, end: 18 };
        const resolvedFormat: EventFormat =
          result.format && (result.format === 'gross' || result.format === 'net' || result.format === 'stableford')
            ? result.format
            : prev?.format ?? 'gross';
        const base: DashboardEventState = prev
          ? {
              ...prev,
              name: prev.name || result.name || prev.name,
              format: resolvedFormat,
              holes: prev.holes ?? fallbackHoles,
              courseId: prev.courseId ?? (result.courseId ?? undefined),
            }
          : {
              id: `event-${Date.now()}`,
              name: result.name ?? 'Live Event',
              format: resolvedFormat,
              holes: fallbackHoles,
              participants: {},
              createdAt: Date.now(),
              courseId: result.courseId ?? undefined,
            };
        const cloud: CloudInfo = { id: result.id, joinCode: result.joinCode, goLive: true };
        const next: DashboardEventState = { ...base, cloud };
        void persistEvent(next);
        return next;
      });
      setJoinCodeInput('');
      setStatus('Joined live event');
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'Unable to join live event');
    } finally {
      setCloudBusy(false);
    }
  }, [cloudUser, joinCodeInput, persistEvent]);

  const toggleGoLive = useCallback(
    (value: boolean) => {
      setEvent((prev) => {
        if (!prev?.cloud || prev.cloud.goLive === value) {
          return prev;
        }
        const next: DashboardEventState = { ...prev, cloud: { ...prev.cloud, goLive: value } };
        void persistEvent(next);
        return next;
      });
    },
    [persistEvent],
  );

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
    const nextEvent: DashboardEventState = {
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
          {eventsCloudAvailable ? (
            <View style={styles.cloudSection}>
              <View style={styles.cloudHeaderRow}>
                <Text style={styles.sectionHeading}>Cloud Sync</Text>
                {cloudBusy ? <ActivityIndicator color="#4da3ff" /> : null}
              </View>
              {cloudError ? <Text style={styles.errorText}>{cloudError}</Text> : null}
              {event.cloud?.id ? (
                <>
                  <View style={styles.cloudRow}>
                    <View style={styles.cloudInfo}>
                      <Text style={styles.cloudLabel}>Join Code</Text>
                      <Text style={styles.cloudCode}>{event.cloud.joinCode ?? '—'}</Text>
                      <Text style={styles.cloudHelp}>Share with players to join</Text>
                    </View>
                    {event.cloud.joinCode ? (
                      <View style={styles.cloudQrBox}>
                        <QRCode
                          value={event.cloud.joinCode}
                          size={96}
                          backgroundColor="transparent"
                          color="#ffffff"
                        />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.cloudToggleRow}>
                    <Text style={styles.cloudLabel}>Go Live</Text>
                    <Switch
                      value={Boolean(event.cloud.goLive)}
                      onValueChange={toggleGoLive}
                      thumbColor={event.cloud.goLive ? '#0b1221' : '#8ea0c9'}
                      trackColor={{ false: '#1f2a43', true: '#4da3ff' }}
                    />
                  </View>
                  {!cloudUser && !cloudCheckingUser ? (
                    <Text style={styles.cloudHelp}>Offline mode: rounds sync when you reconnect.</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.cloudPrimaryButton, (cloudBusy || cloudCheckingUser) && styles.buttonDisabled]}
                    disabled={cloudBusy || cloudCheckingUser}
                    onPress={handleCreateLiveEvent}
                  >
                    <Text style={styles.cloudPrimaryLabel}>Create Live Event</Text>
                  </TouchableOpacity>
                  <View style={styles.joinRow}>
                    <TextInput
                      style={[styles.input, styles.joinInput]}
                      placeholder="Enter join code"
                      placeholderTextColor="#506189"
                      value={joinCodeInput}
                      onChangeText={setJoinCodeInput}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={[styles.joinButton, (!joinCodeInput.trim() || cloudBusy) && styles.buttonDisabled]}
                      disabled={!joinCodeInput.trim() || cloudBusy}
                      onPress={handleJoinLiveEvent}
                    >
                      <Text style={styles.secondaryButtonLabel}>Join</Text>
                    </TouchableOpacity>
                  </View>
                  {cloudCheckingUser ? <Text style={styles.cloudHelp}>Connecting…</Text> : null}
                </>
              )}
            </View>
          ) : null}
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
  buttonDisabled: {
    opacity: 0.6,
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
  cloudSection: {
    marginTop: 16,
    backgroundColor: '#10172a',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cloudHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cloudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cloudInfo: {
    flex: 1,
    gap: 4,
  },
  cloudLabel: {
    color: '#8ea0c9',
    fontSize: 14,
    fontWeight: '600',
  },
  cloudCode: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
  },
  cloudHelp: {
    color: '#6b7a99',
    fontSize: 12,
  },
  cloudQrBox: {
    backgroundColor: '#0b1221',
    padding: 12,
    borderRadius: 12,
  },
  cloudToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cloudPrimaryButton: {
    backgroundColor: '#4da3ff',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cloudPrimaryLabel: {
    color: '#0b1221',
    fontWeight: '700',
    fontSize: 16,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  joinInput: {
    flex: 1,
  },
  joinButton: {
    backgroundColor: '#1f2a43',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
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

