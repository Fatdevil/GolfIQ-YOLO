import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_BASE } from '../../lib/api';
import type { Drill, Plan, TrainingFocus } from '../../../../shared/training/types';
import { loadTrainingPacks, getPlansByFocus } from '../../../../shared/training/content_loader';
import { getCoachProvider } from '../../../../shared/coach/provider';
import {
  isCoachLearningActive,
  loadPlayerProfile,
  resolveProfileId,
  savePlayerProfile,
  updateFromPractice,
  type PlayerProfile,
} from '../../../../shared/coach/profile';
import { getCaddieRc } from '../../../../shared/caddie/rc';
import { generatePlanSessions, recommendPlan } from '../../../../shared/training/scheduler';
import SessionList, {
  type SessionState,
} from './Practice/SessionList';
import {
  cancelAllPracticeReminders,
  ensureReminderPermission,
  scheduleReminder,
} from '../../../../shared/notifications/local_reminders';

const FOCUS_OPTIONS: TrainingFocus[] = [
  'long-drive',
  'tee',
  'approach',
  'wedge',
  'short',
  'putt',
  'recovery',
];

type DrillIndex = Record<string, Drill>;
type FocusTrendMap = Partial<Record<TrainingFocus, { d7: number; d30: number }>>;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#0f172a',
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 12,
  },
  focusList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 8,
  },
  focusChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: 'transparent',
  },
  focusChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  focusChipText: {
    color: '#e2e8f0',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  coachBadge: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  coachBadgeText: {
    color: '#bfdbfe',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardMeta: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 8,
  },
  drillRow: {
    marginTop: 6,
    color: '#cbd5f5',
    fontSize: 14,
  },
  button: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#38bdf8',
    alignItems: 'center',
  },
  buttonText: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 15,
  },
  statusText: {
    marginTop: 12,
    color: '#f1f5f9',
    fontSize: 14,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    fontStyle: 'italic',
  },
  toggleRow: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleMeta: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 4,
  },
  trendCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1f2937',
  },
  trendTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  trendRow: {
    flexDirection: 'row',
    gap: 12,
  },
  trendValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  trendPositive: {
    color: '#4ade80',
  },
  trendNegative: {
    color: '#f97316',
  },
  trendMeta: {
    color: '#94a3b8',
    fontSize: 13,
  },
});

const formatFocus = (focus: TrainingFocus): string => focus.replace('-', ' ');

const formatDelta = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  const fixed = value.toFixed(2);
  return value >= 0 ? `+${fixed}` : fixed;
};

