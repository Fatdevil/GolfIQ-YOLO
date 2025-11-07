import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { aggregateLeaderboard } from '../../../../shared/events/scoring';
import { computeAggregateForFormat, type HoleInput } from '../../../../shared/events/net';
import {
  attachRound,
  createEvent,
  fetchEvent,
  joinEventByCode,
  listParticipants,
  pollScores,
  updateEventSettings,
} from '../../../../shared/events/service';
import { getEventContext, setEventContext } from '../../../../shared/events/state';
import type {
  Event,
  EventSettings,
  LeaderboardRow,
  Participant,
  ScoreRow,
  ScoringFormat,
} from '../../../../shared/events/types';
import {
  recordEventAttachedRound,
  recordEventCreated,
  recordEventJoined,
} from '../../../../shared/events/telemetry';
import { ensureClient } from '../../../../shared/supabase/client';
import { getActiveRound, subscribe as subscribeToRound } from '../../../../shared/round/round_store';
import type { Round } from '../../../../shared/round/round_types';

const STATUS_CLEAR_DELAY = 4000;

type Nullable<T> = T | null;

type PollStop = () => void;

type NameMap = Record<string, string>;

type LeaderboardState = {
  rows: LeaderboardRow[];
  updatedAt: number;
};

const INITIAL_LEADERBOARD: LeaderboardState = { rows: [], updatedAt: 0 };

const DEFAULT_ALLOWANCE: Record<ScoringFormat, number> = {
  stroke: 95,
  stableford: 95,
};

function normalizeSettings(settings?: EventSettings | null): EventSettings {
  if (!settings) {
    return { scoringFormat: 'stroke', allowancePct: DEFAULT_ALLOWANCE.stroke };
  }
  const format = settings.scoringFormat ?? 'stroke';
  const allowance = Number.isFinite(settings.allowancePct ?? NaN)
    ? Math.max(0, Number(settings.allowancePct))
    : DEFAULT_ALLOWANCE[format];
  return { scoringFormat: format, allowancePct: allowance };
}

