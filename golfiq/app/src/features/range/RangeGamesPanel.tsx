import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import ViewShot, { captureRef } from 'react-native-view-shot';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { Buffer } from 'buffer';

import { buildTargets } from '../../../../../shared/games/range/targets';
import { makeHeatmap } from '../../../../../shared/games/range/heatmap';
import type {
  GameState,
  Heatmap,
  LocalPoint,
  RingTarget,
} from '../../../../../shared/games/range/types';
import { RangeGameController } from './RangeGameController';

type RangeGamesPanelProps = {
  visible: boolean;
  onClose(): void;
};

type ClubSummary = {
  club: string;
  shots: number;
  hits: number;
  score: number;
};

type PreviewMetrics = {
  width: number;
  height: number;
  scale: number;
  minY: number;
  maxY: number;
  padX: number;
  padY: number;
};

type HeatColor = {
  bin: { x: number; y: number; n: number };
  fill: string;
};

const DEFAULT_CARRIES = [80, 110, 140, 170, 200];

const PRESETS: { label: string; carries: number[] }[] = [
  { label: 'Short game', carries: [60, 75, 90, 105, 120] },
  { label: 'Mid irons', carries: [80, 110, 140, 170, 200] },
  { label: 'Long mix', carries: [90, 120, 150, 180, 210, 230] },
  { label: 'Full bag', carries: [70, 95, 120, 145, 170, 195, 220] },
];

const MIN_TARGETS = 5;
const MAX_TARGETS = 8;
const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT_MIN = 180;
const HEAT_CELL_PX = 32;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseCarries(inputs: string[]): number[] {
  return inputs
    .map((entry) => Number(entry))
    .filter((value) => Number.isFinite(value) && value > 0) as number[];
}

function adjustTargets(targets: RingTarget[], scale: number): RingTarget[] {
  return targets.map((target) => ({
    ...target,
    radius_m: clamp(Math.round(target.radius_m * scale), 2, 20),
  }));
}

function computePreviewMetrics(targets: RingTarget[]): PreviewMetrics {
  if (!targets.length) {
    return {
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT_MIN,
      scale: 1,
      minY: -30,
      maxY: 30,
      padX: 16,
      padY: 16,
    };
  }
  const maxCarry = Math.max(...targets.map((t) => t.center.x + t.radius_m), 60);
  const minY = Math.min(...targets.map((t) => t.center.y - t.radius_m), -20);
  const maxY = Math.max(...targets.map((t) => t.center.y + t.radius_m), 20);
  const padX = 16;
  const padY = 16;
  const scale = (PREVIEW_WIDTH - padX * 2) / Math.max(maxCarry, 1);
  const height = Math.max(PREVIEW_HEIGHT_MIN, Math.round((maxY - minY) * scale) + padY * 2);
  return { width: PREVIEW_WIDTH, height, scale, minY, maxY, padX, padY };
}

function toScreen(point: LocalPoint, metrics: PreviewMetrics): { x: number; y: number } {
  const x = metrics.padX + point.x * metrics.scale;
  const y = metrics.padY + (metrics.maxY - point.y) * metrics.scale;
  return { x, y };
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '00:00';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function heatColor(value: number, max: number): string {
  if (max <= 0) {
    return 'rgba(15, 118, 110, 0.15)';
  }
  const t = clamp(value / max, 0, 1);
  const r = Math.round(30 + 180 * t);
  const g = Math.round(64 + 140 * (1 - t));
  const b = Math.round(125 - 40 * t);
  return `rgba(${r}, ${g}, ${b}, 0.9)`;
}

function summarizeClubs(perClub: GameState['perClub']): ClubSummary[] {
  const entries = Object.entries(perClub).map(([club, stats]) => ({
    club,
    shots: stats.shots,
    hits: stats.hits,
    score: stats.score,
  }));
  entries.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.hits !== a.hits) {
      return b.hits - a.hits;
    }
    if (b.shots !== a.shots) {
      return b.shots - a.shots;
    }
    return a.club.localeCompare(b.club);
  });
  return entries;
}

function pickBestClub(perClub: GameState['perClub']): string | null {
  const entries = summarizeClubs(perClub);
  return entries.length ? entries[0].club : null;
}