const GoalsPanel: React.FC = () => {
  const rc = useMemo(() => getCaddieRc(), []);
  const defaultFocus = useMemo<TrainingFocus>(
    () => rc.trainingFocusDefault ?? 'approach',
    [rc],
  );
  const [learningActive, setLearningActive] = useState(false);
  const [selectedFocus, setSelectedFocus] = useState<TrainingFocus>(defaultFocus);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plansByFocus, setPlansByFocus] = useState<Record<TrainingFocus, Plan[]>>({
    'long-drive': [],
    tee: [],
    approach: [],
    wedge: [],
    short: [],
    putt: [],
    recovery: [],
  });
  const [drillIndex, setDrillIndex] = useState<DrillIndex>({});
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [trend, setTrend] = useState<FocusTrendMap>({});
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [manualFocus, setManualFocus] = useState(false);
  const [coachPlanId, setCoachPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = await isCoachLearningActive(rc);
      if (cancelled) {
        return;
      }
      setLearningActive(active);
      if (!active) {
        setProfile(null);
        setProfileId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rc]);

  useEffect(() => {
    if (!learningActive) {
      setProfile(null);
      setProfileId(null);
      return;
    }
    let cancelled = false;
    const bootstrapProfile = async () => {
      try {
        const id = await resolveProfileId();
        if (cancelled) {
          return;
        }
        setProfileId(id);
        const loaded = await loadPlayerProfile(id);
        if (!cancelled) {
          setProfile(loaded);
          setManualFocus(false);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
        }
      }
    };
    bootstrapProfile();
    return () => {
      cancelled = true;
    };
  }, [learningActive]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const packs = await loadTrainingPacks();
        if (cancelled) {
          return;
        }
        const drillMap: DrillIndex = {};
        packs.forEach((pack) => {
          pack.drills.forEach((drill) => {
            drillMap[drill.id] = drill;
          });
        });
        const nextPlans: Record<TrainingFocus, Plan[]> = {
          'long-drive': [],
          tee: [],
          approach: [],
          wedge: [],
          short: [],
          putt: [],
          recovery: [],
        };
        FOCUS_OPTIONS.forEach((focus) => {
          try {
            const plans = getPlansByFocus(focus);
            nextPlans[focus] = plans;
          } catch (planError) {
            nextPlans[focus] = [];
          }
        });
        setPlansByFocus(nextPlans);
        setDrillIndex(drillMap);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message ?? 'Failed to load training plans');
          setLoading(false);
        }
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTrend = async () => {
      setTrendLoading(true);
      setTrendError(null);
      try {
        const response = await fetch(`${API_BASE}/caddie/health?since=30d`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (cancelled) {
          return;
        }
        const raw = payload?.sg_trend_by_focus as
          | Record<string, { d7?: number; d30?: number }>
          | undefined;
        const next: FocusTrendMap = {};
        if (raw && typeof raw === 'object') {
          FOCUS_OPTIONS.forEach((focus) => {
            const entry = raw[focus];
            if (
              entry &&
              typeof entry.d7 === 'number' &&
              typeof entry.d30 === 'number'
            ) {
              next[focus] = { d7: entry.d7, d30: entry.d30 };
            }
          });
        }
        setTrend(next);
      } catch (err) {
        if (!cancelled) {
          setTrend({});
          setTrendError((err as Error).message ?? 'Kunde inte ladda trend.');
        }
      } finally {
        if (!cancelled) {
          setTrendLoading(false);
        }
      }
    };
    loadTrend();
    return () => {
      cancelled = true;
    };
  }, []);

  const syncReminders = useCallback(
    async (nextSessions: SessionState[], enabled: boolean, planName?: string) => {
      if (!enabled) {
        try {
          await cancelAllPracticeReminders();
        } catch {
          // ignore
        }
        return;
      }
      const upcoming = nextSessions.filter((session) => session.status === 'upcoming');
      if (!upcoming.length) {
        try {
          await cancelAllPracticeReminders();
        } catch {
          // ignore
        }
        return;
      }
      try {
        await cancelAllPracticeReminders();
      } catch {
        // ignore clear failures
      }
      const label = planName ?? upcoming[0]?.planName ?? 'Practice';
      await Promise.all(
        upcoming.slice(0, 6).map(async (session) => {
          try {
            const when = new Date(session.scheduledAt);
            const descriptor = when.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
            const text = `${label} • ${descriptor}`;
            await scheduleReminder(session.scheduledAt, text);
          } catch {
            // ignore scheduling errors
          }
        }),
      );
    },
    [],
  );

  useEffect(() => {
    void syncReminders(sessions, remindersEnabled, activePlan?.name ?? undefined);
  }, [sessions, remindersEnabled, syncReminders, activePlan]);

  const handleFocusSelect = useCallback((focus: TrainingFocus) => {
    setManualFocus(true);
    setSelectedFocus(focus);
  }, []);

  const updateSessionStatus = useCallback((targetId: string, status: SessionState['status']) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== targetId) {
          return session;
        }
        if (status === 'completed') {
          return {
            ...session,
            status,
            completedAt: Date.now(),
          };
        }
        if (status === 'skipped') {
          return {
            ...session,
            status,
            skippedAt: Date.now(),
          };
        }
        return session;
      }),
    );
  }, []);

  const applySessionOutcome = useCallback(
    async (session: SessionState, completed: boolean) => {
      if (!learningActive || !profileId) {
        return;
      }
      try {
        const currentProfile = profile ?? (await loadPlayerProfile(profileId));
        const nextProfile = updateFromPractice(currentProfile, {
          focus: session.focus,
          completed,
        });
        setProfile(nextProfile);
        await savePlayerProfile(nextProfile);
      } catch {
        // ignore profile persistence errors
      }
    },
    [learningActive, profile, profileId],
  );

  const handleCompleteSession = useCallback(
    (session: SessionState) => {
      updateSessionStatus(session.id, 'completed');
      console.log('practice:event', {
        action: 'complete',
        sessionId: session.id,
        planId: session.planId,
      });
      void applySessionOutcome(session, true);
    },
    [applySessionOutcome, updateSessionStatus],
  );

  const handleSkipSession = useCallback(
    (session: SessionState) => {
      updateSessionStatus(session.id, 'skipped');
      console.log('practice:event', {
        action: 'skip',
        sessionId: session.id,
        planId: session.planId,
      });
      void applySessionOutcome(session, false);
    },
    [applySessionOutcome, updateSessionStatus],
  );

  const handleStartPlan = useCallback(
    (plan: Plan) => {
      const provider = getCoachProvider();
      const scheduled = generatePlanSessions(plan, selectedFocus, drillIndex);
      const nextSessions: SessionState[] = scheduled.map((session) => ({
        ...session,
        planName: plan.name,
        status: 'upcoming',
        completedAt: null,
        skippedAt: null,
      }));
      setSessions(nextSessions);
      setActivePlan(plan);
      setStatusMessage(
        `Planen ${plan.name} startad – ${nextSessions.length} pass planerade.`,
      );
      console.log('practice:event', {
        action: 'start_plan',
        planId: plan.id,
        focus: selectedFocus,
        sessions: nextSessions.length,
      });
      const recommendedId = provider.getPracticePlan?.(selectedFocus);
      if (recommendedId && recommendedId !== plan.id) {
        console.log('Coach recommended plan mismatch', recommendedId);
      }
    },
    [drillIndex, selectedFocus],
  );

  const handleReminderToggle = useCallback(async (value: boolean) => {
    if (value) {
      const allowed = await ensureReminderPermission();
      if (!allowed) {
        Alert.alert(
          'Aviseringar',
          'Vi kunde inte aktivera lokala påminnelser utan tillstånd.',
        );
        setRemindersEnabled(false);
        await cancelAllPracticeReminders();
        return;
      }
    } else {
      try {
        await cancelAllPracticeReminders();
      } catch {
        // ignore
      }
    }
    setRemindersEnabled(value);
  }, []);

  const coachRecommendation = useMemo(() => {
    if (!learningActive || !profile) {
      return null;
    }
    return recommendPlan(plansByFocus, profile, defaultFocus, { learningActive });
  }, [learningActive, defaultFocus, plansByFocus, profile]);

  useEffect(() => {
    if (!coachRecommendation) {
      setCoachPlanId(null);
      return;
    }
    setCoachPlanId(coachRecommendation.plan?.id ?? null);
    if (!manualFocus && coachRecommendation.focus !== selectedFocus) {
      setSelectedFocus(coachRecommendation.focus);
    }
  }, [coachRecommendation, manualFocus, selectedFocus]);

  const plans = plansByFocus[selectedFocus] ?? [];
  const selectedTrend = trend[selectedFocus];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.heading}>Träningsfokus</Text>
      <View style={styles.focusList}>
        {FOCUS_OPTIONS.map((focus) => {
          const active = focus === selectedFocus;
          return (
            <TouchableOpacity
              key={focus}
              style={[styles.focusChip, active && styles.focusChipActive]}
              onPress={() => handleFocusSelect(focus)}
            >
              <Text style={styles.focusChipText}>{formatFocus(focus)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.trendCard}>
        <Text style={styles.trendTitle}>
          SG-trend ({formatFocus(selectedFocus)})
        </Text>
        {trendLoading && <Text style={styles.trendMeta}>Laddar trenddata …</Text>}
        {!trendLoading && trendError && (
          <Text style={styles.trendMeta}>Trend saknas ({trendError}).</Text>
        )}
        {!trendLoading && !trendError && !selectedTrend && (
          <Text style={styles.trendMeta}>Ingen trenddata ännu.</Text>
        )}
        {!trendLoading && !trendError && selectedTrend && (
          <View style={styles.trendRow}>
            <Text
              style={[
                styles.trendValue,
                selectedTrend.d7 >= 0 ? styles.trendPositive : styles.trendNegative,
              ]}
            >
              7d {formatDelta(selectedTrend.d7)}
            </Text>
            <Text
              style={[
                styles.trendValue,
                selectedTrend.d30 >= 0 ? styles.trendPositive : styles.trendNegative,
              ]}
            >
              30d {formatDelta(selectedTrend.d30)}
            </Text>
          </View>
        )}
      </View>

      {loading && <Text style={styles.statusText}>Laddar träningsprogram …</Text>}
      {error && !loading && <Text style={styles.statusText}>Fel: {error}</Text>}
      {!loading && !plans.length && !error && (
        <Text style={styles.emptyText}>Inga program hittades för det här fokuset ännu.</Text>
      )}
      {!loading &&
        plans.map((plan) => {
          const isCoachSuggested = plan.id === coachPlanId;
          return (
            <View key={plan.id} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{plan.name}</Text>
                {isCoachSuggested && (
                  <View style={styles.coachBadge}>
                    <Text style={styles.coachBadgeText}>Suggested by Coach</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardMeta}>
                Version {plan.version}
                {plan.schedule ? ` • ${plan.schedule}` : ''}
                {plan.estTotalMin ? ` • ~${plan.estTotalMin} min` : ''}
              </Text>
              {plan.drills.map((item) => {
                const drill = drillIndex[item.id];
                const label = drill?.title ?? item.id;
                const reps = item.reps ? `${item.reps} reps` : undefined;
                const duration = item.durationMin ? `${item.durationMin} min` : undefined;
                const meta = [reps, duration].filter(Boolean).join(' • ');
                return (
                  <Text key={`${plan.id}-${item.id}`} style={styles.drillRow}>
                    • {label}
                    {meta ? ` (${meta})` : ''}
                  </Text>
                );
              })}
              <TouchableOpacity style={styles.button} onPress={() => handleStartPlan(plan)}>
                <Text style={styles.buttonText}>Starta program</Text>
              </TouchableOpacity>
            </View>
          );
        })}

      <View style={styles.toggleRow}>
        <View style={styles.toggleCopy}>
          <Text style={styles.toggleTitle}>Lokala påminnelser</Text>
          <Text style={styles.toggleMeta}>
            Skicka aviseringar inför planerade träningspass. Kan stängas av när som helst.
          </Text>
        </View>
        <Switch
          value={remindersEnabled}
          onValueChange={(value) => {
            void handleReminderToggle(value);
          }}
        />
      </View>

      {sessions.length > 0 && (
        <SessionList
          sessions={sessions}
          onComplete={handleCompleteSession}
          onSkip={handleSkipSession}
        />
      )}

      {statusMessage && <Text style={styles.statusText}>{statusMessage}</Text>}
    </ScrollView>
  );
};

export default GoalsPanel;
