import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { allocateStrokes, courseHandicap, playingHandicap } from '../../../../shared/whs/calc';
import type { HandicapSetup, TeeRating } from '../../../../shared/whs/types';
import {
  getActiveRound,
  setHandicapSetup as persistHandicapSetup,
  subscribe as subscribeToRound,
} from '../../../../shared/round/round_store';
import type { Round } from '../../../../shared/round/round_types';
import { getEventContext, setEventContext } from '../../../../shared/events/state';

const NINE_OPTIONS: Array<{ label: string; value: HandicapSetup['tee']['nine'] }> = [
  { label: '18 holes', value: '18' },
  { label: 'Front 9', value: 'front' },
  { label: 'Back 9', value: 'back' },
];

type HandicapDraft = {
  handicapIndex: string;
  allowancePct: string;
  teeId: string;
  teeName: string;
  slope: string;
  rating: string;
  par: string;
  nine: '' | 'front' | 'back' | '18';
  strokeIndexText: string;
};

type Props = {
  onClose?: () => void;
};

function makeDefaultStrokeIndex(length: number): number[] {
  const safeLength = Math.max(1, Math.min(18, Math.floor(length) || 18));
  return Array.from({ length: safeLength }, (_, idx) => idx + 1);
}

function parseStrokeIndex(input: string): number[] {
  if (!input.trim()) {
    return [];
  }
  const values = input
    .split(/[^0-9]+/)
    .map((chunk) => Number.parseInt(chunk, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.map((value) => Math.floor(value));
}

function formatStrokeIndex(values: number[]): string {
  return values.join(', ');
}

function buildDraftFromSetup(setup: HandicapSetup | undefined, round: Round | null): HandicapDraft {
  const holeCount = round?.holes?.length ?? setup?.tee.strokeIndex?.length ?? 18;
  const strokeIndex = setup?.tee.strokeIndex?.length
    ? setup.tee.strokeIndex
    : makeDefaultStrokeIndex(holeCount);
  return {
    handicapIndex: setup ? setup.handicapIndex.toFixed(1) : '0.0',
    allowancePct: setup ? setup.allowancePct.toFixed(0) : '95',
    teeId: setup?.tee.id ?? 'tee',
    teeName: setup?.tee.name ?? 'Default Tee',
    slope: setup ? String(setup.tee.slope) : '113',
    rating: setup ? String(setup.tee.rating) : '72.0',
    par: setup ? String(setup.tee.par) : String(round?.holes?.reduce((sum, hole) => sum + hole.par, 0) ?? 72),
    nine: setup?.tee.nine ?? '',
    strokeIndexText: formatStrokeIndex(strokeIndex),
  };
}

function normalizeTee(draft: HandicapDraft, strokeIndex: number[], holeCount: number): TeeRating | null {
  const slope = Number.parseFloat(draft.slope);
  const rating = Number.parseFloat(draft.rating);
  const par = Number.parseFloat(draft.par);
  if (!Number.isFinite(slope) || !Number.isFinite(rating) || !Number.isFinite(par)) {
    return null;
  }
  const tee: TeeRating = {
    id: draft.teeId.trim() || `tee-${holeCount}`,
    name: draft.teeName.trim() || 'Tee',
    slope,
    rating,
    par,
    strokeIndex,
  };
  if (draft.nine === 'front' || draft.nine === 'back' || draft.nine === '18') {
    tee.nine = draft.nine;
  }
  return tee;
}

const HandicapPanel: React.FC<Props> = ({ onClose }) => {
  const [round, setRound] = useState<Round | null>(getActiveRound());
  const [draft, setDraft] = useState<HandicapDraft>(() => buildDraftFromSetup(round?.handicapSetup, round));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRound(getActiveRound());
    const unsubscribe = subscribeToRound((next) => {
      setRound(next);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!round) {
      if (!dirty) {
        setDraft(buildDraftFromSetup(undefined, null));
      }
      return;
    }
    if (dirty && round.handicapSetup) {
      return;
    }
    setDraft(buildDraftFromSetup(round.handicapSetup, round));
    setDirty(false);
  }, [round, dirty]);

  const holeCount = round?.holes?.length ?? 18;

  const resolvedStrokeIndex = useMemo(() => {
    const parsed = parseStrokeIndex(draft.strokeIndexText);
    if (parsed.length === holeCount) {
      return parsed;
    }
    if (parsed.length === 9 && holeCount === 9) {
      return parsed;
    }
    return makeDefaultStrokeIndex(holeCount);
  }, [draft.strokeIndexText, holeCount]);

  const computed = useMemo(() => {
    const hi = Number.parseFloat(draft.handicapIndex);
    const allowance = Number.parseFloat(draft.allowancePct);
    if (!Number.isFinite(hi) || !Number.isFinite(allowance)) {
      return {
        courseHandicap: 0,
        playingHandicap: 0,
        strokes: makeDefaultStrokeIndex(holeCount).map(() => 0),
      };
    }
    const tee = normalizeTee(draft, resolvedStrokeIndex, holeCount);
    if (!tee) {
      return {
        courseHandicap: 0,
        playingHandicap: 0,
        strokes: makeDefaultStrokeIndex(holeCount).map(() => 0),
      };
    }
    const course = courseHandicap(hi, tee);
    const playing = playingHandicap(course, allowance);
    const strokes = allocateStrokes(playing, tee.strokeIndex ?? makeDefaultStrokeIndex(holeCount));
    return { courseHandicap: course, playingHandicap: playing, strokes };
  }, [draft, holeCount, resolvedStrokeIndex]);

  const handleDraftChange = useCallback(<K extends keyof HandicapDraft>(key: K, value: HandicapDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setStatus(null);
    setError(null);
  }, []);

  const buildSetup = useCallback((): HandicapSetup | null => {
    const hi = Number.parseFloat(draft.handicapIndex);
    const allowance = Number.parseFloat(draft.allowancePct);
    if (!Number.isFinite(hi) || !Number.isFinite(allowance)) {
      setError('Enter valid Handicap Index and allowance.');
      return null;
    }
    const tee = normalizeTee(draft, resolvedStrokeIndex, holeCount);
    if (!tee) {
      setError('Enter valid tee slope, rating, and par.');
      return null;
    }
    return {
      handicapIndex: hi,
      allowancePct: allowance,
      tee: {
        ...tee,
        strokeIndex: tee.strokeIndex ?? makeDefaultStrokeIndex(holeCount),
      },
    };
  }, [draft, holeCount, resolvedStrokeIndex]);

  const handleSave = useCallback(() => {
    const setup = buildSetup();
    if (!setup) {
      return;
    }
    persistHandicapSetup(setup);
    setStatus('Saved to round.');
    setDirty(false);
  }, [buildSetup]);

  const handleApplyToEvent = useCallback(() => {
    const setup = buildSetup();
    if (!setup) {
      return;
    }
    const context = getEventContext();
    if (!context || !context.event) {
      setError('No active event to update.');
      return;
    }
    setEventContext({
      event: context.event,
      participant: context.participant ?? null,
      handicap: {
        setup,
        courseHandicap: computed.courseHandicap,
        playingHandicap: computed.playingHandicap,
        strokesPerHole: computed.strokes,
      },
    });
    setStatus('Applied to event context.');
  }, [buildSetup, computed]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Handicap &amp; Tee</Text>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Handicap Index</Text>
          <TextInput
            keyboardType="decimal-pad"
            value={draft.handicapIndex}
            onChangeText={(value) => handleDraftChange('handicapIndex', value)}
            placeholder="Handicap Index"
            style={styles.input}
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Allowance (%)</Text>
          <TextInput
            keyboardType="number-pad"
            value={draft.allowancePct}
            onChangeText={(value) => handleDraftChange('allowancePct', value)}
            placeholder="Allowance percentage"
            style={styles.input}
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tee information</Text>
          <TextInput
            value={draft.teeName}
            onChangeText={(value) => handleDraftChange('teeName', value)}
            placeholder="Tee name"
            style={styles.input}
          />
          <TextInput
            value={draft.teeId}
            onChangeText={(value) => handleDraftChange('teeId', value)}
            placeholder="Tee identifier"
            style={styles.input}
          />
          <View style={styles.inlineInputs}>
            <View style={styles.inlineField}>
              <Text style={styles.label}>Slope</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={draft.slope}
                onChangeText={(value) => handleDraftChange('slope', value)}
                style={styles.input}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.label}>Course Rating</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={draft.rating}
                onChangeText={(value) => handleDraftChange('rating', value)}
                style={styles.input}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.label}>Par</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={draft.par}
                onChangeText={(value) => handleDraftChange('par', value)}
                style={styles.input}
              />
            </View>
          </View>
          <View style={styles.nineSelector}>
            {NINE_OPTIONS.map((option) => {
              const selected = draft.nine === option.value || (!draft.nine && option.value === '18');
              return (
                <TouchableOpacity
                  key={option.value ?? 'full'}
                  onPress={() => handleDraftChange('nine', option.value ?? '')}
                  style={[styles.nineButton, selected ? styles.nineButtonActive : null]}
                >
                  <Text style={styles.nineButtonText}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stroke Index (comma-separated)</Text>
          <TextInput
            multiline
            value={draft.strokeIndexText}
            onChangeText={(value) => handleDraftChange('strokeIndexText', value)}
            placeholder="1, 7, 13, ..."
            style={[styles.input, styles.strokeIndexInput]}
          />
          <Text style={styles.helper}>Expected {holeCount} values. Defaults to sequential if mismatched.</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Computed Handicap</Text>
          <Text style={styles.metricText}>Course Handicap: {computed.courseHandicap}</Text>
          <Text style={styles.metricText}>Playing Handicap: {computed.playingHandicap}</Text>
          <View style={styles.strokesGrid}>
            {computed.strokes.map((value, index) => {
              const display = value > 0 ? `+${value}` : value === 0 ? '—' : `${value}`;
              return (
                <View key={`hole-${index}`} style={styles.strokeCell}>
                  <Text style={styles.strokeHole}>H{index + 1}</Text>
                  <Text style={styles.strokeValue}>{display}</Text>
                </View>
              );
            })}
          </View>
        </View>
        {status ? <Text style={styles.statusText}>{status}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={handleSave} style={[styles.button, styles.primaryButton]}>
            <Text style={styles.primaryButtonText}>Save to round</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleApplyToEvent} style={[styles.button, styles.secondaryButton]}>
            <Text style={styles.buttonText}>Apply to event</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

export default HandicapPanel;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1e293b',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  section: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e2e8f0',
  },
  inlineInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineField: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
  },
  nineSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  nineButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1e293b',
  },
  nineButtonActive: {
    backgroundColor: '#2563eb',
  },
  nineButtonText: {
    color: '#e2e8f0',
    fontSize: 12,
  },
  strokeIndexInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helper: {
    color: '#64748b',
    fontSize: 12,
  },
  metricText: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  strokesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  strokeCell: {
    width: '23%',
    minWidth: 64,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1f2937',
    alignItems: 'center',
  },
  strokeHole: {
    color: '#94a3b8',
    fontSize: 12,
  },
  strokeValue: {
    color: '#f8fafc',
    fontWeight: '600',
    marginTop: 4,
  },
  statusText: {
    color: '#22c55e',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    color: '#f97316',
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
  },
  secondaryButton: {
    backgroundColor: '#1e293b',
  },
  primaryButtonText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  buttonText: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
});
