import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  appendShot,
  endRound,
  getRoundScores,
  updateHoleScore,
  type HoleScore,
  type Shot,
} from '@app/api/roundClient';
import type { RootStackParamList } from '@app/navigation/types';
import {
  clearActiveRoundState,
  loadActiveRoundState,
  saveActiveRoundState,
  type ActiveRoundState,
} from '@app/round/roundState';

const CLUBS = ['D', '3W', '5W', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW'];

type Props = NativeStackScreenProps<RootStackParamList, 'RoundShot'>;

type Coords = { latitude: number; longitude: number };

function resolveCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    const geo = (navigator as any)?.geolocation;
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      resolve({ latitude: 0, longitude: 0 });
      return;
    }
    geo.getCurrentPosition(
      (pos: any) => {
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      (err: any) => reject(err),
      { enableHighAccuracy: true, timeout: 5000 },
    );
  });
}

export default function RoundShotScreen({ navigation }: Props): JSX.Element {
  const [state, setState] = useState<ActiveRoundState | null>(null);
  const [loading, setLoading] = useState(true);
  const [club, setClub] = useState('7i');
  const [note, setNote] = useState('');
  const [logInFlight, setLogInFlight] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [scores, setScores] = useState<Record<number, HoleScore>>({});
  const [scoreSaving, setScoreSaving] = useState(false);
  const [scoreDirty, setScoreDirty] = useState(false);
  const [scoresLoading, setScoresLoading] = useState(false);

  useEffect(() => {
    loadActiveRoundState()
      .then((roundState) => {
        setState(roundState);
      })
      .finally(() => setLoading(false));
  }, []);

  const currentHole = state?.currentHole ?? 1;

  useEffect(() => {
    if (!state?.round.id) return;
    setScoresLoading(true);
    getRoundScores(state.round.id)
      .then((result) => {
        setScores(result.holes ?? {});
      })
      .finally(() => setScoresLoading(false));
  }, [state?.round.id]);

  const currentScore = useMemo<HoleScore>(() => {
    return scores[currentHole] ?? { holeNumber: currentHole };
  }, [scores, currentHole]);

  const roundLabel = useMemo(() => {
    if (!state) return '';
    const course = state.round.courseId ? ` · ${state.round.courseId}` : '';
    const tee = state.round.teeName ? ` (${state.round.teeName})` : '';
    return `Round ${state.round.id}${course}${tee}`;
  }, [state]);

  const updateScore = useCallback(
    (partial: Partial<HoleScore>) => {
      setScores((prev) => {
        const existing = prev[currentHole] ?? { holeNumber: currentHole };
        return {
          ...prev,
          [currentHole]: { ...existing, ...partial, holeNumber: currentHole },
        };
      });
      setScoreDirty(true);
    },
    [currentHole],
  );

  const handleSaveScore = useCallback(async () => {
    if (!state) return;
    const payloadEntries = Object.entries(currentScore).filter(
      ([key, value]) => key !== 'holeNumber' && value !== undefined,
    );
    setScoreSaving(true);
    try {
      const updated = await updateHoleScore(
        state.round.id,
        currentHole,
        Object.fromEntries(payloadEntries) as Partial<HoleScore>,
      );
      setScores(updated.holes ?? {});
      setScoreDirty(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save score';
      Alert.alert('Save failed', message);
      throw err;
    } finally {
      setScoreSaving(false);
    }
  }, [currentHole, currentScore, state]);

  const ensureScoreSaved = useCallback(async () => {
    if (!scoreDirty) return true;
    try {
      await handleSaveScore();
      return true;
    } catch {
      return false;
    }
  }, [handleSaveScore, scoreDirty]);

  const adjustNumeric = useCallback(
    (field: 'par' | 'strokes' | 'putts' | 'penalties', delta: number, min = 0) => {
      const currentValue = currentScore[field];
      const base = typeof currentValue === 'number' ? currentValue : 0;
      const next = Math.max(min, base + delta);
      updateScore({ [field]: next } as Partial<HoleScore>);
    },
    [currentScore, updateScore],
  );

  const toggleFlag = useCallback(
    (field: 'fairwayHit' | 'gir') => {
      const currentValue = currentScore[field];
      updateScore({ [field]: currentValue == null ? true : !currentValue } as Partial<HoleScore>);
    },
    [currentScore, updateScore],
  );

  const fairwayApplicable = currentScore.par === 4 || currentScore.par === 5;

  const handleLogShot = useCallback(async () => {
    if (!state) return;
    setLogInFlight(true);
    try {
      const coords = await resolveCurrentPosition();
      const shot = await appendShot(state.round.id, {
        holeNumber: currentHole,
        club,
        startLat: coords.latitude,
        startLon: coords.longitude,
        note: note.trim() || undefined,
      });
      setShots((prev) => [...prev, shot]);
      setNote('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to log shot';
      Alert.alert('Shot failed', message);
    } finally {
      setLogInFlight(false);
    }
  }, [state, currentHole, club, note]);

  const handleNextHole = useCallback(async () => {
    if (!state) return;
    const saved = await ensureScoreSaved();
    if (!saved) return;
    const nextHole = state.currentHole + 1;
    const nextState = { ...state, currentHole: nextHole };
    setState(nextState);
    await saveActiveRoundState(nextState);
  }, [ensureScoreSaved, state]);

  const handleEndRound = useCallback(async () => {
    if (!state) return;
    try {
      await ensureScoreSaved();
      await endRound(state.round.id);
      await clearActiveRoundState();
      navigation.navigate('RoundSummary', { roundId: state.round.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end round';
      Alert.alert('End round failed', message);
    }
  }, [ensureScoreSaved, navigation, state]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading round…</Text>
      </View>
    );
  }

  if (!state) {
    return (
      <View style={styles.center}>
        <Text>No active round. Start a new one to log shots.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hole {currentHole}</Text>
      <Text style={styles.subtitle}>{roundLabel}</Text>

      <Text style={styles.label}>Club</Text>
      <FlatList
        horizontal
        data={CLUBS}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.clubList}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.clubButton, club === item && styles.clubButtonActive]}
            onPress={() => setClub(item)}
            accessibilityLabel={`Club ${item}`}
          >
            <Text style={styles.clubText}>{item}</Text>
          </TouchableOpacity>
        )}
      />

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={styles.input}
        placeholder="Optional note"
        value={note}
        onChangeText={setNote}
      />

      <View style={styles.scoreCard}>
        <View style={styles.scoreHeader}>
          <Text style={styles.label}>Hole scoring</Text>
          {(scoresLoading || scoreSaving) && <ActivityIndicator size="small" />}
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Par</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustNumeric('par', -1, 3)}
              accessibilityLabel="Decrease par"
            >
              <Text style={styles.stepperText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{currentScore.par ?? '-'}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustNumeric('par', 1, 3)}
              accessibilityLabel="Increase par"
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Strokes</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustNumeric('strokes', -1, 0)}
              accessibilityLabel="Decrease strokes"
            >
              <Text style={styles.stepperText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{currentScore.strokes ?? '-'}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustNumeric('strokes', 1, 0)}
              accessibilityLabel="Increase strokes"
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Putts</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustNumeric('putts', -1, 0)}
              accessibilityLabel="Decrease putts"
            >
              <Text style={styles.stepperText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{currentScore.putts ?? '-'}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustNumeric('putts', 1, 0)}
              accessibilityLabel="Increase putts"
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Penalties</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustNumeric('penalties', -1, 0)}
              accessibilityLabel="Decrease penalties"
            >
              <Text style={styles.stepperText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{currentScore.penalties ?? '-'}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustNumeric('penalties', 1, 0)}
              accessibilityLabel="Increase penalties"
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.toggleRow}>
          {fairwayApplicable ? (
            <TouchableOpacity
              style={[styles.toggleButton, currentScore.fairwayHit ? styles.toggleActive : null]}
              onPress={() => toggleFlag('fairwayHit')}
              accessibilityLabel="Toggle fairway hit"
              testID="toggle-fairway"
            >
              <Text style={styles.toggleText}>Fairway {currentScore.fairwayHit ? '✓' : '—'}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.toggleButton, currentScore.gir ? styles.toggleActive : null]}
            onPress={() => toggleFlag('gir')}
            accessibilityLabel="Toggle GIR"
            testID="toggle-gir"
          >
            <Text style={styles.toggleText}>GIR {currentScore.gir ? '✓' : '—'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.secondaryButton, styles.saveScoreButton, scoreSaving && styles.disabledButton]}
          onPress={handleSaveScore}
          disabled={scoreSaving}
          accessibilityLabel="Save scoring"
          testID="save-score"
        >
          <Text style={styles.secondaryButtonText}>{scoreSaving ? 'Saving…' : 'Save scoring'}</Text>
          {scoreDirty && !scoreSaving ? (
            <Text style={styles.unsavedText}>Unsaved changes</Text>
          ) : null}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, logInFlight && styles.disabledButton]}
        disabled={logInFlight}
        onPress={handleLogShot}
        accessibilityLabel="Log shot"
        testID="log-shot"
      >
        <Text style={styles.primaryButtonText}>{logInFlight ? 'Logging…' : 'Log shot'}</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleNextHole} accessibilityLabel="Next hole">
          <Text style={styles.secondaryButtonText}>Next hole</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleEndRound} accessibilityLabel="End round">
          <Text style={styles.secondaryButtonText}>End round</Text>
        </TouchableOpacity>
      </View>

      {shots.length > 0 && (
        <View style={styles.shotList}>
          <Text style={styles.label}>Shots this round</Text>
          {shots.map((s) => (
            <Text key={s.id} style={styles.shotItem}>
              Hole {s.holeNumber} · {s.club} · {new Date(s.createdAt).toLocaleTimeString()}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: '#6b7280',
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: 12,
  },
  label: {
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  clubList: {
    gap: 8,
    paddingVertical: 8,
  },
  clubButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    marginRight: 8,
  },
  clubButtonActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  clubText: {
    color: '#111827',
    fontWeight: '600',
  },
  scoreCard: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    gap: 8,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreLabel: {
    fontWeight: '600',
    color: '#111827',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontWeight: '700',
    color: '#111827',
    fontSize: 16,
  },
  stepperValue: {
    minWidth: 28,
    textAlign: 'center',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  toggleActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  toggleText: {
    fontWeight: '600',
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
  shotList: {
    marginTop: 16,
  },
  shotItem: {
    paddingVertical: 4,
  },
  saveScoreButton: {
    alignItems: 'flex-start',
    gap: 2,
  },
  unsavedText: {
    color: '#b45309',
  },
});
