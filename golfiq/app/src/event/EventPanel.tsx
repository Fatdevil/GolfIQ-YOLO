import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { aggregateLeaderboard } from '../../../../shared/events/scoring';
import {
  attachRound,
  createEvent,
  fetchEvent,
  joinEventByCode,
  listParticipants,
  pollScores,
} from '../../../../shared/events/service';
import { setEventContext } from '../../../../shared/events/state';
import type { Event, LeaderboardRow, Participant, ScoreRow } from '../../../../shared/events/types';
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
  const nameMapRef = useRef<NameMap>({});
  const pollStopRef = useRef<Nullable<PollStop>>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setEventContext(event ? { event, participant: participant ?? null } : null);
  }, [event, participant]);

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
  }, [event, participant, participantsList, updateStatus]);

  useEffect(() => {
    if (participant) {
      nameMapRef.current = { ...nameMapRef.current, [participant.user_id]: participant.display_name };
    }
  }, [participant]);

  const leaderboardRows = useMemo(() => leaderboard.rows, [leaderboard]);
  const roundAttached = Boolean(participant?.round_id && round && participant.round_id === round.id);

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
      {status ? <Text style={styles.statusText}>{status}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.leaderboard}>
        <Text style={styles.sectionTitle}>Leaderboard</Text>
        {leaderboardRows.length ? (
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.nameCell]}>Player</Text>
              <Text style={styles.cell}>Gross</Text>
              <Text style={styles.cell}>Net</Text>
              <Text style={styles.cell}>To Par</Text>
              <Text style={styles.cell}>Thru</Text>
            </View>
            <ScrollView style={styles.tableBody}>
              {leaderboardRows.map((row) => (
                <View key={row.user_id} style={styles.row}>
                  <Text style={[styles.cell, styles.nameCell]} numberOfLines={1}>
                    {row.display_name}
                  </Text>
                  <Text style={styles.cell}>{row.gross}</Text>
                  <Text style={styles.cell}>{row.net}</Text>
                  <Text style={styles.cell}>{row.to_par > 0 ? `+${row.to_par}` : row.to_par}</Text>
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
});
