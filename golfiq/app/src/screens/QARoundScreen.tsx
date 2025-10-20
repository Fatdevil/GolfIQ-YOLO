import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AutoCourseController, type AutoCourseCandidate } from '../../../../shared/arhud/auto_course';
import { type BundleIndexEntry, getIndex } from '../../../../shared/arhud/bundle_client';
import { getLocation, LocationError } from '../../../../shared/arhud/location';
import { qaHudEnabled } from '../../../../shared/arhud/native/qa_gate';
import { toLocalENU } from '../../../../shared/arhud/geo';
import type { Round, Shot } from '../../../../shared/round/round_types';
import {
  ROUND_FILE_NAME,
  clearRound,
  createRound,
  finishRound,
  getActiveRound,
  loadRound,
  nextHole,
  prevHole,
  serializeRound,
  setScore,
  setTee,
  subscribe,
} from '../../../../shared/round/round_store';
import QAArHudOverlayScreen from './QAArHudOverlayScreen';
import { isQAMode } from '../../qa/QAGate';

const DEFAULT_PAR_SEQUENCE = [
  4,
  4,
  3,
  4,
  4,
  5,
  3,
  4,
  4,
  4,
  5,
  4,
  3,
  4,
  5,
  4,
  3,
  4,
];

type TeeOption = {
  id: string;
  label: string;
  parMap: Record<number, number>;
};

type HoleSummary = {
  holeNo: number;
  par: number;
  strokes: number;
  score: number;
  fir: boolean | null;
  gir: boolean | null;
};

type RoundSummary = {
  totalPar: number;
  totalScore: number;
  relative: number;
  firHit: number;
  firEligible: number;
  girHit: number;
  girEligible: number;
  perHole: HoleSummary[];
};

const TEE_OPTIONS: TeeOption[] = createTeeOptions();

function createTeeOptions(): TeeOption[] {
  const makeMap = (sequence: number[]): Record<number, number> => {
    const map: Record<number, number> = {};
    sequence.forEach((par, index) => {
      map[index + 1] = Math.max(3, Math.min(6, Math.floor(par)));
    });
    return map;
  };
  const base = makeMap(DEFAULT_PAR_SEQUENCE);
  const long = makeMap(DEFAULT_PAR_SEQUENCE.map((par) => (par >= 4 ? par + 1 : par)));
  const short = makeMap(DEFAULT_PAR_SEQUENCE.map((par) => (par >= 4 ? par - 1 : par)));
  return [
    { id: 'white', label: 'White', parMap: base },
    { id: 'blue', label: 'Blue', parMap: long },
    { id: 'red', label: 'Red', parMap: short },
  ];
}

function roundModeEnabled(): boolean {
  if (qaHudEnabled()) {
    return true;
  }
  if (isQAMode()) {
    return true;
  }
  const env =
    (globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env ?? {};
  return env.QA_ROUND === '1';
}

function landingDistanceMeters(shot: Shot): number | null {
  if (!shot.land) {
    return null;
  }
  const delta = toLocalENU(shot.pin, shot.land);
  return Math.hypot(delta.x, delta.y);
}

function isFairwayHeuristic(shot: Shot): boolean {
  const club = shot.club?.toUpperCase?.() ?? '';
  const baseline = Number.isFinite(shot.carry_m)
    ? Number(shot.carry_m)
    : Number.isFinite(shot.playsLike_m)
      ? Number(shot.playsLike_m)
      : Number(shot.base_m);
  if (!Number.isFinite(baseline) || baseline <= 0) {
    return false;
  }
  const minCarry = club.includes('D') || club.includes('W') ? 160 : 130;
  const maxCarry = 320;
  return baseline >= minCarry && baseline <= maxCarry;
}

function strokesToGreen(shots: Shot[]): number | null {
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index];
    const distance = landingDistanceMeters(shot);
    if (distance !== null && distance <= 12) {
      return index + 1;
    }
  }
  return null;
}

function summarizeRound(round: Round): RoundSummary {
  let totalPar = 0;
  let totalScore = 0;
  let firHit = 0;
  let firEligible = 0;
  let girHit = 0;
  let girEligible = 0;
  const perHole: HoleSummary[] = round.holes.map((hole) => {
    totalPar += hole.par;
    const strokes = hole.shots.length;
    const score = hole.score ?? strokes;
    totalScore += score;
    let fir: boolean | null = null;
    if (hole.par > 3 && hole.shots.length) {
      firEligible += 1;
      fir = isFairwayHeuristic(hole.shots[0]);
      if (fir) {
        firHit += 1;
      }
    }
    const regulation = Math.max(1, hole.par - 2);
    const reached = strokesToGreen(hole.shots);
    let gir: boolean | null = null;
    if (reached !== null) {
      girEligible += 1;
      gir = reached <= regulation;
      if (gir) {
        girHit += 1;
      }
    }
    return {
      holeNo: hole.holeNo,
      par: hole.par,
      strokes,
      score,
      fir,
      gir,
    };
  });
  return {
    totalPar,
    totalScore,
    relative: totalScore - totalPar,
    firHit,
    firEligible,
    girHit,
    girEligible,
    perHole,
  };
}