function encodeSummary(state: GameState, bestClub: string | null): string {
  try {
    const payload = {
      mode: state.mode,
      score: state.score,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? null,
      hits: state.hits.length,
      bestClub: bestClub ?? null,
      targets: state.targets.map((target) => ({
        id: target.id,
        label: target.label,
        carry_m: target.carry_m,
        radius_m: target.radius_m,
      })),
      perClub: state.perClub,
    };
    const json = JSON.stringify(payload);
    const base = Buffer.from(json, 'utf8').toString('base64');
    return base.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (error) {
    console.warn('[RangeGamesPanel] Failed to encode summary', error);
    return '';
  }
}

function formatTargetLabel(target: RingTarget): string {
  return `${Math.round(target.center.x)} m`;
}

function formatCarryList(targets: RingTarget[]): string {
  if (!targets.length) {
    return '—';
  }
  return targets.map((target) => formatTargetLabel(target)).join(' • ');
}

export const RangeGamesPanel: React.FC<RangeGamesPanelProps> = ({ visible, onClose }) => {
  const [tab, setTab] = useState<'bingo' | 'heatmap'>('bingo');
  const [carryInputs, setCarryInputs] = useState<string[]>(() =>
    DEFAULT_CARRIES.map((value) => value.toString()),
  );
  const [lateralSpread, setLateralSpread] = useState<number>(0);
  const [radiusScale, setRadiusScale] = useState<number>(1);
  const [cellSize, setCellSize] = useState<number>(5);
  const [gameState, setGameState] = useState<GameState | null>(() => RangeGameController.getState());
  const [now, setNow] = useState(() => Date.now());
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [heatmapShareBusy, setHeatmapShareBusy] = useState(false);
  const [heatmapShareMessage, setHeatmapShareMessage] = useState<string | null>(null);

  const scoreCardRef = useRef<ViewShot | null>(null);
  const heatmapCardRef = useRef<ViewShot | null>(null);

  useEffect(() => RangeGameController.subscribe(setGameState), []);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    if (!gameState || gameState.endedAt) {
      return undefined;
    }
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, gameState]);

  useEffect(() => {
    if (!visible) {
      setShareMessage(null);
      setHeatmapShareMessage(null);
    }
  }, [visible]);

  const carries = useMemo(() => parseCarries(carryInputs), [carryInputs]);
  const baseTargets = useMemo(() => buildTargets(carries, lateralSpread), [carries, lateralSpread]);
  const previewTargets = useMemo(
    () => adjustTargets(baseTargets, radiusScale),
    [baseTargets, radiusScale],
  );

  const previewMetrics = useMemo(() => computePreviewMetrics(previewTargets), [previewTargets]);

  const landingPoints = useMemo(
    () =>
      (gameState?.shots ?? [])
        .map((shot) => shot.landing)
        .filter((point): point is LocalPoint => Boolean(point)),
    [gameState],
  );

  const heatmap = useMemo<Heatmap>(() => makeHeatmap(landingPoints, cellSize), [landingPoints, cellSize]);
  const heatmapColors = useMemo<HeatColor[]>(() => {
    if (!heatmap.bins.length) {
      return [];
    }
    const max = Math.max(...heatmap.bins.map((bin) => bin.n));
    return heatmap.bins.map((bin) => ({
      bin,
      fill: heatColor(bin.n, max),
    }));
  }, [heatmap]);

  const gameActive = Boolean(gameState && !gameState.endedAt);
  const elapsedMs = gameState ? (gameState.endedAt ?? now) - gameState.startedAt : 0;
  const perClub = useMemo(() => (gameState ? summarizeClubs(gameState.perClub) : []), [gameState]);
  const bestClub = useMemo(() => (gameState ? pickBestClub(gameState.perClub) : null), [gameState]);
  const shareTargets = useMemo(() => (gameState ? gameState.targets : previewTargets), [gameState, previewTargets]);
  const shareTargetLabel = useMemo(() => formatCarryList(shareTargets), [shareTargets]);
  const summaryToken = useMemo(
    () => (gameState ? encodeSummary(gameState, bestClub) : ''),
    [gameState, bestClub],
  );

  const canStart = !gameActive && previewTargets.length >= MIN_TARGETS && previewTargets.length <= MAX_TARGETS;

  const handlePreset = useCallback((preset: number[]) => {
    setCarryInputs(preset.map((value) => value.toString()));
  }, []);

  const handleCarryChange = useCallback((index: number, value: string) => {
    setCarryInputs((prev) => {
      const next = [...prev];
      next[index] = value.replace(/[^0-9.]/g, '');
      return next;
    });
  }, []);

  const handleAddTarget = useCallback(() => {
    setCarryInputs((prev) => {
      if (prev.length >= MAX_TARGETS) {
        return prev;
      }
      return [...prev, '150'];
    });
  }, []);

  const handleRemoveTarget = useCallback((index: number) => {
    setCarryInputs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleStart = useCallback(() => {
    if (!canStart) {
      return;
    }
    const ts = Date.now();
    RangeGameController.start(previewTargets, ts);
    setShareMessage(null);
    setHeatmapShareMessage(null);
  }, [canStart, previewTargets]);

  const handleStop = useCallback(() => {
    RangeGameController.stop(Date.now());
  }, []);

  const handleReset = useCallback(() => {
    RangeGameController.reset();
    setShareMessage(null);
    setHeatmapShareMessage(null);
  }, []);

  const captureAndShare = useCallback(
    async (ref: ViewShot | null, setBusy: (busy: boolean) => void, setMessage: (message: string | null) => void) => {
      if (!ref) {
        setMessage('Unable to capture card.');
        return;
      }
      try {
        setBusy(true);
        setMessage(null);
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          setMessage('Sharing is unavailable on this device.');
          return;
        }
        const uri = await captureRef(ref, { format: 'png', quality: 0.95 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
        setMessage('Share card exported.');
      } catch (error) {
        console.warn('[RangeGamesPanel] share failed', error);
        setMessage('Unable to share card.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleShareScore = useCallback(() => {
    void captureAndShare(scoreCardRef.current, setShareBusy, setShareMessage);
  }, [captureAndShare]);

  const handleShareHeatmap = useCallback(() => {
    void captureAndShare(heatmapCardRef.current, setHeatmapShareBusy, setHeatmapShareMessage);
  }, [captureAndShare]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Range Games</Text>
            <Text style={styles.subtitle}>Target Bingo + Spray Heatmap</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button">
            <Text style={styles.closeLabel}>Close</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabButton, tab === 'bingo' ? styles.tabButtonActive : null]}
            onPress={() => setTab('bingo')}
            accessibilityRole="tab"
          >
            <Text style={[styles.tabLabel, tab === 'bingo' ? styles.tabLabelActive : null]}>Target Bingo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, tab === 'heatmap' ? styles.tabButtonActive : null]}
            onPress={() => setTab('heatmap')}
            accessibilityRole="tab"
          >
            <Text style={[styles.tabLabel, tab === 'heatmap' ? styles.tabLabelActive : null]}>Spray Heatmap</Text>
          </TouchableOpacity>
        </View>
        {tab === 'bingo' ? (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Target carries</Text>
              <Text style={styles.sectionHint}>Pick a preset then fine-tune carries. Aim for 5–8 rings.</Text>
              <View style={styles.presetRow}>
                {PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    style={styles.presetButton}
                    onPress={() => handlePreset(preset.carries)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.presetLabel}>{preset.label}</Text>
                    <Text style={styles.presetCarries}>{preset.carries.join(' • ')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.carryList}>
                {carryInputs.map((value, index) => (
                  <View key={`carry-${index}`} style={styles.carryRow}>
                    <TextInput
                      style={styles.carryInput}
                      keyboardType="numeric"
                      value={value}
                      onChangeText={(text) => handleCarryChange(index, text)}
                      accessibilityLabel={`Target ${index + 1} carry`}
                    />
                    <Text style={styles.carrySuffix}>m</Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveTarget(index)}
                      style={styles.removeCarryButton}
                      accessibilityRole="button"
                      disabled={carryInputs.length <= MIN_TARGETS}
                    >
                      <Text
                        style={[
                          styles.removeCarryLabel,
                          carryInputs.length <= MIN_TARGETS ? styles.removeCarryDisabled : null,
                        ]}
                      >
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.addCarryButton, carryInputs.length >= MAX_TARGETS ? styles.addCarryDisabled : null]}
                onPress={handleAddTarget}
                disabled={carryInputs.length >= MAX_TARGETS}
                accessibilityRole="button"
              >
                <Text style={styles.addCarryLabel}>Add target</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lateral spread</Text>
              <Text style={styles.sectionHint}>Alternate rings left/right to widen the bingo board.</Text>
              <View style={styles.sliderRow}>
                <Text style={styles.sliderValue}>±{lateralSpread.toFixed(1)} m</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={20}
                  step={0.5}
                  minimumTrackTintColor="#1d4ed8"
                  maximumTrackTintColor="#1f2937"
                  thumbTintColor="#1d4ed8"
                  value={lateralSpread}
                  onValueChange={setLateralSpread}
                />
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ring size</Text>
              <Text style={styles.sectionHint}>Shrink or expand the default 3% radius to tune difficulty.</Text>
              <View style={styles.sliderRow}>
                <Text style={styles.sliderValue}>{radiusScale.toFixed(2)}×</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0.6}
                  maximumValue={1.5}
                  step={0.05}
                  minimumTrackTintColor="#f97316"
                  maximumTrackTintColor="#1f2937"
                  thumbTintColor="#f97316"
                  value={radiusScale}
                  onValueChange={setRadiusScale}
                />
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Preview</Text>
              <Text style={styles.sectionHint}>Top-down ring layout with live shots when a game is active.</Text>
              <View style={styles.previewCard}>
                <Svg width={previewMetrics.width} height={previewMetrics.height}>
                  <Rect x={0} y={0} width={previewMetrics.width} height={previewMetrics.height} fill="#0f172a" rx={12} />
                  <Line
                    x1={previewMetrics.padX}
                    y1={previewMetrics.padY + (previewMetrics.maxY - 0) * previewMetrics.scale}
                    x2={previewMetrics.width - previewMetrics.padX}
                    y2={previewMetrics.padY + (previewMetrics.maxY - 0) * previewMetrics.scale}
                    stroke="#1e293b"
                    strokeDasharray="6 6"
                    strokeWidth={1}
                  />
                  {previewTargets.map((target) => {
                    const center = toScreen(target.center, previewMetrics);
                    const radius = target.radius_m * previewMetrics.scale;
                    return (
                      <React.Fragment key={target.id}>
                        <Circle cx={center.x} cy={center.y} r={radius} stroke="#38bdf8" strokeWidth={2} fill="none" />
                        <SvgText
                          x={center.x}
                          y={center.y - radius - 6}
                          fill="#f8fafc"
                          fontSize={12}
                          fontWeight="600"
                          textAnchor="middle"
                        >
                          {formatTargetLabel(target)}
                        </SvgText>
                      </React.Fragment>
                    );
                  })}
                  {landingPoints.map((point, index) => {
                    const screen = toScreen(point, previewMetrics);
                    return (
                      <Circle key={`landing-${index}`} cx={screen.x} cy={screen.y} r={3} fill="#f97316" opacity={0.8} />
                    );
                  })}
                </Svg>
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Game status</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusBlock}>
                  <Text style={styles.statusLabel}>Score</Text>
                  <Text style={styles.statusValue}>{gameState ? gameState.score : 0}</Text>
                </View>
                <View style={styles.statusBlock}>
                  <Text style={styles.statusLabel}>Hits</Text>
                  <Text style={styles.statusValue}>{gameState ? gameState.hits.length : 0}</Text>
                </View>
                <View style={styles.statusBlock}>
                  <Text style={styles.statusLabel}>Streak</Text>
                  <Text style={styles.statusValue}>{gameState ? gameState.streak : 0}</Text>
                </View>
                <View style={styles.statusBlock}>
                  <Text style={styles.statusLabel}>Timer</Text>
                  <Text style={styles.statusValue}>{formatDuration(elapsedMs)}</Text>
                </View>
              </View>
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.primaryButton, !canStart ? styles.buttonDisabled : null]}
                  onPress={handleStart}
                  disabled={!canStart}
                >
                  <Text style={styles.primaryButtonLabel}>{gameActive ? 'Restart' : 'Start game'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, !gameState ? styles.buttonDisabled : null]}
                  onPress={handleStop}
                  disabled={!gameState}
                >
                  <Text style={styles.secondaryButtonLabel}>Stop</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, !gameState ? styles.buttonDisabled : null]}
                  onPress={handleReset}
                  disabled={!gameState}
                >
                  <Text style={styles.secondaryButtonLabel}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Per-club ladder</Text>
              <Text style={styles.sectionHint}>Live breakdown of shots, hits, and score.</Text>
              <ViewShot ref={scoreCardRef} style={styles.shareCard} options={{ format: 'png', quality: 0.95 }}>
                <View style={styles.shareCardHeader}>
                  <Text style={styles.shareCardTitle}>Target Bingo</Text>
                  <Text style={styles.shareCardWatermark}>GolfIQ Range</Text>
                </View>
                <View style={styles.shareMetricsRow}>
                  <View style={styles.shareMetricBlock}>
                    <Text style={styles.shareMetricLabel}>Score</Text>
                    <Text style={styles.shareMetricValue}>{gameState ? gameState.score : 0}</Text>
                  </View>
                  <View style={styles.shareMetricBlock}>
                    <Text style={styles.shareMetricLabel}>Hits</Text>
                    <Text style={styles.shareMetricValue}>{gameState ? gameState.hits.length : 0}</Text>
                  </View>
                  <View style={styles.shareMetricBlock}>
                    <Text style={styles.shareMetricLabel}>Best club</Text>
                    <Text style={styles.shareMetricValue}>{bestClub ?? '—'}</Text>
                  </View>
                </View>
                <Text style={styles.shareTargetsLabel}>Targets: {shareTargetLabel}</Text>
                <View style={styles.ladderHeader}>
                  <Text style={[styles.ladderCell, styles.ladderCellClub]}>Club</Text>
                  <Text style={styles.ladderCell}>Shots</Text>
                  <Text style={styles.ladderCell}>Hits</Text>
                  <Text style={styles.ladderCell}>Score</Text>
                </View>
                {perClub.length === 0 ? (
                  <Text style={styles.emptyLadder}>No shots yet.</Text>
                ) : (
                  perClub.map((entry) => (
                    <View key={entry.club} style={styles.ladderRow}>
                      <Text style={[styles.ladderCell, styles.ladderCellClub]}>{entry.club}</Text>
                      <Text style={styles.ladderCell}>{entry.shots}</Text>
                      <Text style={styles.ladderCell}>{entry.hits}</Text>
                      <Text style={styles.ladderCell}>{entry.score}</Text>
                    </View>
                  ))
                )}
              </ViewShot>
              <View style={styles.shareActions}>
                <TouchableOpacity
                  style={[styles.primaryButton, shareBusy ? styles.buttonDisabled : null]}
                  onPress={handleShareScore}
                  disabled={shareBusy}
                >
                  <Text style={styles.primaryButtonLabel}>{shareBusy ? 'Preparing…' : 'Share score card'}</Text>
                </TouchableOpacity>
                {shareMessage ? <Text style={styles.shareStatus}>{shareMessage}</Text> : null}
              </View>
              {summaryToken ? (
                <View style={styles.shareLinkCard}>
                  <Text style={styles.shareLinkLabel}>Web scoreboard link</Text>
                  <Text selectable style={styles.shareLinkValue}>
                    {`https://golfiq.app/range/score?s=${summaryToken}`}
                  </Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Spray heatmap</Text>
              <Text style={styles.sectionHint}>Auto-updates with every shot landing.</Text>
              <View style={styles.sliderRow}>
                <Text style={styles.sliderValue}>{cellSize.toFixed(0)} m grid</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={3}
                  maximumValue={15}
                  step={1}
                  minimumTrackTintColor="#14b8a6"
                  maximumTrackTintColor="#1f2937"
                  thumbTintColor="#14b8a6"
                  value={cellSize}
                  onValueChange={setCellSize}
                />
              </View>
              <ViewShot ref={heatmapCardRef} style={styles.heatmapCard} options={{ format: 'png', quality: 0.95 }}>
                <View style={styles.shareCardHeader}>
                  <Text style={styles.shareCardTitle}>Spray Heatmap</Text>
                  <Text style={styles.shareCardWatermark}>GolfIQ Range</Text>
                </View>
                <Svg
                  width={heatmap.width * HEAT_CELL_PX + 32}
                  height={Math.max(1, heatmap.height) * HEAT_CELL_PX + 32}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={heatmap.width * HEAT_CELL_PX + 32}
                    height={Math.max(1, heatmap.height) * HEAT_CELL_PX + 32}
                    fill="#0f172a"
                    rx={12}
                  />
                  {heatmapColors.map(({ bin, fill }) => (
                    <Rect
                      key={`${bin.x}-${bin.y}`}
                      x={16 + bin.x * HEAT_CELL_PX}
                      y={16 + bin.y * HEAT_CELL_PX}
                      width={HEAT_CELL_PX - 4}
                      height={HEAT_CELL_PX - 4}
                      rx={6}
                      fill={fill}
                    />
                  ))}
                </Svg>
              </ViewShot>
              <View style={styles.shareActions}>
                <TouchableOpacity
                  style={[styles.primaryButton, heatmapShareBusy ? styles.buttonDisabled : null]}
                  onPress={handleShareHeatmap}
                  disabled={heatmapShareBusy}
                >
                  <Text style={styles.primaryButtonLabel}>
                    {heatmapShareBusy ? 'Preparing…' : 'Share heatmap card'}
                  </Text>
                </TouchableOpacity>
                {heatmapShareMessage ? <Text style={styles.shareStatus}>{heatmapShareMessage}</Text> : null}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingTop: 32,
  },
  header: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1f2937',
  },
  closeLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  tabRow: {
    marginTop: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    gap: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#0f172a',
  },
  tabButtonActive: {
    backgroundColor: '#1d4ed8',
  },
  tabLabel: {
    textAlign: 'center',
    color: '#94a3b8',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#f8fafc',
  },
  content: {
    flex: 1,
    marginTop: 16,
  },
  contentInner: {
    padding: 24,
    paddingBottom: 48,
    gap: 24,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  sectionHint: {
    fontSize: 13,
    color: '#94a3b8',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presetButton: {
    flexBasis: '48%',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    padding: 12,
    gap: 4,
  },
  presetLabel: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 14,
  },
  presetCarries: {
    color: '#94a3b8',
    fontSize: 12,
  },
  carryList: {
    gap: 12,
  },
  carryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  carryInput: {
    flex: 1,
    backgroundColor: '#111827',
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  carrySuffix: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
  removeCarryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  removeCarryLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  removeCarryDisabled: {
    color: '#475569',
  },
  addCarryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#1d4ed8',
  },
  addCarryDisabled: {
    opacity: 0.4,
  },
  addCarryLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sliderValue: {
    width: 96,
    color: '#e2e8f0',
    fontWeight: '600',
  },
  slider: {
    flex: 1,
  },
  previewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusBlock: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  statusLabel: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  statusValue: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonLabel: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  shareCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  shareCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shareCardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  shareCardWatermark: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  shareMetricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  shareMetricBlock: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  shareMetricLabel: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  shareMetricValue: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  shareTargetsLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  ladderHeader: {
    flexDirection: 'row',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
    paddingBottom: 8,
  },
  ladderRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  ladderCell: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  ladderCellClub: {
    flex: 1.2,
    fontWeight: '600',
  },
  emptyLadder: {
    color: '#475569',
    paddingVertical: 12,
  },
  shareActions: {
    gap: 8,
  },
  shareStatus: {
    color: '#38bdf8',
    fontSize: 12,
  },
  shareLinkCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  shareLinkLabel: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  shareLinkValue: {
    color: '#f8fafc',
    fontSize: 13,
  },
  heatmapCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    alignSelf: 'flex-start',
  },
});

export default RangeGamesPanel;