const EventPanel: React.FC = () => {
  const [event, setEvent] = useState<Nullable<Event>>(null);
  const [participant, setParticipant] = useState<Nullable<Participant>>(null);
  const [participantsList, setParticipantsList] = useState<Participant[]>([]);
  const [round, setRound] = useState<Nullable<Round>>(null);
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<Nullable<string>>(null);
  const [error, setError] = useState<Nullable<string>>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardState>(INITIAL_LEADERBOARD);
  const [eventSettings, setEventSettings] = useState<EventSettings>(() => normalizeSettings(null));
  const [allowanceInput, setAllowanceInput] = useState(() =>
    String(normalizeSettings(null).allowancePct ?? DEFAULT_ALLOWANCE.stroke),
  );
  const nameMapRef = useRef<NameMap>({});
  const pollStopRef = useRef<Nullable<PollStop>>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const env = useMemo(() => {
    const globalEnv =
      typeof globalThis !== 'undefined'
        ? ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {})
        : {};
    return globalEnv;
  }, []);

  const liveEnabled = useMemo(() => {
    const raw =
      env.EXPO_PUBLIC_EVENTS_LIVE_ENABLED ??
      env.EVENTS_LIVE_ENABLED ??
      env['events.live.enabled'] ??
      'true';
    return raw === 'true' || raw === '1';
  }, [env]);

  const liveBase = useMemo(() => {
    const base =
      env.EXPO_PUBLIC_LIVE_BASE ?? env.EXPO_PUBLIC_WEB_BASE ?? env.EXPO_PUBLIC_APP_BASE ?? 'https://app.golfiq.dev';
    return base.toString().replace(/\/$/, '');
  }, [env]);

  const eventIdForShare = event?.id ?? '';
  const roundIdForShare = participant?.round_id ?? '';

  const liveUrl = useMemo(() => {
    if (!liveEnabled || !eventIdForShare || !roundIdForShare) {
      return '';
    }
    return `${liveBase}/${eventIdForShare}/live/${roundIdForShare}`;
  }, [liveEnabled, liveBase, eventIdForShare, roundIdForShare]);

  const showLiveLink = liveEnabled && Boolean(event && participant?.round_id && liveUrl);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = await ensureClient();
        const authUser = await client?.auth?.getUser?.();
        const id = authUser?.data?.user?.id;
        if (active && id && !userId) {
          setUserId(id);
        }
      } catch (supabaseError) {
        console.warn('[EventPanel] failed to resolve auth user', supabaseError);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    setRound(getActiveRound());
    const unsubscribe = subscribeToRound((nextRound) => {
      setRound(nextRound);
    });
    return unsubscribe;
  }, []);

  const attachCleanupStatusTimer = useCallback(() => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    if (status) {
      statusTimerRef.current = setTimeout(() => {
        setStatus(null);
      }, STATUS_CLEAR_DELAY);
    }
  }, [status]);

  useEffect(() => {
    attachCleanupStatusTimer();
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, [attachCleanupStatusTimer]);

  useEffect(() => {
    if (event) {
      const prev = getEventContext();
      setEventContext({
        event,
        participant: participant ?? null,
        handicap: prev?.handicap ?? null,
      });
      return;
    }
    setEventContext(null);
  }, [event, participant]);

  useEffect(() => {
    const normalized = normalizeSettings(event?.settings);
    setEventSettings((prev) => {
      if (
        prev.scoringFormat === normalized.scoringFormat &&
        (prev.allowancePct ?? null) === (normalized.allowancePct ?? null)
      ) {
        return prev;
      }
      return normalized;
    });
    setAllowanceInput((prev) => {
      const next = String(normalized.allowancePct ?? DEFAULT_ALLOWANCE[normalized.scoringFormat]);
      return prev === next ? prev : next;
    });
  }, [event?.id, event?.settings]);

  useEffect(() => {
    if (!event) {
      setParticipantsList([]);
      nameMapRef.current = {};
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listParticipants(event.id);
        if (cancelled) {
          return;
        }
        setParticipantsList(rows);
        const nextMap: NameMap = {};
        for (const row of rows) {
          nextMap[row.user_id] = row.display_name;
        }
        nameMapRef.current = nextMap;
      } catch (listError) {
        console.warn('[EventPanel] list participants failed', listError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event]);

  useEffect(() => {
    return () => {
      setEventContext(null);
      if (pollStopRef.current) {
        pollStopRef.current();
        pollStopRef.current = null;
      }
    };
  }, []);

  const updateStatus = useCallback((nextStatus: string | null, nextError: string | null = null) => {
    setStatus(nextStatus);
    setError(nextError);
  }, []);

  const handleCopyLiveLink = useCallback(async () => {
    if (!liveUrl) {
      return;
    }
    try {
      await Clipboard.setStringAsync(liveUrl);
      updateStatus('Live link copied');
    } catch (copyError) {
      console.warn('[EventPanel] copy live link failed', copyError);
      updateStatus(null, 'Unable to copy live link');
    }
  }, [liveUrl, updateStatus]);

  const handleSelectFormat = useCallback(
    (nextFormat: ScoringFormat) => {
      setEventSettings((prev) => {
        if (prev.scoringFormat === nextFormat) {
          return prev;
        }
        const currentValue = Number.parseFloat(allowanceInput);
        const hasCustomAllowance =
          !Number.isNaN(currentValue) && currentValue !== DEFAULT_ALLOWANCE[prev.scoringFormat];
        if (!hasCustomAllowance) {
          setAllowanceInput(String(DEFAULT_ALLOWANCE[nextFormat]));
        }
        return {
          scoringFormat: nextFormat,
          allowancePct: hasCustomAllowance ? Math.max(0, currentValue) : DEFAULT_ALLOWANCE[nextFormat],
        };
      });
    },
    [allowanceInput],
  );

  const handleAllowanceChange = useCallback((value: string) => {
    setAllowanceInput(value);
    const parsed = Number.parseFloat(value);
    setEventSettings((prev) => ({
      ...prev,
      allowancePct: Number.isNaN(parsed) ? prev.allowancePct : Math.max(0, parsed),
    }));
  }, []);

  const handleCreate = useCallback(async () => {
    const name = createName.trim();
    if (!name) {
      updateStatus(null, 'Enter an event name');
      return;
    }
    try {
      updateStatus('Creating event…');
      const created = await createEvent(name);
      setEvent(created);
      setParticipant(null);
      setParticipantsList([]);
      setJoinCode(created.code ?? '');
      nameMapRef.current = {};
      setLeaderboard(INITIAL_LEADERBOARD);
      recordEventCreated(created);
      updateStatus(`Event created (${created.code})`);
    } catch (createError) {
      console.warn('[EventPanel] create event failed', createError);
      updateStatus(null, 'Unable to create event');
    }
  }, [createName, updateStatus]);

  const handleJoin = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    const name = displayName.trim() || 'Player';
    const id = userId.trim();
    if (!code) {
      updateStatus(null, 'Enter an event code');
      return;
    }
    if (!id) {
      updateStatus(null, 'Enter a user ID');
      return;
    }
    try {
      updateStatus('Joining event…');
      const joined = await joinEventByCode(code, {
        user_id: id,
        display_name: name,
        hcp_index: participant?.hcp_index ?? null,
        round_id: participant?.round_id ?? null,
      });
      setParticipant(joined);
      setParticipantsList((prev) => {
        const others = prev.filter((p) => p.user_id !== joined.user_id);
        return [...others, joined];
      });
      nameMapRef.current = { ...nameMapRef.current, [joined.user_id]: joined.display_name };
      setStatus('Joined event');
      setError(null);
      let resolvedEvent = event && event.id === joined.event_id ? event : null;
      if (!resolvedEvent) {
        const fetched = await fetchEvent(joined.event_id);
        if (fetched) {
          setEvent(fetched);
          resolvedEvent = fetched;
        } else {
          const fallback: Event = {
            id: joined.event_id,
            name: 'Event',
            code,
            status: 'open',
            settings: normalizeSettings(null),
          };
          setEvent(fallback);
          resolvedEvent = fallback;
        }
      }
      if (resolvedEvent) {
        recordEventJoined(resolvedEvent, joined);
      }
    } catch (joinError) {
      console.warn('[EventPanel] join event failed', joinError);
      updateStatus(null, 'Unable to join event');
    }
  }, [displayName, event, joinCode, participant, updateStatus, userId]);

  const handleSaveSettings = useCallback(async () => {
    if (!event) {
      return;
    }
    const parsed = Number.parseFloat(allowanceInput);
    const allowanceValue = Number.isNaN(parsed)
      ? DEFAULT_ALLOWANCE[eventSettings.scoringFormat]
      : Math.max(0, parsed);
    const nextSettings: EventSettings = {
      scoringFormat: eventSettings.scoringFormat,
      allowancePct: allowanceValue,
    };
    try {
      updateStatus('Saving settings…');
      const updated = await updateEventSettings(event.id, nextSettings);
      setEvent(updated);
      updateStatus('Settings saved');
    } catch (saveError) {
      console.warn('[EventPanel] update settings failed', saveError);
      const current = normalizeSettings(event.settings);
      setEventSettings(current);
      setAllowanceInput(
        String(current.allowancePct ?? DEFAULT_ALLOWANCE[current.scoringFormat]),
      );
      updateStatus(null, 'Unable to save settings');
    }
  }, [allowanceInput, event, eventSettings.scoringFormat, updateStatus]);

  const handleAttachRound = useCallback(async () => {
    if (!event || !participant || !round) {
      return;
    }
    try {
      updateStatus('Attaching round…');
      await attachRound(event.id, participant.user_id, round.id);
      const nextParticipant: Participant = { ...participant, round_id: round.id };
      setParticipant(nextParticipant);
      setParticipantsList((prev) =>
        prev.map((p) => (p.user_id === nextParticipant.user_id ? nextParticipant : p)),
      );
      nameMapRef.current = { ...nameMapRef.current, [nextParticipant.user_id]: nextParticipant.display_name };
      recordEventAttachedRound(event.id, participant.user_id, round.id);
      updateStatus('Round attached');
    } catch (attachError) {
      console.warn('[EventPanel] attach round failed', attachError);
      updateStatus(null, 'Unable to attach round');
    }
  }, [event, participant, round, updateStatus]);

  useEffect(() => {
    if (pollStopRef.current) {
      pollStopRef.current();
      pollStopRef.current = null;
    }
    if (!event) {
      setLeaderboard(INITIAL_LEADERBOARD);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stop = await pollScores(event.id, (rows: ScoreRow[]) => {
          if (cancelled) {
            return;
          }
          const holesPlayed: Record<string, number> = {};
          for (const row of rows) {
            holesPlayed[row.user_id] = (holesPlayed[row.user_id] ?? 0) + 1;
          }
          const nameByUser: NameMap = { ...nameMapRef.current };
          const hcpByUser: Record<string, number | undefined | null> = {};
          for (const item of participantsList) {
            nameByUser[item.user_id] = item.display_name;
            hcpByUser[item.user_id] = item.hcp_index ?? 0;
          }
          if (participant) {
            nameByUser[participant.user_id] = participant.display_name;
            hcpByUser[participant.user_id] = participant.hcp_index ?? 0;
          }
          const rowsSorted = aggregateLeaderboard(rows, nameByUser, {
            hcpIndexByUser: hcpByUser,
            holesPlayedByUser: holesPlayed,
            format: eventSettings.scoringFormat,
          });
          setLeaderboard({ rows: rowsSorted, updatedAt: Date.now() });
        });
        if (!cancelled) {
          pollStopRef.current = stop;
        } else if (stop) {
          stop();
        }
      } catch (pollError) {
        console.warn('[EventPanel] poll scores failed', pollError);
        if (!cancelled) {
          updateStatus(null, 'Unable to load scores');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (pollStopRef.current) {
        pollStopRef.current();
        pollStopRef.current = null;
      }
    };
  }, [event, eventSettings.scoringFormat, participant, participantsList, updateStatus]);

  useEffect(() => {
    if (participant) {
      nameMapRef.current = { ...nameMapRef.current, [participant.user_id]: participant.display_name };
    }
  }, [participant]);

  const activeFormat = eventSettings.scoringFormat;
  const parsedAllowance = Number.parseFloat(allowanceInput);
  const allowanceValue = Number.isNaN(parsedAllowance)
    ? eventSettings.allowancePct ?? DEFAULT_ALLOWANCE[activeFormat]
    : Math.max(0, parsedAllowance);

  const leaderboardRows = useMemo(() => leaderboard.rows, [leaderboard]);
  const roundAttached = Boolean(participant?.round_id && round && participant.round_id === round.id);
  const playerPh = useMemo(() => {
    if (!round?.handicapSetup) {
      return null;
    }
    const holes: HoleInput[] = round.holes
      .filter((hole) => Number.isFinite(hole.score))
      .map((hole) => ({
        hole: hole.holeNo,
        par: hole.par,
        gross: Number(hole.score),
      }));
    const aggregate = computeAggregateForFormat(activeFormat, {
      ...round.handicapSetup,
      allowancePct: allowanceValue,
    }, holes);
    return aggregate.ph;
  }, [activeFormat, allowanceValue, round]);
  const showStableford = activeFormat === 'stableford';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Events</Text>
      {event ? (
        <View style={styles.eventMeta}>
          <Text style={styles.metaText}>Name: {event.name}</Text>
          <Text style={styles.metaText}>Code: {event.code}</Text>
          <Text style={styles.metaText}>Status: {event.status ?? 'open'}</Text>
        </View>
      ) : (
        <Text style={styles.metaText}>No active event</Text>
      )}
      {event ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Format settings</Text>
          <View style={styles.formatRow}>
            {(['stroke', 'stableford'] as ScoringFormat[]).map((fmt) => {
              const selected = activeFormat === fmt;
              return (
                <TouchableOpacity
                  key={fmt}
                  onPress={() => handleSelectFormat(fmt)}
                  style={[
                    styles.formatButton,
                    fmt !== 'stableford' ? styles.formatButtonSpacing : null,
                    selected ? styles.formatButtonActive : null,
                  ]}
                >
                  <Text
                    style={[styles.formatButtonLabel, selected ? styles.formatButtonLabelActive : null]}
                  >
                    {fmt === 'stroke' ? 'Stroke' : 'Stableford'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.metaText}>Allowance %</Text>
          <TextInput
            placeholder="95"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            value={allowanceInput}
            onChangeText={handleAllowanceChange}
            style={styles.input}
          />
          <TouchableOpacity onPress={handleSaveSettings} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Save settings</Text>
          </TouchableOpacity>
          {playerPh !== null ? (
            <Text style={styles.metaText}>Your PH: {playerPh}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create event</Text>
        <TextInput
          placeholder="Event name"
          placeholderTextColor="#94a3b8"
          value={createName}
          onChangeText={setCreateName}
          style={styles.input}
        />
        <TouchableOpacity onPress={handleCreate} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Create</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Join event</Text>
        <TextInput
          placeholder="Join code"
          placeholderTextColor="#94a3b8"
          autoCapitalize="characters"
          value={joinCode}
          onChangeText={setJoinCode}
          style={styles.input}
        />
        <TextInput
          placeholder="Display name"
          placeholderTextColor="#94a3b8"
          value={displayName}
          onChangeText={setDisplayName}
          style={styles.input}
        />
        <TextInput
          placeholder="User ID"
          placeholderTextColor="#94a3b8"
          value={userId}
          onChangeText={setUserId}
          style={styles.input}
        />
        <TouchableOpacity onPress={handleJoin} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Join</Text>
        </TouchableOpacity>
      </View>
      {participant && round && !roundAttached ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active round</Text>
          <Text style={styles.metaText}>Round ID: {round.id}</Text>
          <TouchableOpacity onPress={handleAttachRound} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Attach this round</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {showLiveLink ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live link</Text>
          <Text style={styles.metaText}>Share a live scoreboard with spectators.</Text>
          <TouchableOpacity onPress={handleCopyLiveLink} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Share live link</Text>
          </TouchableOpacity>
          <View style={styles.qrWrapper}>
            {liveUrl ? (
              <QRCode value={liveUrl} size={160} color="#e2e8f0" backgroundColor="#0f172a" />
            ) : null}
          </View>
          {liveUrl ? (
            <Text style={styles.qrCaption} numberOfLines={2} selectable>
              {liveUrl}
            </Text>
          ) : null}
        </View>
      ) : null}
      {status ? <Text style={styles.statusText}>{status}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.leaderboard}>
        <Text style={styles.sectionTitle}>Leaderboard</Text>
        {leaderboardRows.length ? (
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.nameCell]}>Player</Text>
              <Text style={styles.cell}>Gross</Text>
              <Text style={styles.cell}>{showStableford ? 'Pts' : 'Net'}</Text>
              <Text style={styles.cell}>PH</Text>
              {!showStableford ? <Text style={styles.cell}>To Par</Text> : null}
              <Text style={styles.cell}>Thru</Text>
            </View>
            <ScrollView style={styles.tableBody}>
              {leaderboardRows.map((row) => (
                <View key={row.user_id} style={styles.row}>
                  <View style={[styles.nameCellContainer, styles.nameCell]}>
                    <Text style={styles.nameText} numberOfLines={1}>
                      {row.display_name}
                    </Text>
                    {row.playing_handicap !== undefined && row.playing_handicap !== null ? (
                      <View style={styles.phBadge}>
                        <Text style={styles.phBadgeText}>PH {row.playing_handicap}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cell}>{row.gross}</Text>
                  <Text style={styles.cell}>{showStableford ? row.stableford ?? '—' : row.net}</Text>
                  <Text style={styles.cell}>
                    {row.playing_handicap !== undefined && row.playing_handicap !== null
                      ? row.playing_handicap
                      : '—'}
                  </Text>
                  {!showStableford ? (
                    <Text style={styles.cell}>
                      {typeof row.toPar === 'number'
                        ? row.toPar > 0
                          ? `+${row.toPar}`
                          : row.toPar
                        : '—'}
                    </Text>
                  ) : null}
                  <Text style={styles.cell}>{row.holes}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          <Text style={styles.metaText}>No scores yet.</Text>
        )}
      </View>
    </View>
  );
};

export default EventPanel;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5f5',
  },
  input: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f8fafc',
    backgroundColor: '#1e293b',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  qrWrapper: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0b1221',
  },
  qrCaption: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  statusText: {
    color: '#22c55e',
    fontSize: 13,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
  },
  leaderboard: {
    gap: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableBody: {
    maxHeight: 160,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e293b',
    alignItems: 'center',
  },
  headerRow: {
    backgroundColor: '#1e293b',
  },
  cell: {
    flex: 1,
    color: '#cbd5f5',
    fontSize: 13,
  },
  nameCell: {
    flex: 1.5,
  },
  eventMeta: {
    gap: 4,
  },
  metaText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  formatRow: {
    flexDirection: 'row',
  },
  formatButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  formatButtonSpacing: {
    marginRight: 8,
  },
  formatButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#1e3a8a',
  },
  formatButtonLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  formatButtonLabelActive: {
    color: '#f8fafc',
  },
  nameCellContainer: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameText: {
    color: '#cbd5f5',
    fontSize: 13,
    flexShrink: 1,
  },
  phBadge: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  phBadgeText: {
    color: '#cbd5f5',
    fontSize: 11,
    fontWeight: '600',
  },
});
