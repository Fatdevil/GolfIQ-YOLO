import React, { useMemo } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';

import { useFollowLoop } from '../follow/useFollowLoop';
import type { HoleRef } from '../../../../shared/follow/types';

function resolveTelemetryEmitter(): ((event: string, payload: Record<string, unknown>) => void) | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const holder = globalThis as { __ARHUD_QA_TELEMETRY__?: unknown };
  const candidate = holder.__ARHUD_QA_TELEMETRY__;
  return typeof candidate === 'function' ? (candidate as (event: string, payload: Record<string, unknown>) => void) : null;
}

const EMPTY_HOLES: HoleRef[] = [];

function formatMeters(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN)) {
    return '--';
  }
  return `${Math.round(value!)} m`;
}

export default function FollowScreen(): JSX.Element {
  const holes = useMemo(() => EMPTY_HOLES, []);
  const telemetryEmitter = useMemo(() => resolveTelemetryEmitter(), []);
  const { followState, snapshot, gpsWeak, watchAutoSend, setWatchAutoSend, setAutoAdvance, manualNext, manualPrev, recenter } =
    useFollowLoop({
      roundId: 'local-round',
      holes,
      tournamentSafe: true,
      playsLikePct: null,
      watchAutoSend: true,
      telemetryEmitter,
    });

  const autoAdvanceLabel = followState?.autoAdvanceEnabled ? 'On' : 'Off';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.holeLabel}>HOLE {snapshot?.holeNo ?? '--'}</Text>
        <Text style={styles.subLabel}>Auto-advance: {autoAdvanceLabel}</Text>
      </View>
      {gpsWeak ? <Text style={styles.gpsWarning}>Waiting for GPS…</Text> : null}
      {holes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Download course to enable Follow.</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.distancesRow}>
            <View style={styles.sideDistance}>
              <Text style={styles.sideLabel}>FRONT</Text>
              <Text style={styles.sideValue}>{formatMeters(snapshot?.fmb.front)}</Text>
            </View>
            <View style={styles.middleDistance}>
              <Text style={styles.middleValue}>{formatMeters(snapshot?.fmb.middle)}</Text>
              <Text style={styles.middleLabel}>MIDDLE</Text>
            </View>
            <View style={styles.sideDistance}>
              <Text style={styles.sideLabel}>BACK</Text>
              <Text style={styles.sideValue}>{formatMeters(snapshot?.fmb.back)}</Text>
            </View>
          </View>
          <View style={styles.headingSection}>
            <View style={[styles.headingArrow, { transform: [{ rotate: `${snapshot?.headingDeg ?? 0}deg` }] }]} />
            <Text style={styles.headingText}>{Math.round(snapshot?.headingDeg ?? 0)}°</Text>
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={() => void manualPrev()} style={styles.button}>
              <Text style={styles.buttonText}>Prev</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={recenter} style={styles.button}>
              <Text style={styles.buttonText}>Re-center</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void manualNext()} style={styles.button}>
              <Text style={styles.buttonText}>Next</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Auto-Advance</Text>
            <Switch value={Boolean(followState?.autoAdvanceEnabled)} onValueChange={(value) => void setAutoAdvance(value)} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Watch Auto-Send</Text>
            <Switch value={watchAutoSend} onValueChange={setWatchAutoSend} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  header: { marginBottom: 16 },
  holeLabel: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  subLabel: { color: '#bbb', marginTop: 4 },
  gpsWarning: { color: '#f5d742', marginBottom: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#fff', fontSize: 16, textAlign: 'center' },
  content: { gap: 20 },
  distancesRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sideDistance: { alignItems: 'center', flex: 1 },
  middleDistance: { alignItems: 'center', flex: 1.4 },
  sideLabel: { color: '#bbb', fontSize: 12, letterSpacing: 1 },
  sideValue: { color: '#fff', fontSize: 22, fontWeight: '600' },
  middleValue: { color: '#fff', fontSize: 48, fontWeight: '700' },
  middleLabel: { color: '#bbb', letterSpacing: 1, marginTop: 4 },
  headingSection: { alignItems: 'center', gap: 8 },
  headingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#4da3ff',
  },
  headingText: { color: '#4da3ff', fontSize: 16, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  button: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: '#1f1f1f',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#151515',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  toggleLabel: { color: '#fff', fontSize: 16 },
});