const QARoundScreen: React.FC = () => {
  const qaAllowed = useMemo(() => roundModeEnabled(), []);
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState<Round | null>(null);
  const [courses, setCourses] = useState<BundleIndexEntry[]>([]);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [autoCandidate, setAutoCandidate] = useState<AutoCourseCandidate | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedTeeId, setSelectedTeeId] = useState<string>(TEE_OPTIONS[0]?.id ?? 'white');
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [scoreDraft, setScoreDraft] = useState('');
  const autoCourseRef = useRef<AutoCourseController | null>(null);

  if (!autoCourseRef.current) {
    autoCourseRef.current = new AutoCourseController();
  }

  useEffect(() => {
    if (!qaAllowed) {
      setLoading(false);
      return;
    }
    let mounted = true;
    loadRound()
      .then((stored) => {
        if (mounted) {
          setRound(stored);
          if (stored?.courseId) {
            setSelectedCourseId(stored.courseId);
          }
          if (stored?.tee) {
            const match = TEE_OPTIONS.find(
              (option) => option.id === stored.tee || option.label === stored.tee,
            );
            if (match) {
              setSelectedTeeId(match.id);
            }
          }
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    const unsubscribe = subscribe((value) => {
      if (mounted) {
        setRound(value);
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [qaAllowed]);

  useEffect(() => {
    if (!qaAllowed) {
      return;
    }
    let mounted = true;
    setCoursesLoading(true);
    (async () => {
      try {
        const index = await getIndex();
        if (!mounted) {
          return;
        }
        setCourses(index);
        if (!selectedCourseId && index.length) {
          setSelectedCourseId(index[0].courseId);
        }
        try {
          const fix = await getLocation();
          if (!mounted) {
            return;
          }
          const decision = autoCourseRef.current?.consider(index, fix, getActiveRound()?.courseId ?? null);
          if (decision?.candidate) {
            setAutoCandidate(decision.candidate);
            setSelectedCourseId((prev) => prev ?? decision.candidate!.courseId);
          }
        } catch (error) {
          if (!(error instanceof LocationError)) {
            setCourseError('Failed to acquire location');
          }
        }
      } catch (error) {
        if (mounted) {
          setCourseError('Unable to load course index');
        }
      } finally {
        if (mounted) {
          setCoursesLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [qaAllowed, selectedCourseId]);

  const currentHole = useMemo(() => {
    if (!round || !round.holes.length) {
      return null;
    }
    const index = Math.min(Math.max(round.currentHole, 0), round.holes.length - 1);
    return round.holes[index];
  }, [round]);

  useEffect(() => {
    if (!currentHole) {
      setScoreDraft('');
      return;
    }
    if (currentHole.score && Number.isFinite(currentHole.score)) {
      setScoreDraft(String(currentHole.score));
    } else {
      setScoreDraft('');
    }
  }, [currentHole?.holeNo, currentHole?.score]);

  const handleStartRound = useCallback(() => {
    const courseId = selectedCourseId ?? autoCandidate?.courseId ?? 'qa-course';
    const tee = TEE_OPTIONS.find((option) => option.id === selectedTeeId) ?? TEE_OPTIONS[0];
    const holes = Object.keys(tee.parMap)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    const next = createRound(courseId, holes, tee.parMap, tee.label);
    setRound(next);
    setScoreDraft('');
  }, [autoCandidate?.courseId, selectedCourseId, selectedTeeId]);

  const handleAddStroke = useCallback(() => {
    if (!currentHole) {
      return;
    }
    const next = (currentHole.score ?? currentHole.shots.length) + 1;
    setScore(currentHole.holeNo, next);
    setScoreDraft(String(next));
  }, [currentHole]);

  const handleSetScore = useCallback(() => {
    if (!currentHole) {
      return;
    }
    const numeric = Number.parseInt(scoreDraft, 10);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      Alert.alert('Invalid score', 'Enter a positive number.');
      return;
    }
    setScore(currentHole.holeNo, numeric);
  }, [currentHole, scoreDraft]);

  const handlePrevHole = useCallback(() => {
    prevHole();
  }, []);

  const handleNextHole = useCallback(() => {
    if (!round) {
      return;
    }
    if (round.currentHole >= round.holes.length - 1) {
      finishRound();
      Alert.alert('Round finished', 'Round marked as complete.');
      return;
    }
    nextHole();
  }, [round]);

  const summary = useMemo(() => {
    if (!round || !round.finished) {
      return null;
    }
    return summarizeRound(round);
  }, [round]);

  const handleExport = useCallback(async () => {
    if (!round) {
      return;
    }
    try {
      const payload = serializeRound(round);
      const FileSystem = (await import('expo-file-system')) as {
        documentDirectory?: string | null;
        writeAsStringAsync?: (path: string, contents: string) => Promise<void>;
      };
      if (!FileSystem.documentDirectory || !FileSystem.writeAsStringAsync) {
        throw new Error('File system unavailable');
      }
      const base = FileSystem.documentDirectory.replace(/\/+$/, '');
      const path = `${base}/${ROUND_FILE_NAME}`;
      await FileSystem.writeAsStringAsync(path, payload);
      Alert.alert('Export complete', `Saved to ${path}`);
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : String(error));
    }
  }, [round]);

  if (!qaAllowed) {
    return (
      <View style={styles.unavailableContainer}>
        <Text style={styles.unavailableText}>Round mode is QA-only. Enable QA_ROUND=1 to use it.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#34d399" size="large" />
      </View>
    );
  }

  if (!round) {
    return (
      <ScrollView contentContainerStyle={styles.startContainer}>
        <Text style={styles.title}>QA Round Mode</Text>
        <Text style={styles.subtitle}>Auto-pick the nearest course or choose manually.</Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Select course</Text>
          {coursesLoading ? <ActivityIndicator size="small" color="#60a5fa" /> : null}
          {courseError ? <Text style={styles.errorText}>{courseError}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.courseList}>
            {courses.map((course) => {
              const selected = course.courseId === selectedCourseId;
              return (
                <TouchableOpacity
                  key={course.courseId}
                  onPress={() => setSelectedCourseId(course.courseId)}
                  style={[styles.courseButton, selected ? styles.courseButtonActive : null]}
                >
                  <Text style={styles.courseButtonText}>{course.name ?? course.courseId}</Text>
                </TouchableOpacity>
              );
            })}
            {!courses.length && !coursesLoading ? (
              <Text style={styles.placeholderText}>No bundles yet</Text>
            ) : null}
          </ScrollView>
          {autoCandidate ? (
            <Text style={styles.helperText}>
              Auto-course suggests {autoCandidate.name ?? autoCandidate.courseId}
            </Text>
          ) : null}
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Choose tee</Text>
          <View style={styles.teeRow}>
            {TEE_OPTIONS.map((tee) => {
              const selected = tee.id === selectedTeeId;
              return (
                <TouchableOpacity
                  key={tee.id}
                  onPress={() => {
                    setSelectedTeeId(tee.id);
                    setTee(tee.label);
                  }}
                  style={[styles.teeButton, selected ? styles.teeButtonActive : null]}
                >
                  <Text style={styles.teeButtonText}>{tee.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <TouchableOpacity onPress={handleStartRound} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Start round</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (round.finished && summary) {
    const firPercent = summary.firEligible
      ? Math.round((summary.firHit / summary.firEligible) * 100)
      : null;
    const girPercent = summary.girEligible
      ? Math.round((summary.girHit / summary.girEligible) * 100)
      : null;
    const relativeText = summary.relative === 0 ? 'E' : summary.relative > 0 ? `+${summary.relative}` : `${summary.relative}`;
    return (
      <ScrollView contentContainerStyle={styles.summaryContainer}>
        <Text style={styles.title}>Round summary</Text>
        <View style={styles.card}>
          <Text style={styles.summaryLine}>
            Total: {summary.totalScore} (par {summary.totalPar}) · {relativeText}
          </Text>
          <Text style={styles.summaryLine}>
            FIR: {summary.firHit}/{summary.firEligible}{' '}
            {firPercent !== null ? `(${firPercent}%)` : ''}
          </Text>
          <Text style={styles.summaryLine}>
            GIR: {summary.girHit}/{summary.girEligible}{' '}
            {girPercent !== null ? `(${girPercent}%)` : ''}
          </Text>
          <TouchableOpacity onPress={handleExport} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Export {ROUND_FILE_NAME}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              clearRound();
            }}
            style={[styles.secondaryButton, styles.secondaryButtonOutline]}
          >
            <Text style={styles.secondaryButtonText}>Start another round</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Per-hole breakdown</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableCellHole]}>Hole</Text>
            <Text style={styles.tableCell}>Par</Text>
            <Text style={styles.tableCell}>Score</Text>
            <Text style={styles.tableCell}>FIR</Text>
            <Text style={styles.tableCell}>GIR</Text>
          </View>
          {summary.perHole.map((hole) => (
            <View key={hole.holeNo} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.tableCellHole]}>{hole.holeNo}</Text>
              <Text style={styles.tableCell}>{hole.par}</Text>
              <Text style={styles.tableCell}>{hole.score}</Text>
              <Text style={styles.tableCell}>{hole.fir === null ? '—' : hole.fir ? '✔︎' : '×'}</Text>
              <Text style={styles.tableCell}>{hole.gir === null ? '—' : hole.gir ? '✔︎' : '×'}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.roundContainer}>
        <Text style={styles.title}>Active round</Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Course</Text>
          <Text style={styles.infoText}>{round.courseId}</Text>
          <Text style={styles.infoText}>Tee: {round.tee ?? 'n/a'}</Text>
        </View>
        {currentHole ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Hole {currentHole.holeNo}</Text>
            <Text style={styles.infoText}>Par {currentHole.par}</Text>
            <Text style={styles.infoText}>
              Score: {currentHole.score ?? currentHole.shots.length}
            </Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={() => setOverlayVisible(true)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Open HUD overlay</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddStroke} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>+ Stroke</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.scoreInputRow}>
              <TextInput
                keyboardType="number-pad"
                placeholder="Set score"
                value={scoreDraft}
                onChangeText={setScoreDraft}
                style={styles.scoreInput}
              />
              <TouchableOpacity onPress={handleSetScore} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Set score</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={handlePrevHole}
                style={[styles.secondaryButton, round.currentHole === 0 ? styles.secondaryButtonDisabled : null]}
                disabled={round.currentHole === 0}
              >
                <Text style={styles.secondaryButtonText}>Previous</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNextHole} style={styles.primaryButtonSmall}>
                <Text style={styles.primaryButtonText}>
                  {round.currentHole >= round.holes.length - 1 ? 'Finish round' : 'Next hole'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.shotList}>
              <Text style={styles.sectionTitle}>Shots</Text>
              {!currentHole.shots.length ? (
                <Text style={styles.placeholderText}>No shots recorded yet.</Text>
              ) : (
                currentHole.shots.map((shot, index) => (
                  <View key={`${shot.tStart}-${index}`} style={styles.shotRow}>
                    <Text style={styles.shotTitle}>Shot {index + 1}</Text>
                    <Text style={styles.shotDetail}>Club: {shot.club}</Text>
                    <Text style={styles.shotDetail}>
                      Plays-like: {Number.isFinite(shot.playsLike_m) ? shot.playsLike_m.toFixed(1) : '—'} m
                    </Text>
                    <Text style={styles.shotDetail}>
                      Carry: {Number.isFinite(shot.carry_m) ? shot.carry_m!.toFixed(1) : '—'} m
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
      <Modal animationType="slide" visible={overlayVisible} onRequestClose={() => setOverlayVisible(false)}>
        <SafeAreaView style={styles.overlayContainer}>
          <TouchableOpacity onPress={() => setOverlayVisible(false)} style={styles.overlayCloseButton}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </TouchableOpacity>
          <QAArHudOverlayScreen />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  unavailableContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  unavailableText: {
    color: '#94a3b8',
    textAlign: 'center',
  },
  startContainer: {
    padding: 16,
    gap: 16,
  },
  roundContainer: {
    padding: 16,
    gap: 16,
  },
  summaryContainer: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    color: '#cbd5f5',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  errorText: {
    color: '#fca5a5',
  },
  helperText: {
    color: '#93c5fd',
    fontSize: 12,
  },
  courseList: {
    flexGrow: 0,
  },
  courseButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    marginRight: 8,
  },
  courseButtonActive: {
    backgroundColor: '#2563eb',
  },
  courseButtonText: {
    color: '#e2e8f0',
    fontWeight: '500',
  },
  teeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  teeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1e293b',
  },
  teeButtonActive: {
    backgroundColor: '#f97316',
  },
  teeButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#22c55e',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonSmall: {
    borderRadius: 10,
    backgroundColor: '#22c55e',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#052e16',
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 10,
    backgroundColor: '#1f2937',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonOutline: {
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: 'transparent',
  },
  secondaryButtonDisabled: {
    opacity: 0.4,
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  infoText: {
    color: '#cbd5f5',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  scoreInputRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  scoreInput: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f8fafc',
    backgroundColor: '#0f172a',
  },
  shotList: {
    gap: 8,
  },
  shotRow: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 4,
  },
  shotTitle: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  shotDetail: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  placeholderText: {
    color: '#64748b',
  },
  summaryLine: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#1f2937',
    paddingBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#1f2937',
  },
  tableCell: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 12,
  },
  tableCellHole: {
    flex: 1.2,
  },
  overlayContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlayCloseButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});

export default QARoundScreen;
