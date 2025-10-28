import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Drill, Plan, TrainingFocus } from '../../../../shared/training/types';
import { loadTrainingPacks, getPlansByFocus } from '../../../../shared/training/content_loader';
import { getCoachProvider } from '../../../../shared/coach/provider';
import { getCaddieRc } from '../../../../shared/caddie/rc';
import { createSessionFromPlan, type PracticeSession } from './Practice/sessionFactory';

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
  cardTitle: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
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
});

const GoalsPanel: React.FC = () => {
  const rc = useMemo(() => getCaddieRc(), []);
  const defaultFocus = useMemo<TrainingFocus>(() => rc.trainingFocusDefault ?? 'approach', [rc]);
  const [selectedFocus, setSelectedFocus] = useState<TrainingFocus>(defaultFocus);
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
  const [lastSession, setLastSession] = useState<PracticeSession | null>(null);

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
            // ignore focus without packs
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

  const handleFocusSelect = useCallback((focus: TrainingFocus) => {
    setSelectedFocus(focus);
  }, []);

  const handleStartPlan = useCallback(
    (plan: Plan) => {
      const provider = getCoachProvider();
      const session = createSessionFromPlan(plan, selectedFocus, drillIndex);
      console.log('Practice session created', session);
      const recommendedId = provider.getPracticePlan?.(selectedFocus);
      if (recommendedId && recommendedId !== plan.id) {
        console.log('Coach recommended plan mismatch', recommendedId);
      }
      setLastSession(session);
    },
    [drillIndex, selectedFocus],
  );

  const recommendedPlanId = useMemo(() => {
    const provider = getCoachProvider();
    return provider.getPracticePlan?.(selectedFocus) ?? null;
  }, [selectedFocus]);

  const plans = plansByFocus[selectedFocus] ?? [];

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
              <Text style={styles.focusChipText}>{focus.replace('-', ' ')}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {loading && <Text style={styles.statusText}>Laddar träningsprogram …</Text>}
      {error && !loading && <Text style={styles.statusText}>Fel: {error}</Text>}
      {!loading && !plans.length && !error && (
        <Text style={styles.emptyText}>Inga program hittades för det här fokuset ännu.</Text>
      )}
      {!loading &&
        plans.map((plan) => {
          const isRecommended = plan.id === recommendedPlanId;
          return (
            <View key={plan.id} style={styles.card}>
              <Text style={styles.cardTitle}>{plan.name}</Text>
              <Text style={styles.cardMeta}>
                Version {plan.version}
                {plan.schedule ? ` • ${plan.schedule}` : ''}
                {plan.estTotalMin ? ` • ~${plan.estTotalMin} min` : ''}
                {isRecommended ? ' • Rekommenderad' : ''}
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
      {lastSession && (
        <Text style={styles.statusText}>
          Startade {lastSession.planId} ({lastSession.drills.length} moment) {new Date(lastSession.startedAt).toLocaleTimeString()}.
        </Text>
      )}
    </ScrollView>
  );
};

export default GoalsPanel;
