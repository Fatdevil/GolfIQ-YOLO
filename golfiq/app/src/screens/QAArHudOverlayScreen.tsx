import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  getBundle,
  getIndex,
  getLastBundleFetchMeta,
  type BundleIndexEntry,
  type CourseBundle,
} from '../../../../shared/arhud/bundle_client';
import { searchCourses, type CourseSearchResult } from '../../../../shared/arhud/course_search';
import {
  AutoCourseController,
  type AutoCourseCandidate,
} from '../../../../shared/arhud/auto_course';
import {
  computeGhostTrajectory,
  type GhostTrajectoryResult,
} from '../../../../shared/arhud/ballistics';
import {
  nearestFeature,
  toLocalENU,
  type GeoPoint,
  type LocalPoint,
} from '../../../../shared/arhud/geo';
import {
  getLocation,
  LocationError,
  estimateSpeedMps,
  distanceMeters,
  formatAccuracyMeters,
  formatDop,
  formatDualFrequency,
  formatSatelliteCount,
  gnssAccuracyLevel,
  type LocationFix,
} from '../../../../shared/arhud/location';
import { lockExposure, lockWhiteBalance, unlockAll } from '../../../../shared/arhud/camera';
import { createCameraStub, type CameraFrame } from '../../../../shared/arhud/native/camera_stub';
import { subscribeHeading } from '../../../../shared/arhud/native/heading';
import { qaHudEnabled } from '../../../../shared/arhud/native/qa_gate';
import {
  getCalibrationHealth,
  isHomographySnapshotStale,
  loadHomographySnapshot,
  type CalibrationHealth,
  type HomographySnapshot,
} from '../../../../shared/cv/calibration';
import { computePlaysLike, type PlanOut } from '../../../../shared/playslike/aggregate';
import { addShot as addRoundShot, getActiveRound as getActiveRoundState } from '../../../../shared/round/round_store';
import { resumePendingUploads, uploadRoundRun } from '../../../../shared/runs/uploader';
import type { Shot as RoundShot } from '../../../../shared/round/round_types';
import {
  CLUB_SEQUENCE,
  defaultBag,
  effectiveBag,
  getUserBag,
  saveUserBag,
  suggestClub,
  type Bag,
  type ClubId,
} from '../../../../shared/playslike/bag';
import {
  calibrate,
  type CalibOut,
  type Shot as CalibrateShot,
} from '../../../../shared/playslike/bag_calibrator';
import { isTelemetryOptedOut } from '../../../../shared/ops/log_export';
import { buildShotFeedback, type FeedbackOutput } from '../../../../shared/playslike/feedback';
import {
  createLandingHeuristics,
  type LandingProposal,
  type LandingState as AutoLandingState,
  type LandingSample,
} from '../../../../shared/arhud/landing_heuristics';
import {
  buildPlayerModel,
  loadLearnedDispersion,
  saveLearnedDispersion,
  type DispersionSnapshot,
} from '../../../../shared/caddie/player_model';
import { learnDispersion, type ClubDispersion } from '../../../../shared/caddie/dispersion';
import {
  planApproach,
  planApproachMC,
  planTeeShot,
  planTeeShotMC,
  type RiskMode as CaddieRiskMode,
  type ShotPlan as CaddieShotPlan,
} from '../../../../shared/caddie/strategy';
import type { TrainingFocus } from '../../../../shared/training/types';
import {
  defaultCoachStyle,
  loadCoachStyle,
  saveCoachStyle,
  type CoachStyle,
  type CoachTone,
  type CoachVerbosity,
  type CoachVoiceSettings,
} from '../../../../shared/caddie/style';
import { advise, type Advice } from '../../../../shared/caddie/advice';
import { getCaddieRc } from '../../../../shared/caddie/rc';
import { inRollout } from '../../../../shared/caddie/rollout';
import { caddieTipToText, advicesToText } from '../../../../shared/caddie/text';
import { speak as speakTip, stop as stopSpeech } from '../../../../shared/tts/speak';
import { buildGhostTelemetryKey } from './utils/ghostTelemetry';
import CalibrationWizard from './CalibrationWizard';
import {
  classifyPhase,
  computeSG,
  type ShotPhase,
} from '../../../../shared/sg/engine';
import {
  loadPlayerProfile,
  resolveProfileId as resolveCoachProfileId,
  savePlayerProfile,
  updateFromRound,
  type PlayerProfile,
} from '../../../../shared/coach/profile';
import { pickRisk } from '../../../../shared/coach/policy';

type FeatureKind = 'green' | 'fairway' | 'bunker' | 'hazard' | 'cartpath' | 'other';

type LocalSegment = {
  start: LocalPoint;
  end: LocalPoint;
};

type OverlayFeature = {
  id: string;
  kind: FeatureKind;
  segments: LocalSegment[];
  polygonRings: number[][][];
};

type OverlayData = {
  features: OverlayFeature[];
  points: LocalPoint[];
};

type CameraStats = {
  latency: number;
  fps: number;
};

type OptionalFileSystemModule = {
  documentDirectory?: string | null;
  getInfoAsync?: (path: string) => Promise<{ exists: boolean; isFile?: boolean }>;
  makeDirectoryAsync?: (path: string, options?: { intermediates?: boolean }) => Promise<void>;
  readAsStringAsync?: (path: string) => Promise<string>;
  writeAsStringAsync?: (path: string, contents: string) => Promise<void>;
};

type PlannerInputKey =
  | 'temperatureC'
  | 'altitude_m'
  | 'wind_mps'
  | 'wind_from_deg'
  | 'slope_dh_m';

const clampPct = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const Bar = ({ pct, good }: { pct: number; good?: boolean }) => (
  <View style={styles.mcMiniBarTrack}>
    <View
      style={[
        styles.mcMiniBarFill,
        { width: `${clampPct(pct)}%` },
        good ? styles.mcMiniBarFillPositive : styles.mcMiniBarFillNegative,
      ]}
    />
  </View>
);

const normalizeRcBoolean = (value: unknown): boolean => {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
  return false;
};

const readTournamentSafe = (): boolean => {
  if (typeof globalThis === 'undefined') {
    return false;
  }
  const rc = (globalThis as { RC?: Record<string, unknown> }).RC;
  if (!rc || typeof rc !== 'object') {
    return false;
  }
  const record = rc as Record<string, unknown>;
  if (record['hud.tournamentSafe'] !== undefined) {
    return normalizeRcBoolean(record['hud.tournamentSafe']);
  }
  if (record.tournamentSafe !== undefined) {
    return normalizeRcBoolean(record.tournamentSafe);
  }
  return false;
};

const formatGreenSectionLabel = (value: string): string => {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const FEATURE_COLORS: Record<FeatureKind, string> = {
  green: '#16a34a',
  fairway: '#22c55e',
  bunker: '#facc15',
  hazard: '#ef4444',
  cartpath: '#94a3b8',
  other: '#cbd5f5',
};

const FEATURE_STROKES: Record<FeatureKind, number> = {
  green: 6,
  fairway: 5,
  bunker: 4,
  hazard: 4,
  cartpath: 6,
  other: 3,
};

const MC_SAMPLES_MIN = 200;
const MC_SAMPLES_MAX = 1200;
const MC_SAMPLES_STEP = 50;

const CADDIE_RISK_OPTIONS: readonly CaddieRiskMode[] = ['safe', 'normal', 'aggressive'];
const CADDIE_RISK_LABELS: Record<CaddieRiskMode, string> = {
  safe: 'Safe',
  normal: 'Normal',
  aggressive: 'Aggro',
};

const COACH_TONE_OPTIONS: readonly CoachTone[] = ['concise', 'neutral', 'pep'];
const COACH_TONE_LABELS: Record<CoachTone, string> = {
  concise: 'Concise',
  neutral: 'Neutral',
  pep: 'Pep',
};

const COACH_VERBOSITY_OPTIONS: readonly CoachVerbosity[] = ['short', 'normal', 'detailed'];
const COACH_VERBOSITY_LABELS: Record<CoachVerbosity, string> = {
  short: 'Short',
  normal: 'Normal',
  detailed: 'Detailed',
};

const COACH_LANGUAGE_OPTIONS: ReadonlyArray<{ value: CoachStyle['language']; label: string }> = [
  { value: 'sv', label: 'SV' },
  { value: 'en', label: 'EN' },
];

const COACH_VOICE_LANGUAGE_OPTIONS: ReadonlyArray<{ value: 'sv-SE' | 'en-US'; label: string }> = [
  { value: 'sv-SE', label: 'SV' },
  { value: 'en-US', label: 'EN' },
];

const DEFAULT_VOICE_BY_LANGUAGE: Record<CoachStyle['language'], 'sv-SE' | 'en-US'> = {
  sv: 'sv-SE',
  en: 'en-US',
};

const DEFAULT_RATE_BY_VOICE_LANG: Record<'sv-SE' | 'en-US', number> = {
  'sv-SE': 0.95,
  'en-US': 1.0,
};

const DEFAULT_VOICE_PITCH = 1.0;
const VOICE_RATE_MIN = 0.5;
const VOICE_RATE_MAX = 1.5;
const VOICE_RATE_STEP = 0.05;
const VOICE_PITCH_MIN = 0.75;
const VOICE_PITCH_MAX = 1.5;
const VOICE_PITCH_STEP = 0.05;
const VOICE_LANGUAGE_TO_COACH: Record<'sv-SE' | 'en-US', CoachStyle['language']> = {
  'sv-SE': 'sv',
  'en-US': 'en',
};

const EARTH_RADIUS_M = 6_378_137;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const clampVoiceValue = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const sanitizeVoiceSettings = (voice?: CoachVoiceSettings | null): CoachVoiceSettings | undefined => {
  if (!voice) {
    return undefined;
  }
  const result: CoachVoiceSettings = {};
  if (voice.lang === 'sv-SE' || voice.lang === 'en-US') {
    result.lang = voice.lang;
  }
  if (typeof voice.rate === 'number' && Number.isFinite(voice.rate)) {
    result.rate = Number(clampVoiceValue(voice.rate, VOICE_RATE_MIN, VOICE_RATE_MAX).toFixed(2));
  }
  if (typeof voice.pitch === 'number' && Number.isFinite(voice.pitch)) {
    result.pitch = Number(clampVoiceValue(voice.pitch, VOICE_PITCH_MIN, VOICE_PITCH_MAX).toFixed(2));
  }
  return result.lang || result.rate !== undefined || result.pitch !== undefined ? result : undefined;
};

const resolveVoiceLanguage = (style: CoachStyle): 'sv-SE' | 'en-US' =>
  style.voice?.lang === 'sv-SE' || style.voice?.lang === 'en-US'
    ? style.voice.lang
    : DEFAULT_VOICE_BY_LANGUAGE[style.language];

const resolveVoiceRate = (style: CoachStyle, lang: 'sv-SE' | 'en-US'): number => {
  const rate = style.voice?.rate;
  if (typeof rate === 'number' && Number.isFinite(rate)) {
    return clampVoiceValue(rate, VOICE_RATE_MIN, VOICE_RATE_MAX);
  }
  return DEFAULT_RATE_BY_VOICE_LANG[lang];
};

const resolveVoicePitch = (style: CoachStyle): number => {
  const pitch = style.voice?.pitch;
  if (typeof pitch === 'number' && Number.isFinite(pitch)) {
    return clampVoiceValue(pitch, VOICE_PITCH_MIN, VOICE_PITCH_MAX);
  }
  return DEFAULT_VOICE_PITCH;
};

type VoiceSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange(value: number): void;
};

const VoiceSlider: React.FC<VoiceSliderProps> = ({ label, value, min, max, step, disabled, onChange }) => {
  const [trackWidth, setTrackWidth] = useState(1);
  const metricsRef = useRef<{ left: number }>({ left: 0 });

  const clampToRange = useCallback(
    (input: number) => {
      const clamped = clampVoiceValue(input, min, max);
      const stepped = Math.round(clamped / step) * step;
      return Number(stepped.toFixed(2));
    },
    [max, min, step],
  );

  const updateFromPageX = useCallback(
    (pageX: number) => {
      if (disabled) {
        return;
      }
      const left = metricsRef.current.left;
      const relative = Math.max(0, Math.min(trackWidth, pageX - left));
      const ratio = trackWidth <= 0 ? 0 : relative / trackWidth;
      const raw = min + ratio * (max - min);
      onChange(clampToRange(raw));
    },
    [clampToRange, disabled, max, min, onChange, trackWidth],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => {
          metricsRef.current.left = event.nativeEvent.pageX - event.nativeEvent.locationX;
          updateFromPageX(event.nativeEvent.pageX);
        },
        onPanResponderMove: (event) => {
          updateFromPageX(event.nativeEvent.pageX);
        },
      }),
    [disabled, updateFromPageX],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(Math.max(1, event.nativeEvent.layout.width));
  }, []);

  const constrainedValue = clampToRange(value);
  const progress = clamp01((constrainedValue - min) / (max - min));
  const fillWidth = progress * trackWidth;
  const handleLeft = Math.min(Math.max(0, fillWidth - 8), Math.max(0, trackWidth - 16));

  return (
    <View style={styles.voiceSliderBlock}>
      <Text style={[styles.voiceSliderLabel, disabled ? styles.voiceSliderLabelDisabled : null]}>{label}</Text>
      <View
        style={[styles.voiceSliderTrack, disabled ? styles.voiceSliderTrackDisabled : null]}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <View style={[styles.voiceSliderFill, { width: fillWidth }]} />
        <View style={[styles.voiceSliderHandle, { left: handleLeft }]} />
      </View>
    </View>
  );
};

const formatSignedMeters = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0.0 m';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} m`;
};

const DISPERSION_MIN_SAMPLES = 6;

const cloneDispersionMap = (
  source: Partial<Record<ClubId, ClubDispersion>> | null,
): Partial<Record<ClubId, ClubDispersion>> | null => {
  if (!source) {
    return null;
  }
  const next: Partial<Record<ClubId, ClubDispersion>> = {};
  for (const club of CLUB_SEQUENCE) {
    const entry = source[club];
    if (entry) {
      next[club] = { ...entry };
    }
  }
  return Object.keys(next).length ? next : null;
};

const dispersionMapsEqual = (
  a: Partial<Record<ClubId, ClubDispersion>> | null,
  b: Partial<Record<ClubId, ClubDispersion>> | null,
): boolean => {
  for (const club of CLUB_SEQUENCE) {
    const left = a ? a[club] : undefined;
    const right = b ? b[club] : undefined;
    if (!left && !right) {
      continue;
    }
    if (!left || !right) {
      return false;
    }
    if (Math.abs(left.sigma_long_m - right.sigma_long_m) > 1e-3) {
      return false;
    }
    if (Math.abs(left.sigma_lat_m - right.sigma_lat_m) > 1e-3) {
      return false;
    }
    if (left.n !== right.n) {
      return false;
    }
  }
  return true;
};

const formatSigma = (value: number | null | undefined): string => {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return '—';
  }
  return (value as number).toFixed(1);
};

const showToast = (message: string): void => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert('Caddie', message);
};

type TelemetryEmitter = (event: string, data: Record<string, unknown>) => void;

type HazardDirection = 'LEFT' | 'RIGHT';

const HOLED_THRESHOLD_M = 0.75;

type ShotLogRecord = {
  tStart: number;
  tEnd: number;
  shotId: string;
  club: string | null;
  base_m: number | null;
  playsLike_m: number | null;
  deltas: {
    temp: number | null;
    alt: number | null;
    head: number | null;
    slope: number | null;
  };
  pin: { lat: number; lon: number } | null;
  land: { lat: number; lon: number } | null;
  carry_m: number | null;
  heading_deg: number | null;
  endDist_m?: number | null;
  holed?: boolean;
  phase?: ShotPhase;
  planAdopted?: boolean;
  sg?: {
    tee: number | null;
    approach: number | null;
    short: number | null;
    putt: number | null;
    total: number | null;
    expStart: number | null;
    expEnd: number | null;
    strokes: number | null;
  };
  ev?: {
    before: number | null;
    after: number | null;
  };
  notes?: string | null;
  rollout?: {
    mc: boolean;
    advice: boolean;
    tts: boolean;
  };
};

type ShotSessionState = {
  shotId: string;
  startedAt: number;
  headingDeg: number;
  baseDistance: number;
  origin: LocalPoint;
  plan: PlanOut;
  club: string | null;
  pin: GeoPoint | null;
  phase: ShotPhase;
  planAdopted: boolean;
  landing?: LocalPoint;
  completedAt?: number;
  logged?: boolean;
};

type ShotSummary = {
  actual: number;
  planned: number;
  error: number;
  plannedClub: ClubId;
  actualClub: string;
  feedback: FeedbackOutput | null;
  evBefore: number | null;
  evAfter: number | null;
  sg: {
    tee: number;
    approach: number;
    short: number;
    putt: number;
    total: number;
  } | null;
  planAdopted: boolean;
};

type AutoPickPrompt = {
  candidate: AutoCourseCandidate;
  shownAt: number;
};

type CaddieRolloutState = {
  ready: boolean;
  deviceId: string;
  mc: boolean;
  advice: boolean;
  tts: boolean;
  percents: {
    mc: number;
    advice: number;
    tts: number;
  };
};

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatDistanceMeters(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return '—';
  }
  const meters = Number(value);
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  if (meters >= 100) {
    return `${meters.toFixed(0)} m`;
  }
  return `${meters.toFixed(1)} m`;
}

function formatSearchDistance(distKm: number | null | undefined): string {
  if (!Number.isFinite(distKm ?? Number.NaN)) {
    return '—';
  }
  const km = Number(distKm);
  if (km >= 1) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km * 1000)} m`;
}

let lastSelectedCourseMemory: string | null = null;

function resolveTelemetryEmitter(): TelemetryEmitter | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const holder = globalThis as { __ARHUD_QA_TELEMETRY__?: unknown };
  const candidate = holder.__ARHUD_QA_TELEMETRY__;
  return typeof candidate === 'function' ? (candidate as TelemetryEmitter) : null;
}

async function resolveDeviceId(): Promise<string> {
  try {
    const Application = (await import('expo-application')) as Record<string, unknown> & {
      androidId?: string | null;
      getIosIdForVendorAsync?: () => Promise<string | null | undefined>;
    };
    if (Application && typeof Application === 'object') {
      const androidId = typeof Application.androidId === 'string' ? Application.androidId.trim() : '';
      if (androidId) {
        return `android-${androidId}`;
      }
      if (typeof Application.getIosIdForVendorAsync === 'function') {
        const iosId = await Application.getIosIdForVendorAsync();
        if (iosId && typeof iosId === 'string' && iosId.trim()) {
          return `ios-${iosId.trim()}`;
        }
      }
    }
  } catch (error) {
    // ignore missing module
  }
  try {
    const { default: Constants } = (await import('expo-constants')) as Record<string, unknown> & {
      installationId?: string | null;
      deviceId?: string | null;
    };
    if (Constants && typeof Constants === 'object') {
      const installationId = typeof Constants.installationId === 'string'
        ? Constants.installationId.trim()
        : '';
      if (installationId) {
        return installationId;
      }
      const deviceId = typeof Constants.deviceId === 'string' ? Constants.deviceId.trim() : '';
      if (deviceId) {
        return deviceId;
      }
    }
  } catch (error) {
    // ignore missing module
  }
  return 'unknown-device';
}

async function loadFileSystem(): Promise<OptionalFileSystemModule | null> {
  try {
    const mod = (await import('expo-file-system')) as OptionalFileSystemModule;
    return mod ?? null;
  } catch (error) {
    return null;
  }
}

async function loadLastSelectedCourse(): Promise<string | null> {
  if (lastSelectedCourseMemory) {
    return lastSelectedCourseMemory;
  }
  const FileSystem = await loadFileSystem();
  if (!FileSystem?.documentDirectory || !FileSystem.readAsStringAsync || !FileSystem.getInfoAsync) {
    return null;
  }
  const base = FileSystem.documentDirectory.replace(/\/+$/, '');
  const path = `${base}/qa-overlay/last-course.json`;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isFile === false) {
      return null;
    }
    const contents = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(contents) as { courseId?: unknown };
    if (parsed && typeof parsed.courseId === 'string' && parsed.courseId) {
      lastSelectedCourseMemory = parsed.courseId;
      return parsed.courseId;
    }
  } catch (error) {
    return null;
  }
  return null;
}

async function persistLastSelectedCourse(courseId: string): Promise<void> {
  lastSelectedCourseMemory = courseId;
  const FileSystem = await loadFileSystem();
  if (!FileSystem?.documentDirectory || !FileSystem.writeAsStringAsync) {
    return;
  }
  const base = FileSystem.documentDirectory.replace(/\/+$/, '');
  const directory = `${base}/qa-overlay`;
  try {
    if (FileSystem.makeDirectoryAsync) {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    }
    const path = `${directory}/last-course.json`;
    await FileSystem.writeAsStringAsync(path, JSON.stringify({ courseId }));
  } catch (error) {
    // ignore persistence errors
  }
}

function mapHudRecordToRoundShot(record: ShotLogRecord): RoundShot | null {
  if (!record || !record.pin) {
    return null;
  }
  const tStart = Number(record.tStart);
  if (!Number.isFinite(tStart)) {
    return null;
  }
  const pinLat = Number(record.pin.lat);
  const pinLon = Number(record.pin.lon);
  if (!Number.isFinite(pinLat) || !Number.isFinite(pinLon)) {
    return null;
  }
  const base = typeof record.base_m === 'number' && Number.isFinite(record.base_m) ? record.base_m : undefined;
  const playsLike = typeof record.playsLike_m === 'number' && Number.isFinite(record.playsLike_m) ? record.playsLike_m : base;
  const shot: RoundShot = {
    tStart,
    club: record.club ?? 'UNK',
    base_m: base ?? 0,
    playsLike_m: playsLike ?? 0,
    pin: { lat: pinLat, lon: pinLon },
  };
  if (typeof record.tEnd === 'number' && Number.isFinite(record.tEnd)) {
    shot.tEnd = record.tEnd;
  }
  if (typeof record.carry_m === 'number' && Number.isFinite(record.carry_m)) {
    shot.carry_m = record.carry_m;
  }
  if (typeof record.heading_deg === 'number' && Number.isFinite(record.heading_deg)) {
    shot.heading_deg = record.heading_deg;
  }
  if (record.land && typeof record.land === 'object') {
    const landLat = Number((record.land as { lat?: number }).lat);
    const landLon = Number((record.land as { lon?: number }).lon);
    if (Number.isFinite(landLat) && Number.isFinite(landLon)) {
      shot.land = { lat: landLat, lon: landLon };
    }
  }
  return shot;
}

async function appendHudRunShot(record: ShotLogRecord): Promise<void> {
  const FileSystem = await loadFileSystem();
  if (!FileSystem?.documentDirectory || !FileSystem.writeAsStringAsync) {
    return;
  }
  const base = FileSystem.documentDirectory.replace(/\/+$/, '');
  const path = `${base}/hud_run.json`;
  let records: unknown[] | null = null;
  if (!FileSystem.readAsStringAsync) {
    if (FileSystem.getInfoAsync) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists && info.isFile !== false) {
          return;
        }
      } catch (error) {
        // ignore stat errors
      }
    }
    records = [];
  } else {
    try {
      const contents = await FileSystem.readAsStringAsync(path);
      const parsed = JSON.parse(contents);
      if (Array.isArray(parsed)) {
        records = parsed;
      } else {
        return;
      }
    } catch (error) {
      if (FileSystem.getInfoAsync) {
        try {
          const info = await FileSystem.getInfoAsync(path);
          if (info.exists && info.isFile !== false) {
            return;
          }
        } catch (statError) {
          // ignore stat errors when determining file existence
        }
      }
      records = [];
    }
  }
  if (!records) {
    records = [];
  }
  records.push(record);
  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(records, null, 2));
  } catch (error) {
    // ignore write errors
  }
}

async function loadHudRunShots(): Promise<ShotLogRecord[]> {
  const FileSystem = await loadFileSystem();
  if (!FileSystem?.documentDirectory || !FileSystem.readAsStringAsync) {
    return [];
  }
  const base = FileSystem.documentDirectory.replace(/\/+$/, '');
  const path = `${base}/hud_run.json`;
  try {
    const contents = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is ShotLogRecord => {
      return Boolean(item && typeof item === 'object');
    });
  } catch (error) {
    return [];
  }
}

function normalizeFeatureKind(value: unknown): FeatureKind {
  if (typeof value !== 'string') {
    return 'other';
  }
  const token = value.trim().toLowerCase();
  if (token.includes('green')) {
    return 'green';
  }
  if (token.includes('fairway')) {
    return 'fairway';
  }
  if (token.includes('bunker')) {
    return 'bunker';
  }
  if (token.includes('hazard') || token.includes('water')) {
    return 'hazard';
  }
  if (token.includes('cart')) {
    return 'cartpath';
  }
  return 'other';
}

function fromLocalPoint(origin: { lat: number; lon: number }, point: LocalPoint): GeoPoint {
  const lat0 = Number.isFinite(origin.lat) ? origin.lat : 0;
  const lon0 = Number.isFinite(origin.lon) ? origin.lon : 0;
  const latRad = (lat0 * Math.PI) / 180;
  const lat = lat0 + ((point.y / EARTH_RADIUS_M) * 180) / Math.PI;
  const denom = Math.cos(latRad) || 1;
  const lon = lon0 + ((point.x / (EARTH_RADIUS_M * denom)) * 180) / Math.PI;
  return { lat, lon };
}

type LandingOutcome = {
  carry: number;
  landGeo: GeoPoint | null;
  endDist: number;
  holed: boolean;
};

function computeLandingOutcome(
  session: ShotSessionState,
  origin: GeoPoint | null,
): LandingOutcome | null {
  if (!session.landing) {
    return null;
  }
  const carry = Math.hypot(session.landing.x - session.origin.x, session.landing.y - session.origin.y);
  const landGeo = origin ? fromLocalPoint(origin, session.landing) : null;
  let endDist: number | null = null;
  if (landGeo && session.pin) {
    const dist = distanceMeters(landGeo, session.pin);
    if (Number.isFinite(dist)) {
      endDist = Math.max(0, dist);
    }
  }
  if (endDist === null) {
    const fallback = Math.max(0, session.baseDistance - carry);
    endDist = fallback;
  }
  const holed = endDist <= HOLED_THRESHOLD_M;
  return { carry, landGeo, endDist, holed };
}

function directionFromBearing(bearing: number, heading: number): HazardDirection {
  const delta = ((bearing - heading + 540) % 360) - 180;
  return delta < 0 ? 'LEFT' : 'RIGHT';
}

function toLocalPoint(origin: { lat: number; lon: number }, coord: [number, number]): LocalPoint {
  const [lon, lat] = coord;
  return toLocalENU(origin, { lat, lon });
}

function firstCoordinateFromGeometry(geometry: { type?: string; coordinates?: unknown }): [number, number] | null {
  if (!geometry || typeof geometry.type !== 'string') {
    return null;
  }
  const type = geometry.type.toLowerCase();
  const coords = geometry.coordinates;
  if (!coords) {
    return null;
  }
  if (type === 'point' && Array.isArray(coords) && coords.length >= 2) {
    return [Number(coords[0]), Number(coords[1])];
  }
  if (type === 'linestring' && Array.isArray(coords) && coords.length) {
    const first = coords[0] as [number, number];
    return Array.isArray(first) && first.length >= 2 ? [Number(first[0]), Number(first[1])] : null;
  }
  if (type === 'polygon' && Array.isArray(coords) && coords.length) {
    const ring = coords[0] as unknown;
    if (Array.isArray(ring) && ring.length) {
      const first = ring[0] as [number, number];
      return Array.isArray(first) && first.length >= 2 ? [Number(first[0]), Number(first[1])] : null;
    }
  }
  if (type === 'multipolygon' && Array.isArray(coords) && coords.length) {
    const polygon = coords[0] as unknown;
    if (Array.isArray(polygon) && polygon.length) {
      const ring = polygon[0] as unknown;
      if (Array.isArray(ring) && ring.length) {
        const first = ring[0] as [number, number];
        return Array.isArray(first) && first.length >= 2 ? [Number(first[0]), Number(first[1])] : null;
      }
    }
  }
  return null;
}

function deriveOrigin(
  bundle: CourseBundle,
  course: BundleIndexEntry | null,
): { lat: number; lon: number } {
  if (course) {
    const [minLon, minLat, maxLon, maxLat] = course.bbox;
    if (
      Number.isFinite(minLat) &&
      Number.isFinite(minLon) &&
      Number.isFinite(maxLat) &&
      Number.isFinite(maxLon)
    ) {
      return {
        lat: (minLat + maxLat) / 2,
        lon: (minLon + maxLon) / 2,
      };
    }
  }
  for (const feature of bundle.features) {
    const geometry = feature && typeof feature === 'object' ? (feature as { geometry?: unknown }).geometry : null;
    if (geometry && typeof geometry === 'object') {
      const first = firstCoordinateFromGeometry(geometry as { type?: string; coordinates?: unknown });
      if (first) {
        const [lon, lat] = first;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { lat, lon };
        }
      }
    }
  }
  return { lat: 0, lon: 0 };
}

function buildOverlayData(
  bundle: CourseBundle | null,
  course: BundleIndexEntry | null,
): OverlayData {
  if (!bundle) {
    return { features: [], points: [] };
  }
  const origin = deriveOrigin(bundle, course);
  const features: OverlayFeature[] = [];
  const points: LocalPoint[] = [];

  const appendSegment = (segments: LocalSegment[], start: LocalPoint, end: LocalPoint) => {
    segments.push({ start, end });
    points.push(start, end);
  };

  bundle.features.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }
    const record = raw as Record<string, unknown>;
    const geometry = record.geometry as { type?: string; coordinates?: unknown } | undefined;
    if (!geometry || typeof geometry.type !== 'string') {
      return;
    }
    const featureId = typeof record.id === 'string' ? record.id : `feature-${idx}`;
    const kindSource = record.type ?? (record.properties as { kind?: unknown } | undefined)?.kind;
    const kind = normalizeFeatureKind(kindSource);
    const overlay: OverlayFeature = {
      id: featureId,
      kind,
      segments: [],
      polygonRings: [],
    };
    const type = geometry.type.toLowerCase();
    const coords = geometry.coordinates;
    if (!coords) {
      return;
    }
    if (type === 'polygon' && Array.isArray(coords)) {
      for (const ring of coords as unknown[]) {
        if (!Array.isArray(ring) || ring.length < 2) {
          continue;
        }
        const localRing: LocalPoint[] = [];
        for (const coord of ring as unknown[]) {
          if (!Array.isArray(coord) || coord.length < 2) {
            continue;
          }
          const local = toLocalPoint(origin, [Number(coord[0]), Number(coord[1])]);
          localRing.push(local);
          points.push(local);
        }
        if (!localRing.length) {
          continue;
        }
        overlay.polygonRings.push(localRing.map((pt) => [pt.x, pt.y]));
        for (let i = 0; i < localRing.length; i += 1) {
          const current = localRing[i];
          const next = localRing[(i + 1) % localRing.length];
          appendSegment(overlay.segments, current, next);
        }
      }
    } else if (type === 'multipolygon' && Array.isArray(coords)) {
      for (const polygon of coords as unknown[]) {
        if (!Array.isArray(polygon)) {
          continue;
        }
        (polygon as unknown[]).forEach((ring) => {
          if (!Array.isArray(ring) || ring.length < 2) {
            return;
          }
          const localRing: LocalPoint[] = [];
          for (const coord of ring as unknown[]) {
            if (!Array.isArray(coord) || coord.length < 2) {
              continue;
            }
            const local = toLocalPoint(origin, [Number(coord[0]), Number(coord[1])]);
            localRing.push(local);
            points.push(local);
          }
          if (!localRing.length) {
            return;
          }
          overlay.polygonRings.push(localRing.map((pt) => [pt.x, pt.y]));
          for (let i = 0; i < localRing.length; i += 1) {
            const current = localRing[i];
            const next = localRing[(i + 1) % localRing.length];
            appendSegment(overlay.segments, current, next);
          }
        });
      }
    } else if (type === 'linestring' && Array.isArray(coords)) {
      const localLine: LocalPoint[] = [];
      for (const coord of coords as unknown[]) {
        if (!Array.isArray(coord) || coord.length < 2) {
          continue;
        }
        const local = toLocalPoint(origin, [Number(coord[0]), Number(coord[1])]);
        localLine.push(local);
        points.push(local);
      }
      for (let i = 0; i < localLine.length - 1; i += 1) {
        appendSegment(overlay.segments, localLine[i], localLine[i + 1]);
      }
    } else if (type === 'multilinestring' && Array.isArray(coords)) {
      for (const line of coords as unknown[]) {
        if (!Array.isArray(line)) {
          continue;
        }
        const localLine: LocalPoint[] = [];
        for (const coord of line as unknown[]) {
          if (!Array.isArray(coord) || coord.length < 2) {
            continue;
          }
          const local = toLocalPoint(origin, [Number(coord[0]), Number(coord[1])]);
          localLine.push(local);
          points.push(local);
        }
        for (let i = 0; i < localLine.length - 1; i += 1) {
          appendSegment(overlay.segments, localLine[i], localLine[i + 1]);
        }
      }
    }
    if (overlay.segments.length || overlay.polygonRings.length) {
      features.push(overlay);
    }
  });

  return { features, points };
}

type GhostTrajectoryViewProps = {
  profile: GhostTrajectoryResult;
  progress: Animated.Value;
  range: number;
  lateral: number;
  errors: GhostErrorVector | null;
};

const GhostTrajectoryView: React.FC<GhostTrajectoryViewProps> = ({
  profile,
  progress,
  range,
  lateral,
  errors,
}) => {
  if (!profile.path.length) {
    return null;
  }
  const width = 260;
  const height = 140;
  const padding = 16;
  const maxX = profile.path[profile.path.length - 1]?.x ?? range ?? 1;
  const maxY = profile.path.reduce((acc, sample) => Math.max(acc, sample.y), 0);
  const verticalBasis = Math.max(maxY, maxX * 0.25, 1);
  const scaleX = maxX > 0 ? (width - padding * 2) / maxX : 1;
  const scaleY = (height - padding * 2) / verticalBasis;
  const screenPoints = profile.path.map((sample) => ({
    x: padding + sample.x * scaleX,
    y: height - padding - sample.y * scaleY,
  }));
  const apexPoint = screenPoints[profile.apexIdx] ?? null;
  const inputRange = profile.path.map((_, idx) => idx / Math.max(profile.path.length - 1, 1));
  const outputRangeX = screenPoints.map((pt) => pt.x);
  const outputRangeY = screenPoints.map((pt) => pt.y);
  const animatedX = progress.interpolate({ inputRange, outputRange: outputRangeX });
  const animatedY = progress.interpolate({ inputRange, outputRange: outputRangeY });
  const impactPoint = screenPoints[screenPoints.length - 1];
  const groundY = height - padding;
  const formatSigned = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));
  const errorColor = (value: number | null | undefined) => {
    if (value == null) {
      return '#cbd5f5';
    }
    const magnitude = Math.abs(value);
    if (magnitude < 0.8) {
      return '#22d3ee';
    }
    return value > 0 ? '#f97316' : '#38bdf8';
  };

  return (
    <View style={styles.ghostContainer}>
      <Text style={styles.ghostTitle}>Ghost trajectory</Text>
      <View style={[styles.ghostGraph, { width, height }]}> 
        <View
          style={{
            position: 'absolute',
            left: padding,
            right: padding,
            top: groundY,
            height: 2,
            backgroundColor: '#1f2937',
          }}
        />
        {screenPoints.slice(0, -1).map((start, idx) => {
          const end = screenPoints[idx + 1];
          if (!end) {
            return null;
          }
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const length = Math.hypot(dx, dy);
          if (length <= 0) {
            return null;
          }
          const progressRatio = idx / (screenPoints.length - 1 || 1);
          const opacity = 0.35 + (1 - progressRatio) * 0.5;
          return (
            <View
              // eslint-disable-next-line react/no-array-index-key
              key={`ghost-profile-${idx}`}
              style={{
                position: 'absolute',
                left: start.x,
                top: start.y,
                width: length,
                height: 3,
                backgroundColor: `rgba(59,130,246,${opacity})`,
                transform: [
                  { translateX: 0 },
                  { translateY: -1.5 },
                  { rotate: `${Math.atan2(dy, dx)}rad` },
                ],
              }}
            />
          );
        })}
        {apexPoint ? (
          <View
            style={{
              position: 'absolute',
              left: apexPoint.x,
              top: apexPoint.y,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#60a5fa',
              borderWidth: 2,
              borderColor: '#1d4ed8',
              transform: [{ translateX: -5 }, { translateY: -5 }],
            }}
          />
        ) : null}
        {impactPoint ? (
          <View
            style={{
              position: 'absolute',
              left: impactPoint.x,
              top: groundY,
              width: Math.max(8, profile.impactEllipse.major_m * scaleX * 0.4),
              height: Math.max(6, profile.impactEllipse.minor_m * scaleX * 0.3),
              borderRadius: Math.max(3, (profile.impactEllipse.minor_m * scaleX * 0.3) / 2),
              borderWidth: 1,
              borderColor: 'rgba(96,165,250,0.9)',
              backgroundColor: 'rgba(96,165,250,0.2)',
              transform: [
                { translateX: -Math.max(4, (profile.impactEllipse.major_m * scaleX * 0.4) / 2) },
                { translateY: -Math.max(3, (profile.impactEllipse.minor_m * scaleX * 0.3) / 2) },
              ],
            }}
          />
        ) : null}
        <Animated.View
          style={[
            styles.ghostMarker,
            {
              transform: [
                { translateX: Animated.subtract(animatedX, 6) },
                { translateY: Animated.subtract(animatedY, 6) },
              ],
            },
          ]}
        />
      </View>
      <View style={styles.ghostStatsRow}>
        <View style={styles.ghostStat}>
          <Text style={styles.ghostLabel}>Range</Text>
          <Text style={styles.ghostValue}>{`${range.toFixed(1)} m`}</Text>
        </View>
        <View style={styles.ghostStat}>
          <Text style={styles.ghostLabel}>Drift</Text>
          <Text style={styles.ghostValue}>{`${formatSigned(lateral)} m`}</Text>
        </View>
      </View>
      <View style={styles.ghostStatsRow}>
        <View style={styles.ghostStat}>
          <Text style={styles.ghostLabel}>Longitudinal</Text>
          <Text style={[styles.ghostValue, { color: errorColor(errors?.long ?? null) }]}>
            {errors ? `${formatSigned(errors.long)} m` : '—'}
          </Text>
        </View>
        <View style={styles.ghostStat}>
          <Text style={styles.ghostLabel}>Lateral</Text>
          <Text style={[styles.ghostValue, { color: errorColor(errors?.lateral ?? null) }]}>
            {errors
              ? `${Math.abs(errors.lateral).toFixed(1)} m ${errors.lateral >= 0 ? 'RIGHT' : 'LEFT'}`
              : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
};

type GhostOverlay = {
  profile: GhostTrajectoryResult;
  range: number;
  groundPath: LocalPoint[];
  impactCenter: LocalPoint;
  dirUnit: LocalPoint;
};

type GhostErrorVector = {
  long: number;
  lateral: number;
};

type MapOverlayProps = {
  data: OverlayData;
  player: LocalPoint;
  heading: number;
  offline: boolean;
  hazard: { distance: number; direction: HazardDirection } | null;
  markLandingActive: boolean;
  onSelectLanding?: (point: LocalPoint) => void;
  landing?: LocalPoint | null;
  ghost?: GhostOverlay | null;
  onLongPressPin?: () => void;
  pinDropEnabled?: boolean;
};

const MapOverlay: React.FC<MapOverlayProps> = ({
  data,
  player,
  heading,
  offline,
  hazard,
  markLandingActive,
  onSelectLanding,
  landing,
  ghost,
  onLongPressPin,
  pinDropEnabled,
}) => {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 340);
  const padding = 20;
  const extendedPoints = useMemo(() => {
    const base = data.points.length ? [...data.points] : [];
    if (ghost?.groundPath?.length) {
      base.push(...ghost.groundPath);
    }
    if (ghost?.impactCenter) {
      base.push(ghost.impactCenter);
    }
    return base;
  }, [data.points, ghost?.groundPath, ghost?.impactCenter]);
  const allPoints = extendedPoints.length ? extendedPoints.concat(player) : [player];
  const bounds = allPoints.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  );
  const extentX = bounds.maxX - bounds.minX;
  const extentY = bounds.maxY - bounds.minY;
  const maxExtent = Math.max(extentX, extentY, 20);
  const scale = (size - padding * 2) / maxExtent;
  const center = {
    x: (bounds.maxX + bounds.minX) / 2,
    y: (bounds.maxY + bounds.minY) / 2,
  };
  const toScreen = (point: LocalPoint) => ({
    x: size / 2 + (point.x - center.x) * scale,
    y: size / 2 - (point.y - center.y) * scale,
  });
  const playerScreen = toScreen(player);

  const headingRad = (heading * Math.PI) / 180;
  const headingRadius = (size - padding * 2) / 2;
  const headingPos = {
    x: size / 2 + Math.sin(headingRad) * headingRadius,
    y: size / 2 - Math.cos(headingRad) * headingRadius,
  };

  const ghostScreenPath = ghost?.groundPath?.map((point) => toScreen(point)) ?? [];
  const ghostImpactScreen = ghost ? toScreen(ghost.impactCenter) : null;
  const ghostAngle = ghost ? Math.atan2(ghost.dirUnit.y, ghost.dirUnit.x) : 0;
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const setLongPress = useCallback(
    (fn: () => void, ms = 650) => {
      clearLongPress();
      longPressTimeoutRef.current = setTimeout(() => {
        longPressTimeoutRef.current = null;
        fn();
      }, ms);
    },
    [clearLongPress],
  );

  useEffect(() => clearLongPress(), [clearLongPress]);

  const handleRelease = useCallback(
    (event: {
      nativeEvent: { locationX: number; locationY: number };
    }) => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        clearLongPress();
        return;
      }
      clearLongPress();
      if (!markLandingActive || !onSelectLanding) {
        return;
      }
      const { locationX, locationY } = event.nativeEvent;
      const relativeX = locationX - size / 2;
      const relativeY = locationY - size / 2;
      const localX = center.x + relativeX / scale;
      const localY = center.y - relativeY / scale;
      onSelectLanding({ x: localX, y: localY });
    },
    [center.x, center.y, clearLongPress, markLandingActive, onSelectLanding, scale, size],
  );

  const handleGrant = useCallback(() => {
    if (!pinDropEnabled || !onLongPressPin) {
      longPressTriggeredRef.current = false;
      clearLongPress();
      return;
    }
    longPressTriggeredRef.current = false;
    setLongPress(() => {
      longPressTriggeredRef.current = true;
      onLongPressPin();
    }, 650);
  }, [clearLongPress, onLongPressPin, pinDropEnabled, setLongPress]);

  const handleTerminate = useCallback(() => {
    clearLongPress();
    longPressTriggeredRef.current = false;
  }, [clearLongPress]);

  return (
    <View
      style={[styles.mapContainer, { width: size, height: size }]}
      pointerEvents="auto"
      onStartShouldSetResponder={() => Boolean(markLandingActive || pinDropEnabled)}
      onResponderGrant={handleGrant}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleTerminate}
    >
      <View style={styles.mapBackground} />
      {data.features.map((feature) =>
        feature.segments.map((segment, idx) => {
          const start = toScreen(segment.start);
          const end = toScreen(segment.end);
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const length = Math.hypot(dx, dy);
          if (!Number.isFinite(length) || length < 1) {
            return null;
          }
          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;
          const angle = Math.atan2(dy, dx);
          const stroke = FEATURE_STROKES[feature.kind] ?? 3;
          return (
            <View
              key={`${feature.id}-segment-${idx}`}
              style={{
                position: 'absolute',
                left: midX,
                top: midY,
                width: length,
                height: stroke,
                backgroundColor: FEATURE_COLORS[feature.kind] ?? FEATURE_COLORS.other,
                opacity: 0.75,
                borderRadius: stroke / 2,
                transform: [
                  { translateX: -length / 2 },
                  { translateY: -stroke / 2 },
                  { rotate: `${angle}rad` },
                ],
              }}
            />
          );
        }),
      )}
      {ghostScreenPath.length > 1
        ? ghostScreenPath.slice(0, -1).map((start, idx) => {
            const end = ghostScreenPath[idx + 1];
            if (!end) {
              return null;
            }
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.hypot(dx, dy);
            if (length <= 0) {
              return null;
            }
            const progress = idx / (ghostScreenPath.length - 1 || 1);
            const opacity = 0.25 + (1 - progress) * 0.5;
            return (
              <View
                // eslint-disable-next-line react/no-array-index-key
                key={`ghost-${idx}`}
                style={{
                  position: 'absolute',
                  left: start.x,
                  top: start.y,
                  width: length,
                  height: 3,
                  backgroundColor: `rgba(96,165,250,${opacity})`,
                  transform: [
                    { translateX: 0 },
                    { translateY: -1.5 },
                    { rotate: `${Math.atan2(dy, dx)}rad` },
                  ],
                }}
              />
            );
          })
        : null}
      {ghost && ghostImpactScreen ? (
        <View
          style={{
            position: 'absolute',
            left: ghostImpactScreen.x,
            top: ghostImpactScreen.y,
            width: Math.max(12, ghost.profile.impactEllipse.major_m * scale),
            height: Math.max(8, ghost.profile.impactEllipse.minor_m * scale),
            borderRadius: Math.max(4, (ghost.profile.impactEllipse.minor_m * scale) / 2),
            borderWidth: 1,
            borderColor: 'rgba(96,165,250,0.9)',
            backgroundColor: 'rgba(96,165,250,0.18)',
            transform: [
              { translateX: -Math.max(6, (ghost.profile.impactEllipse.major_m * scale) / 2) },
              { translateY: -Math.max(4, (ghost.profile.impactEllipse.minor_m * scale) / 2) },
              { rotate: `${ghostAngle}rad` },
            ],
          }}
        />
      ) : null}
      <View
        style={{
          position: 'absolute',
          left: playerScreen.x,
          top: playerScreen.y,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: '#2563eb',
          borderWidth: 2,
          borderColor: '#ffffff',
          transform: [{ translateX: -8 }, { translateY: -8 }],
        }}
      />
      {landing ? (
        <View
          style={{
            position: 'absolute',
            left: toScreen(landing).x,
            top: toScreen(landing).y,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: '#f472b6',
            borderWidth: 2,
            borderColor: '#0f172a',
            transform: [{ translateX: -7 }, { translateY: -7 }],
          }}
        />
      ) : null}
      <View
        style={{
          position: 'absolute',
          left: headingPos.x,
          top: headingPos.y,
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: '#f97316',
          borderWidth: 2,
          borderColor: '#0f172a',
          transform: [{ translateX: -6 }, { translateY: -6 }],
        }}
      />
      {offline ? (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>Offline</Text>
        </View>
      ) : null}
      {markLandingActive ? (
        <View style={styles.markLandingBadge}>
          <Text style={styles.markLandingText}>Tap map to mark landing</Text>
        </View>
      ) : null}
      <View style={styles.hazardBadge}>
        <Text style={styles.hazardLabel}>Nearest hazard</Text>
        <Text style={styles.hazardValue}>
          {hazard ? `${hazard.distance.toFixed(1)} m ${hazard.direction}` : '—'}
        </Text>
      </View>
    </View>
  );
};

type CoursePickerProps = {
  courses: BundleIndexEntry[];
  selected: string | null;
  loading: boolean;
  onSelect: (courseId: string) => void;
  onRefresh: () => void;
  error: string | null;
  suggestions: CourseSearchResult[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSuggestionSelect: (courseId: string) => void;
};

const CoursePicker: React.FC<CoursePickerProps> = ({
  courses,
  selected,
  loading,
  onSelect,
  onRefresh,
  error,
  suggestions,
  searchQuery,
  onSearchChange,
  onSuggestionSelect,
}) => {
  return (
    <View style={styles.pickerContainer}>
      <View style={styles.pickerHeader}>
        <Text style={styles.sectionTitle}>Courses</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchContainer}>
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search courses…"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      {suggestions.length ? (
        <View style={styles.suggestionList}>
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={suggestion.id}
              onPress={() => onSuggestionSelect(suggestion.id)}
              style={[
                styles.suggestionItem,
                index === suggestions.length - 1 ? styles.suggestionItemLast : null,
              ]}
            >
              <View style={styles.suggestionTextBlock}>
                <Text style={styles.suggestionName}>{suggestion.name}</Text>
              </View>
              <Text style={styles.suggestionDistance}>
                {formatSearchDistance(suggestion.dist_km)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {loading ? <ActivityIndicator size="small" color="#60a5fa" /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.courseScroll}>
        {courses.map((course) => {
          const isSelected = course.courseId === selected;
          return (
            <TouchableOpacity
              key={course.courseId}
              onPress={() => onSelect(course.courseId)}
              style={[
                styles.courseButton,
                isSelected ? styles.courseButtonActive : null,
              ]}
            >
              <Text style={[styles.courseButtonText, isSelected ? styles.courseButtonTextActive : null]}>
                {course.name ?? course.courseId}
              </Text>
            </TouchableOpacity>
          );
        })}
        {!courses.length && !loading && !error ? (
          <Text style={styles.placeholderText}>No bundles yet</Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

const QAArHudOverlayScreen: React.FC = () => {
  const qaEnabled = qaHudEnabled();
  const autoCourseRef = useRef<AutoCourseController | null>(null);
  if (!autoCourseRef.current) {
    autoCourseRef.current = new AutoCourseController();
  }
  const [courses, setCourses] = useState<BundleIndexEntry[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHere, setSearchHere] = useState<GeoPoint | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [roundShareUploading, setRoundShareUploading] = useState(false);
  const [roundShareMessage, setRoundShareMessage] = useState<string | null>(null);
  const [roundShareError, setRoundShareError] = useState(false);
  const [autoPickEnabled, setAutoPickEnabled] = useState(false);
  const [autoPickAvailable, setAutoPickAvailable] = useState(true);
  const [autoPickCandidate, setAutoPickCandidate] = useState<AutoCourseCandidate | null>(null);
  const [autoPickPrompt, setAutoPickPrompt] = useState<AutoPickPrompt | null>(null);
  const [autoPickError, setAutoPickError] = useState<string | null>(null);
  const [playerPosition, setPlayerPosition] = useState<LocalPoint>({ x: 0, y: 0 });
  const [gnssFix, setGnssFix] = useState<LocationFix | null>(null);
  const [heading, setHeading] = useState(0);
  const [pin, setPin] = useState<GeoPoint | null>(null);
  const [pinMetrics, setPinMetrics] = useState<{ distance: number; bearing: number } | null>(null);
  const [rcGreenSectionsEnabled, setRcGreenSectionsEnabled] = useState(true);
  const [rcGreenPinDropEnabled, setRcGreenPinDropEnabled] = useState(true);
  const [hazardInfo, setHazardInfo] = useState<{ id: string; type: string; dist_m: number; bearing: number } | null>(null);
  const [plannerExpanded, setPlannerExpanded] = useState(false);
  const [plannerInputs, setPlannerInputs] = useState({
    temperatureC: 20,
    altitude_m: 0,
    wind_mps: 0,
    wind_from_deg: 0,
    slope_dh_m: 0,
  });
  const [plannerResult, setPlannerResult] = useState<PlanOut | null>(null);
  const [shotSession, setShotSession] = useState<ShotSessionState | null>(null);
  const [markLandingArmed, setMarkLandingArmed] = useState(false);
  const [qaBag, setQaBag] = useState<Bag>(() => effectiveBag());
  const [storedDispersion, setStoredDispersion] = useState<DispersionSnapshot | null>(null);
  const [dispersionPreview, setDispersionPreview] = useState<
    Partial<Record<ClubId, ClubDispersion>> | null
  >(null);
  const [dispersionLoading, setDispersionLoading] = useState(false);
  const [dispersionSaving, setDispersionSaving] = useState(false);
  const [dispersionMessage, setDispersionMessage] = useState<string | null>(null);
  const [userBagActive, setUserBagActive] = useState<Bag | null>(null);
  const [userBagLoaded, setUserBagLoaded] = useState(false);
  const [bagCalibExpanded, setBagCalibExpanded] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState<CalibOut | null>(null);
  const [calibrationLoading, setCalibrationLoading] = useState(false);
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(null);
  const [homographySnapshot, setHomographySnapshot] = useState<HomographySnapshot | null>(null);
  const [calibrationWizardVisible, setCalibrationWizardVisible] = useState(false);
  const [landingProposal, setLandingProposal] = useState<LandingProposal | null>(null);
  const [landingState, setLandingState] = useState<AutoLandingState>('IDLE');
  const [coachStyle, setCoachStyle] = useState<CoachStyle>(defaultCoachStyle);
  const [caddieRiskMode, setCaddieRiskMode] = useState<CaddieRiskMode>('normal');
  const [caddieGoForGreen, setCaddieGoForGreen] = useState(false);
  const [caddieUseMC, setCaddieUseMC] = useState(true);
  const [caddieSamples, setCaddieSamples] = useState(800);
  const [mcSliderWidth, setMcSliderWidth] = useState(1);
  const mcSliderMetricsRef = useRef<{ left: number }>({ left: 0 });
  const lastMcTelemetryRef = useRef<string | null>(null);
  const lastSpokenPlanRef = useRef<string | null>(null);
  const rcDefaults = useMemo(() => getCaddieRc(), []);
  const [coachLearningEnabled, setCoachLearningEnabled] = useState(rcDefaults.coach.learningEnabled);
  const [coachProfile, setCoachProfile] = useState<PlayerProfile | null>(null);
  const [coachProfileId, setCoachProfileId] = useState<string | null>(null);
  const lastProfileUpdateShotRef = useRef<string | null>(null);
  const tournamentSafe = useMemo(() => readTournamentSafe(), []);
  const greenHintsEnabled = useMemo(
    () => !tournamentSafe && rcGreenSectionsEnabled,
    [rcGreenSectionsEnabled, tournamentSafe],
  );
  const pinDropUiEnabled = useMemo(
    () => !tournamentSafe && rcGreenPinDropEnabled,
    [rcGreenPinDropEnabled, tournamentSafe],
  );
  const [caddieRollout, setCaddieRollout] = useState<CaddieRolloutState>({
    ready: false,
    deviceId: 'unknown-device',
    mc: false,
    advice: true,
    tts: false,
    percents: { mc: 0, advice: 100, tts: 0 },
  });
  const lastPlanContextRef = useRef<
    { key: string; mcUsed: boolean; hadAdvice: boolean; ttsUsed: boolean } | null
  >(null);
  const planAdoptedRef = useRef(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snapshot = await loadLearnedDispersion();
        if (!mounted) {
          return;
        }
        if (snapshot) {
          setStoredDispersion(snapshot);
          setDispersionPreview(cloneDispersionMap(snapshot.clubs));
        } else {
          setStoredDispersion(null);
          setDispersionPreview(null);
        }
      } catch (error) {
        if (mounted) {
          setStoredDispersion(null);
          setDispersionPreview(null);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  const caddieMcRolloutEnabled = caddieRollout.mc;
  const caddieAdviceRolloutEnabled = caddieRollout.advice;
  const caddieTtsRolloutEnabled = caddieRollout.tts;
  const caddieMcActive = caddieMcRolloutEnabled && caddieUseMC;
  useEffect(() => {
    if (!caddieMcRolloutEnabled && caddieUseMC) {
      setCaddieUseMC(false);
    }
  }, [caddieMcRolloutEnabled, caddieUseMC]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await loadHomographySnapshot();
        if (!cancelled) {
          setHomographySnapshot(snapshot);
        }
      } catch {
        if (!cancelled) {
          setHomographySnapshot(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await lockExposure();
      } catch {
        // ignore missing exposure controls
      }
      try {
        await lockWhiteBalance();
      } catch {
        // ignore missing white balance controls
      }
    })();
    return () => {
      unlockAll().catch(() => {});
    };
  }, []);

  const calibrationHealth = useMemo<CalibrationHealth>(
    () => getCalibrationHealth(homographySnapshot),
    [homographySnapshot],
  );
  const calibrationStale = useMemo(
    () => (homographySnapshot ? isHomographySnapshotStale(homographySnapshot) : true),
    [homographySnapshot],
  );
  const calibrationHealthLabel = useMemo(() => {
    switch (calibrationHealth) {
      case 'good':
        return 'Good';
      case 'ok':
        return 'OK';
      default:
        return 'Poor';
    }
  }, [calibrationHealth]);
  const calibrationChipToneStyle = useMemo(() => {
    switch (calibrationHealth) {
      case 'good':
        return styles.calibrationChipGood;
      case 'ok':
        return styles.calibrationChipOk;
      default:
        return styles.calibrationChipPoor;
    }
  }, [calibrationHealth]);
  const calibrationSummaryText = useMemo(() => {
    if (!homographySnapshot) {
      return 'Run the wizard to map ground distance for HUD overlays.';
    }
    const baseline = Math.abs(homographySnapshot.baselineMeters).toFixed(1);
    const angle = Math.round(Math.abs(homographySnapshot.baselineAngleDeg));
    const saved = homographySnapshot.computedAt
      ? new Date(homographySnapshot.computedAt).toLocaleDateString()
      : null;
    const suffix = saved ? ` • Saved ${saved}` : '';
    return `Baseline ${baseline} m • Angle ${angle}°${suffix}`;
  }, [homographySnapshot]);
  const showCalibrationNudge = useMemo(
    () => !homographySnapshot || calibrationStale,
    [homographySnapshot, calibrationStale],
  );
  const calibrationNudgeText = useMemo(() => {
    if (!homographySnapshot) {
      return 'No calibration found. Launch the wizard before starting a session.';
    }
    return 'Calibration is older than 14 days. Re-run the wizard to stay aligned.';
  }, [homographySnapshot, calibrationStale]);

  const openCalibrationWizard = useCallback(() => {
    setCalibrationWizardVisible(true);
  }, []);
  const handleCalibrationWizardDismiss = useCallback(() => {
    setCalibrationWizardVisible(false);
  }, []);
  const handleCalibrationWizardSaved = useCallback(
    (snapshot: HomographySnapshot) => {
      setHomographySnapshot(snapshot);
      setCalibrationWizardVisible(false);
    },
    [],
  );

  const updateSamplesFromValue = useCallback((value: number) => {
    const clamped = Math.max(MC_SAMPLES_MIN, Math.min(MC_SAMPLES_MAX, value));
    const stepped = Math.round(clamped / MC_SAMPLES_STEP) * MC_SAMPLES_STEP;
    setCaddieSamples(stepped);
  }, []);

  const updateSamplesFromPageX = useCallback(
    (pageX: number) => {
      const width = mcSliderWidth;
      if (width <= 0) {
        return;
      }
      const left = mcSliderMetricsRef.current.left;
      const relative = Math.max(0, Math.min(width, pageX - left));
      const ratio = relative / width;
      const raw = MC_SAMPLES_MIN + ratio * (MC_SAMPLES_MAX - MC_SAMPLES_MIN);
      updateSamplesFromValue(raw);
    },
    [mcSliderWidth, updateSamplesFromValue],
  );

  const mcPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          mcSliderMetricsRef.current.left = event.nativeEvent.pageX - event.nativeEvent.locationX;
          updateSamplesFromPageX(event.nativeEvent.pageX);
        },
        onPanResponderMove: (event) => {
          updateSamplesFromPageX(event.nativeEvent.pageX);
        },
      }),
    [updateSamplesFromPageX],
  );

  const handleSliderLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.max(1, event.nativeEvent.layout.width);
    setMcSliderWidth(width);
  }, []);

  const applyCoachStyle = useCallback((patch: Partial<CoachStyle>) => {
    setCoachStyle((prev) => {
      const nextLanguage = patch.language ?? prev.language;
      let voiceSource: CoachVoiceSettings | undefined;
      if (patch.voice === null) {
        voiceSource = undefined;
      } else if (patch.voice !== undefined) {
        voiceSource = { ...(prev.voice ?? {}), ...patch.voice };
      } else {
        voiceSource = prev.voice;
      }
      let voice = sanitizeVoiceSettings(voiceSource);
      if (voice && !voice.lang) {
        voice = { ...voice, lang: DEFAULT_VOICE_BY_LANGUAGE[nextLanguage] };
      }
      const wantsVoice =
        patch.format === 'tts' ||
        (patch.format === undefined && prev.format === 'tts') ||
        (patch.voice !== undefined && patch.voice !== null);
      if (!voice && wantsVoice) {
        voice = { lang: DEFAULT_VOICE_BY_LANGUAGE[nextLanguage] };
      }
      const nextBase: CoachStyle = {
        ...prev,
        ...patch,
        language: nextLanguage,
        voice,
      };
      const next =
        nextBase.tone === 'pep'
          ? nextBase
          : {
              ...nextBase,
              emoji: false,
            };
      void saveCoachStyle(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    loadCoachStyle()
      .then((stored) => {
        if (!active) {
          return;
        }
        setCoachStyle({ ...stored, emoji: stored.emoji ?? false });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    resumePendingUploads().catch(() => {});
  }, []);
  useEffect(() => {
    if (!coachLearningEnabled) {
      setCoachProfile(null);
      setCoachProfileId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const id = await resolveCoachProfileId();
        if (cancelled) {
          return;
        }
        setCoachProfileId(id);
        const profile = await loadPlayerProfile(id);
        if (!cancelled) {
          setCoachProfile(profile);
        }
      } catch {
        if (!cancelled) {
          setCoachProfile(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coachLearningEnabled]);
  useEffect(() => {
    if (!coachProfile) {
      return;
    }
    setCoachStyle((prev) => ({
      ...prev,
      tone: coachProfile.style.tone,
      verbosity: coachProfile.style.verbosity,
    }));
    setCaddieRiskMode((prev) => {
      const next = pickRisk(coachProfile);
      return next;
    });
  }, [coachProfile]);
  const searchResults = useMemo(() => {
    if (!courses.length) {
      return [] as CourseSearchResult[];
    }
    return searchCourses({ courses }, searchQuery, searchHere ?? undefined);
  }, [courses, searchQuery, searchHere]);
  const selectedCourse = useMemo(
    () => courses.find((c) => c.courseId === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );
  const overlayData = useMemo(() => buildOverlayData(bundle, selectedCourse), [bundle, selectedCourse]);
  const overlayOrigin = useMemo(
    () => (bundle ? deriveOrigin(bundle, selectedCourse) : null),
    [bundle, selectedCourse],
  );
  const playerLatLon = useMemo(
    () => (overlayOrigin ? fromLocalPoint(overlayOrigin, playerPosition) : null),
    [overlayOrigin, playerPosition],
  );
  useEffect(() => {
    if (!playerLatLon) {
      return;
    }
    setSearchHere((prev) => {
      if (
        prev &&
        Math.abs(prev.lat - playerLatLon.lat) < 1e-6 &&
        Math.abs(prev.lon - playerLatLon.lon) < 1e-6
      ) {
        return prev;
      }
      return { lat: playerLatLon.lat, lon: playerLatLon.lon };
    });
  }, [playerLatLon?.lat, playerLatLon?.lon]);
  const camera = useMemo(() => createCameraStub({ fps: 15 }), []);
  const defaultQaBag = useMemo(() => defaultBag(), []);
  const formatDelta = useCallback((value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1)), []);
  const formatSg = useCallback((value: number | null | undefined) => {
    if (!Number.isFinite(value ?? Number.NaN)) {
      return 'n/a';
    }
    const numeric = Number(value);
    return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}`;
  }, []);
  const formatEv = useCallback((value: number | null | undefined) => {
    if (!Number.isFinite(value ?? Number.NaN)) {
      return '—';
    }
    return Number(value).toFixed(2);
  }, []);
  const wrapDegrees = useCallback((value: number) => {
    const mod = value % 360;
    return mod < 0 ? mod + 360 : mod;
  }, []);
  const adjustPlannerValue = useCallback(
    (key: PlannerInputKey, delta: number) => {
      setPlannerInputs((prev) => {
        const current = prev[key];
        let next = current + delta;
        switch (key) {
          case 'temperatureC':
            next = Math.min(45, Math.max(-20, next));
            next = Math.round(next);
            break;
          case 'altitude_m':
            next = Math.min(3000, Math.max(-200, next));
            next = Math.round(next);
            break;
          case 'wind_mps':
            next = Math.min(25, Math.max(0, next));
            next = Math.round(next * 10) / 10;
            break;
          case 'wind_from_deg':
            next = wrapDegrees(Math.round(next));
            break;
          case 'slope_dh_m':
            next = Math.min(50, Math.max(-50, next));
            next = Math.round(next * 10) / 10;
            break;
          default:
            break;
        }
        return { ...prev, [key]: next };
      });
      setPlannerResult(null);
      setShotSession(null);
      setMarkLandingArmed(false);
    },
    [setPlannerInputs, setPlannerResult, setShotSession, setMarkLandingArmed, wrapDegrees],
  );
  const handleAutoPickToggle = useCallback(
    (value: boolean) => {
      if (value) {
        if (!autoPickAvailable) {
          return;
        }
        setAutoPickError(null);
        setAutoPickCandidate(null);
        autoCourseRef.current?.reset();
        setAutoPickEnabled(true);
      } else {
        setAutoPickEnabled(false);
        setAutoPickCandidate(null);
        setAutoPickPrompt(null);
        setAutoPickError(null);
        autoCourseRef.current?.reset();
      }
    },
    [autoPickAvailable, autoCourseRef],
  );
  const handleAutoPickDismiss = useCallback(() => {
    autoCourseRef.current?.recordDismiss();
    setAutoPickPrompt(null);
  }, [autoCourseRef]);
  const handleAutoPickSwitch = useCallback(() => {
    const candidate = autoPickPrompt?.candidate;
    if (!candidate) {
      return;
    }
    autoCourseRef.current?.recordSwitch(candidate.courseId, candidate.dist_m);
    setAutoPickPrompt(null);
    setSelectedCourseId(candidate.courseId);
  }, [autoPickPrompt, autoCourseRef]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bag = await getUserBag();
        if (cancelled) {
          return;
        }
        setUserBagActive(bag);
        setQaBag(effectiveBag());
      } catch (error) {
        if (cancelled) {
          return;
        }
        setUserBagActive(null);
        setQaBag(effectiveBag());
      } finally {
        if (!cancelled) {
          setUserBagLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const handleComputePlan = useCallback(() => {
    if (!pinMetrics || pinMetrics.distance <= 0) {
      setPlannerResult(null);
      return;
    }
    const result = computePlaysLike({
      baseDistance_m: pinMetrics.distance,
      temperatureC: plannerInputs.temperatureC,
      altitude_m: plannerInputs.altitude_m,
      wind_mps: plannerInputs.wind_mps,
      wind_from_deg: plannerInputs.wind_from_deg,
      target_azimuth_deg: pinMetrics.bearing,
      slope_dh_m: plannerInputs.slope_dh_m,
    });
    setPlannerResult(result);
    setShotSession(null);
    setMarkLandingArmed(false);
  }, [pinMetrics, plannerInputs, setPlannerResult, setShotSession, setMarkLandingArmed]);
  const handleCalibrateFromSession = useCallback(() => {
    if (calibrationLoading) {
      return;
    }
    setCalibrationLoading(true);
    setCalibrationMessage(null);
    (async () => {
      try {
        const records = await loadHudRunShots();
        const shots: CalibrateShot[] = [];
        for (const record of records) {
          if (!record) {
            continue;
          }
          const club = typeof record.club === 'string' ? record.club.trim() : '';
          const carry = typeof record.carry_m === 'number' ? record.carry_m : null;
          if (!club || carry === null || !Number.isFinite(carry) || carry <= 0) {
            continue;
          }
          const shot: CalibrateShot = { club, carry_m: carry };
          if (record.notes && typeof record.notes === 'string') {
            shot.notes = record.notes;
          }
          shots.push(shot);
        }
        const result = calibrate(shots);
        setCalibrationResult(result);
        if (!shots.length) {
          setCalibrationMessage('No valid shots found in hud_run.json.');
        } else if (!result.usedShots) {
          setCalibrationMessage('Need at least 5 shots per club to compute carries.');
        } else {
          setCalibrationMessage(`Calibrated from ${result.usedShots} shots.`);
        }
      } catch (error) {
        setCalibrationResult(null);
        setCalibrationMessage('Failed to load hud_run.json.');
      } finally {
        setCalibrationLoading(false);
      }
    })();
  }, [calibrationLoading]);
  const handleSavePersonalBag = useCallback(() => {
    if (!calibrationResult || !calibrationResult.usedShots) {
      return;
    }
    const nextBag: Bag = { ...defaultQaBag };
    for (const club of CLUB_SEQUENCE) {
      nextBag[club] = qaBag[club] ?? nextBag[club];
    }
    for (const [club, value] of Object.entries(calibrationResult.suggested)) {
      if (!(CLUB_SEQUENCE as readonly string[]).includes(club)) {
        continue;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        continue;
      }
      nextBag[club as ClubId] = Math.round(numeric);
    }
    setCalibrationMessage('Saving bag…');
    (async () => {
      try {
        await saveUserBag(nextBag);
        const updated = effectiveBag();
        setQaBag(updated);
        setUserBagActive(updated);
        setCalibrationMessage('Personal bag saved for QA.');
      } catch (error) {
        setCalibrationMessage('Failed to persist personal bag.');
      }
    })();
  }, [calibrationResult, defaultQaBag, qaBag]);
  const handleHit = useCallback(() => {
    if (!plannerResult || !pinMetrics) {
      return;
    }
    const now = Date.now();
    shotIdCounterRef.current += 1;
    shotIdRef.current += 1;
    ghostTelemetryKeyRef.current = null;
    const shotId = `shot-${now}-${shotIdCounterRef.current}`;
    const suggested =
      typeof plannerResult.clubSuggested === 'string' ? plannerResult.clubSuggested : null;
    const normalizedClub =
      suggested && (CLUB_SEQUENCE as readonly string[]).includes(suggested)
        ? suggested
        : suggestClub(qaBag, plannerResult.playsLike_m);
    const shotPhase = classifyPhase(pinMetrics.distance);
    setShotSession({
      shotId,
      startedAt: now,
      headingDeg: heading,
      baseDistance: pinMetrics.distance,
      origin: { ...playerPosition },
      plan: plannerResult,
      club: normalizedClub,
      pin: pinRef.current ? { ...pinRef.current } : null,
      phase: shotPhase,
      planAdopted: planAdoptedRef.current,
      landing: undefined,
      completedAt: undefined,
      logged: false,
    });
    setLandingProposal(null);
    const heuristics = landingHeuristicsRef.current;
    const lastFix = lastLocationFixRef.current;
    const startGeo = lastFix
      ? {
          lat: lastFix.lat,
          lon: lastFix.lon,
          acc_m: lastFix.acc_m,
          accuracy_m: lastFix.accuracy_m ?? lastFix.acc_m,
          timestamp: lastFix.timestamp,
        }
      : playerLatLon
        ? {
            lat: playerLatLon.lat,
            lon: playerLatLon.lon,
            acc_m: 10,
            accuracy_m: 10,
            timestamp: now,
          }
        : null;
    if (startGeo) {
      const sample: LandingSample = {
        t: typeof startGeo.timestamp === 'number' ? startGeo.timestamp : now,
        lat: startGeo.lat,
        lon: startGeo.lon,
        acc_m: startGeo.acc_m ?? 10,
        speed_mps: 0,
        heading_deg: heading,
      };
      heuristics.beginTracking(sample);
      setLandingState(heuristics.state());
      startLandingTimeout();
    } else {
      heuristics.reset();
      setLandingState(heuristics.state());
      clearLandingTimeout();
    }
    setMarkLandingArmed(true);
  }, [
    heading,
    pinMetrics,
    plannerResult,
    playerLatLon,
    playerPosition,
    qaBag,
    startLandingTimeout,
    clearLandingTimeout,
  ]);
  const handleArmLanding = useCallback(() => {
    setShotSession((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, landing: undefined, completedAt: undefined, logged: false };
    });
    setMarkLandingArmed(true);
  }, [setMarkLandingArmed, setShotSession]);
  const handleLandingSelected = useCallback(
    (point: LocalPoint) => {
      setShotSession((prev) => {
        if (!prev) {
          return prev;
        }
        return { ...prev, landing: point, completedAt: Date.now(), logged: false };
      });
      setMarkLandingArmed(false);
      landingHeuristicsRef.current.cancel('manual');
      setLandingState(landingHeuristicsRef.current.state());
      setLandingProposal(null);
      clearLandingTimeout();
    },
    [setShotSession, setMarkLandingArmed, clearLandingTimeout],
  );
  const handleUpdateDispersion = useCallback(() => {
    if (dispersionLoading) {
      return;
    }
    setDispersionLoading(true);
    setDispersionMessage('Learning dispersion…');
    (async () => {
      try {
        const records = await loadHudRunShots();
        const shots: RoundShot[] = [];
        for (const record of records) {
          const shot = mapHudRecordToRoundShot(record);
          if (shot) {
            shots.push(shot);
          }
        }
        const learned = learnDispersion(shots, DISPERSION_MIN_SAMPLES);
        const clubsLearned = Object.keys(learned).length;
        if (!clubsLearned) {
          setDispersionPreview(null);
          setDispersionMessage('Need at least 6 valid shots per club with pin + landing.');
        } else {
          setDispersionPreview(cloneDispersionMap(learned));
          setDispersionMessage(
            `Learned dispersion for ${clubsLearned} club${clubsLearned === 1 ? '' : 's'}.`,
          );
        }
      } catch (error) {
        setDispersionPreview(null);
        setDispersionMessage('Failed to learn dispersion from hud_run.json.');
      } finally {
        setDispersionLoading(false);
      }
    })();
  }, [dispersionLoading]);
  const handleSaveDispersion = useCallback(() => {
    if (dispersionSaving) {
      return;
    }
    const active = dispersionPreview ?? storedDispersion?.clubs ?? null;
    if (!active || Object.keys(active).length === 0) {
      setDispersionMessage('No dispersion data to save yet.');
      return;
    }
    if (storedDispersion && dispersionMapsEqual(active, storedDispersion.clubs)) {
      setDispersionMessage('Dispersion already saved.');
      return;
    }
    const payload = cloneDispersionMap(active);
    if (!payload) {
      setDispersionMessage('No dispersion data to save yet.');
      return;
    }
    setDispersionSaving(true);
    (async () => {
      const timestamp = Date.now();
      try {
        await saveLearnedDispersion(payload, timestamp);
        setStoredDispersion({ updatedAt: timestamp, clubs: payload });
        setDispersionPreview(payload);
        setDispersionMessage('Dispersion saved.');
        showToast('Dispersion saved.');
      } catch (error) {
        setDispersionMessage('Failed to save dispersion.');
      } finally {
        setDispersionSaving(false);
      }
    })();
  }, [dispersionPreview, dispersionSaving, storedDispersion]);
  const createShotPayload = useCallback(
    (session: ShotSessionState): ShotLogRecord | null => {
      if (!session.landing) {
        return null;
      }
      const breakdown = session.plan.breakdown ?? {
        temp_m: 0,
        alt_m: 0,
        head_m: 0,
        slope_m: 0,
      };
      const outcome = computeLandingOutcome(session, overlayOrigin);
      if (!outcome) {
        return null;
      }
      const { carry, landGeo, endDist, holed } = outcome;
      const sgResult = computeSG({
        phase: session.phase,
        startDist_m: session.baseDistance,
        endDist_m: endDist,
        holed,
      });
      return {
        tStart: session.startedAt,
        tEnd: session.completedAt ?? Date.now(),
        shotId: session.shotId,
        club: session.club ?? null,
        base_m: finiteOrNull(session.baseDistance),
        playsLike_m: finiteOrNull(session.plan.playsLike_m),
        deltas: {
          temp: finiteOrNull(breakdown.temp_m),
          alt: finiteOrNull(breakdown.alt_m),
          head: finiteOrNull(breakdown.head_m),
          slope: finiteOrNull(breakdown.slope_m),
        },
        pin: session.pin ? { lat: session.pin.lat, lon: session.pin.lon } : null,
        land: landGeo ? { lat: landGeo.lat, lon: landGeo.lon } : null,
        carry_m: finiteOrNull(carry),
        heading_deg: finiteOrNull(session.headingDeg),
        endDist_m: finiteOrNull(endDist),
        holed,
        phase: session.phase,
        planAdopted: session.planAdopted,
        sg: {
          tee: finiteOrNull(sgResult.sgTee),
          approach: finiteOrNull(sgResult.sgApp),
          short: finiteOrNull(sgResult.sgShort),
          putt: finiteOrNull(sgResult.sgPutt),
          total: finiteOrNull(sgResult.total),
          expStart: finiteOrNull(sgResult.expStart),
          expEnd: finiteOrNull(sgResult.expEnd),
          strokes: finiteOrNull(sgResult.strokesTaken),
        },
        ev: {
          before: finiteOrNull(sgResult.expStart),
          after: finiteOrNull(sgResult.strokesTaken + sgResult.expEnd),
        },
        rollout: {
          mc: caddieRollout.mc,
          advice: caddieRollout.advice,
          tts: caddieRollout.tts,
        },
      };
    },
    [caddieRollout, overlayOrigin],
  );

  const handleRoundShareUpload = useCallback(async () => {
    if (roundShareUploading) {
      return;
    }
    const round = getActiveRoundState();
    if (!round) {
      setRoundShareMessage('No active round to upload');
      setRoundShareError(true);
      return;
    }
    setRoundShareUploading(true);
    setRoundShareError(false);
    setRoundShareMessage('Uploading round…');
    try {
      const receipt = await uploadRoundRun(round);
      setRoundShareMessage(`Share ID: ${receipt.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRoundShareMessage(`Upload failed: ${message}`);
      setRoundShareError(true);
    } finally {
      setRoundShareUploading(false);
    }
  }, [roundShareUploading]);
  useEffect(() => {
    if (!shotSession || !shotSession.landing || shotSession.logged) {
      return;
    }
    const payload = createShotPayload(shotSession);
    if (!payload) {
      return;
    }
    emitTelemetry('hud.shot', payload);
    void appendHudRunShot(payload);
    const activeRound = getActiveRoundState();
    if (activeRound && !activeRound.finished && activeRound.holes.length) {
      const index = Math.min(Math.max(activeRound.currentHole, 0), activeRound.holes.length - 1);
      const hole = activeRound.holes[index];
      const roundShot = mapHudRecordToRoundShot(payload);
      if (hole && roundShot) {
        addRoundShot(hole.holeNo, roundShot);
      }
    }
    setShotSession((prev) => {
      if (!prev || prev.shotId !== shotSession.shotId) {
        return prev;
      }
      return { ...prev, logged: true };
    });
    if (!planAdoptedRef.current && lastPlanContextRef.current) {
      const context = lastPlanContextRef.current;
      emitTelemetry('hud.caddie.adopt', {
        adopted: false,
        mcUsed: context.mcUsed,
        hadAdvice: context.hadAdvice,
        ttsUsed: context.ttsUsed,
      });
    }
    planAdoptedRef.current = false;
    lastPlanContextRef.current = null;
  }, [createShotPayload, emitTelemetry, shotSession]);
  const shotSummary = useMemo<ShotSummary | null>(() => {
    if (!shotSession || !shotSession.landing) {
      return null;
    }
    const outcome = computeLandingOutcome(shotSession, overlayOrigin);
    if (!outcome) {
      return null;
    }
    const { carry: actual, endDist, holed } = outcome;
    const planned = shotSession.plan.playsLike_m;
    const error = actual - planned;
    const isClubId = (value: string | null | undefined): value is ClubId =>
      Boolean(value && (CLUB_SEQUENCE as readonly string[]).includes(value));
    const storedClub = shotSession.club;
    const plannedClub = isClubId(shotSession.plan.clubSuggested)
      ? shotSession.plan.clubSuggested
      : suggestClub(qaBag, planned);
    const actualClubInferred = suggestClub(qaBag, actual);
    const actualClubUsed = storedClub && isClubId(storedClub) ? storedClub : null;
    const sgResult = computeSG({
      phase: shotSession.phase,
      startDist_m: shotSession.baseDistance,
      endDist_m: endDist,
      holed,
    });
    const sg = {
      tee: sgResult.sgTee,
      approach: sgResult.sgApp,
      short: sgResult.sgShort,
      putt: sgResult.sgPutt,
      total: sgResult.total,
    } as const;
    const feedback = buildShotFeedback({
      planned: {
        base_m: shotSession.baseDistance,
        playsLike_m: planned,
        deltas: {
          temp: shotSession.plan.breakdown.temp_m,
          alt: shotSession.plan.breakdown.alt_m,
          head: shotSession.plan.breakdown.head_m,
          slope: shotSession.plan.breakdown.slope_m,
        },
        clubSuggested: shotSession.plan.clubSuggested ?? plannedClub,
        tuningActive: shotSession.plan.tuningApplied,
        aimAdjust_deg: shotSession.plan.aimAdjust_deg,
      },
      actual: {
        carry_m: actual,
        clubUsed: shotSession.club,
      },
      bag: qaBag,
      heading_deg: shotSession.headingDeg,
      cross_aim_deg_per_mps: shotSession.plan.aimAdjust_deg,
    });

    return {
      actual,
      planned,
      error,
      plannedClub,
      actualClub: actualClubUsed ?? actualClubInferred,
      feedback,
      evBefore: sgResult.expStart,
      evAfter: sgResult.strokesTaken + sgResult.expEnd,
      sg,
      planAdopted: shotSession.planAdopted,
    };
  }, [overlayOrigin, qaBag, shotSession]);
  useEffect(() => {
    if (
      !coachLearningEnabled ||
      !coachProfileId ||
      !shotSession ||
      !shotSummary ||
      !shotSession.landing ||
      lastProfileUpdateShotRef.current === shotSession.shotId
    ) {
      return;
    }
    const updateProfile = async () => {
      try {
        const current = coachProfile ?? (await loadPlayerProfile(coachProfileId));
        const sgLift: Record<TrainingFocus, number> = {
          'long-drive': 0,
          tee: shotSummary.sg.tee ?? 0,
          approach: shotSummary.sg.approach ?? 0,
          wedge: 0,
          short: shotSummary.sg.short ?? 0,
          putt: shotSummary.sg.putt ?? 0,
          recovery: 0,
        };
        const nextProfile = updateFromRound(current, {
          adopt: shotSummary.planAdopted,
          sgLift,
        });
        setCoachProfile(nextProfile);
        lastProfileUpdateShotRef.current = shotSession.shotId;
        await savePlayerProfile(nextProfile);
      } catch {
        // ignore profile update failures
      }
    };
    void updateProfile();
  }, [
    coachLearningEnabled,
    coachProfile,
    coachProfileId,
    shotSession,
    shotSummary,
  ]);

  useEffect(() => {
    if (!shotSession || !shotSummary?.feedback) {
      return;
    }
    if (lastFeedbackShotRef.current === shotSession.shotId) {
      return;
    }
    emitTelemetry('hud.feedback', {
      error_m: shotSummary.feedback.error_m,
      clubError: shotSummary.feedback.clubError,
      topFactors: shotSummary.feedback.topFactors.map((factor) => ({
        id: factor.id,
        value_m: factor.value_m,
      })),
      nextClub: shotSummary.feedback.nextClub ?? null,
      tuningActive: Boolean(shotSummary.feedback.tuningActive),
    });
    lastFeedbackShotRef.current = shotSession.shotId;
  }, [emitTelemetry, shotSession, shotSummary]);
  const dispersionLastSavedLabel = useMemo(() => {
    if (!storedDispersion) {
      return null;
    }
    try {
      return new Date(storedDispersion.updatedAt).toLocaleString();
    } catch (error) {
      return null;
    }
  }, [storedDispersion]);
  const dispersionTableData = useMemo(
    () => dispersionPreview ?? storedDispersion?.clubs ?? null,
    [dispersionPreview, storedDispersion],
  );
  const dispersionDirty = useMemo(
    () =>
      Boolean(
        dispersionPreview &&
          !dispersionMapsEqual(dispersionPreview, storedDispersion?.clubs ?? null),
      ),
    [dispersionPreview, storedDispersion],
  );
  const plannerControls = useMemo(
    () => [
      { key: 'temperatureC' as const, label: 'Temp', unit: '°C', step: 1 },
      { key: 'altitude_m' as const, label: 'Altitude', unit: 'm ASL', step: 50 },
      { key: 'wind_mps' as const, label: 'Wind', unit: 'm/s', step: 1 },
      { key: 'wind_from_deg' as const, label: 'From', unit: '°', step: 15 },
      { key: 'slope_dh_m' as const, label: 'Slope Δh', unit: 'm', step: 1 },
    ],
    [],
  );
  const caddiePlayerModel = useMemo(
    () =>
      buildPlayerModel({
        bag: qaBag,
        dispersion: storedDispersion?.clubs,
        minSamples: DISPERSION_MIN_SAMPLES,
      }),
    [qaBag, storedDispersion],
  );
  const likelyPar5 = useMemo(() => (pinMetrics?.distance ?? 0) > 360, [pinMetrics?.distance]);
  useEffect(() => {
    if (!likelyPar5 && caddieGoForGreen) {
      setCaddieGoForGreen(false);
    }
  }, [caddieGoForGreen, likelyPar5]);
  const caddieScenario = useMemo<'tee' | 'approach'>(() => {
    const distance = pinMetrics?.distance ?? 0;
    return distance > 220 ? 'tee' : 'approach';
  }, [pinMetrics?.distance]);
  const caddiePlan = useMemo<CaddieShotPlan | null>(() => {
    if (!bundle || !playerLatLon || !pin) {
      return null;
    }
    const wind = {
      speed_mps: plannerInputs.wind_mps,
      from_deg: plannerInputs.wind_from_deg,
    };
    if (caddieScenario === 'tee') {
      if (caddieMcActive) {
        return planTeeShotMC({
          bundle,
          tee: playerLatLon,
          pin,
          player: caddiePlayerModel,
          riskMode: caddieRiskMode,
          wind,
          slope_dh_m: plannerInputs.slope_dh_m,
          goForGreen: likelyPar5 && caddieGoForGreen,
          useMC: true,
          mcSamples: caddieSamples,
        });
      }
      return planTeeShot({
        bundle,
        tee: playerLatLon,
        pin,
        player: caddiePlayerModel,
        riskMode: caddieRiskMode,
        wind,
        slope_dh_m: plannerInputs.slope_dh_m,
        goForGreen: likelyPar5 && caddieGoForGreen,
      });
    }
    if (caddieMcActive) {
      return planApproachMC({
        bundle,
        ball: playerLatLon,
        pin,
        player: caddiePlayerModel,
        riskMode: caddieRiskMode,
        wind,
        slope_dh_m: plannerInputs.slope_dh_m,
        useMC: true,
        mcSamples: caddieSamples,
      });
    }
    return planApproach({
      bundle,
      ball: playerLatLon,
      pin,
      player: caddiePlayerModel,
      riskMode: caddieRiskMode,
      wind,
      slope_dh_m: plannerInputs.slope_dh_m,
    });
  }, [
    bundle,
    caddieGoForGreen,
    caddieSamples,
    caddiePlayerModel,
    caddieRiskMode,
    caddieMcActive,
    caddieScenario,
    likelyPar5,
    pin,
    plannerInputs.slope_dh_m,
    plannerInputs.wind_from_deg,
    plannerInputs.wind_mps,
    playerLatLon,
  ]);
  const greenSectionLabel = useMemo(() => {
    if (!caddiePlan || caddiePlan.kind !== 'approach' || !caddiePlan.greenSection) {
      return null;
    }
    return formatGreenSectionLabel(caddiePlan.greenSection);
  }, [caddiePlan]);
  const fatSideIcon = useMemo(() => {
    if (!caddiePlan || caddiePlan.kind !== 'approach' || !caddiePlan.fatSide) {
      return null;
    }
    return caddiePlan.fatSide === 'L' ? '⬅︎' : '➡︎';
  }, [caddiePlan]);
  const hudSectionLabel = useMemo(() => {
    if (!greenHintsEnabled) {
      return null;
    }
    if (caddiePlan && caddiePlan.kind === 'approach' && caddiePlan.greenSection) {
      return formatGreenSectionLabel(caddiePlan.greenSection);
    }
    return 'Middle';
  }, [caddiePlan, greenHintsEnabled]);
  const hudFatSideTag = useMemo(() => {
    if (!greenHintsEnabled) {
      return null;
    }
    if (caddiePlan && caddiePlan.kind === 'approach' && caddiePlan.fatSide) {
      return caddiePlan.fatSide === 'L' ? '⬅︎' : '➡︎';
    }
    return null;
  }, [caddiePlan, greenHintsEnabled]);
  const showGreenHints = useMemo(
    () =>
      Boolean(
        caddiePlan &&
          caddiePlan.kind === 'approach' &&
          greenHintsEnabled &&
          (caddiePlan.greenSection || caddiePlan.fatSide),
      ),
    [caddiePlan, greenHintsEnabled],
  );
  const sliderHandleSize = 18;
  const sliderProgress = clamp01(
    (caddieSamples - MC_SAMPLES_MIN) / (MC_SAMPLES_MAX - MC_SAMPLES_MIN),
  );
  const sliderFillWidth = sliderProgress * mcSliderWidth;
  const sliderHandleLeft = Math.min(
    Math.max(0, sliderFillWidth - sliderHandleSize / 2),
    Math.max(0, mcSliderWidth - sliderHandleSize),
  );
  const mcResult = caddiePlan?.mc ?? null;
  const mcFairwayPct = mcResult ? Math.round(clamp01(mcResult.pFairway) * 100) : 0;
  const mcHazardPct = mcResult ? Math.round(clamp01(mcResult.pHazard) * 100) : 0;
  const mcGreenPct =
    mcResult && typeof mcResult.pGreen === 'number'
      ? Math.round(clamp01(mcResult.pGreen) * 100)
      : null;
  const caddieTips = useMemo(
    () =>
      caddiePlan
        ? caddieTipToText(
            caddiePlan,
            {
              mode: caddieRiskMode,
              wind: { cross_mps: caddiePlan.crosswind_mps, head_mps: caddiePlan.headwind_mps },
              tuningActive: caddiePlayerModel.tuningActive,
            },
            coachStyle,
          )
        : [],
    [caddiePlan, caddiePlayerModel.tuningActive, caddieRiskMode, coachStyle],
  );
  const voiceEnabled = coachStyle.format === 'tts';
  const voiceLang = resolveVoiceLanguage(coachStyle);
  const voiceRate = resolveVoiceRate(coachStyle, voiceLang);
  const voicePitch = resolveVoicePitch(coachStyle);
  const conciseTipText = caddieTips[0] ?? '';
  const handleVoiceToggle = useCallback((value: boolean) => {
    applyCoachStyle({ format: value ? 'tts' : 'text' });
  }, [applyCoachStyle]);
  const handleVoiceLanguageChange = useCallback(
    (value: 'sv-SE' | 'en-US') => {
      applyCoachStyle({ language: VOICE_LANGUAGE_TO_COACH[value], voice: { lang: value } });
    },
    [applyCoachStyle],
  );
  const handleVoiceRateChange = useCallback(
    (value: number) => {
      applyCoachStyle({ voice: { rate: value } });
    },
    [applyCoachStyle],
  );
  const handleVoicePitchChange = useCallback(
    (value: number) => {
      applyCoachStyle({ voice: { pitch: value } });
    },
    [applyCoachStyle],
  );
  useEffect(() => {
    if (!caddieTtsRolloutEnabled && voiceEnabled) {
      applyCoachStyle({ format: 'text' });
    }
  }, [applyCoachStyle, caddieTtsRolloutEnabled, voiceEnabled]);
  const speakConciseTip = useCallback(
    (options?: { queue?: boolean }) => {
      if (!voiceEnabled || !caddieTtsRolloutEnabled || !conciseTipText) {
        return;
      }
      const queue = options?.queue ?? false;
      void speakTip({
        text: conciseTipText,
        lang: voiceLang,
        rate: voiceRate,
        pitch: voicePitch,
        queue,
      }).catch(() => {});
      emitTelemetry('hud.caddie.tts', {
        lang: voiceLang,
        rate: Number(voiceRate.toFixed(2)),
        pitch: Number(voicePitch.toFixed(2)),
        chars: conciseTipText.length,
      });
    },
    [
      caddieTtsRolloutEnabled,
      conciseTipText,
      emitTelemetry,
      voiceEnabled,
      voiceLang,
      voicePitch,
      voiceRate,
    ],
  );
  const handlePlayTip = useCallback(() => {
    speakConciseTip();
  }, [speakConciseTip]);
  const handleStopTip = useCallback(() => {
    stopSpeech();
  }, []);
  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);
  useEffect(() => {
    if (!voiceEnabled) {
      stopSpeech();
      lastSpokenPlanRef.current = null;
    }
  }, [voiceEnabled]);
  useEffect(() => {
    if (!caddiePlan) {
      lastSpokenPlanRef.current = null;
      return;
    }
    if (!voiceEnabled || !conciseTipText) {
      return;
    }
    const planKey = `${caddiePlan.kind}-${caddiePlan.club}-${caddiePlan.mode}-${Math.round(
      caddiePlan.landing.distance_m,
    )}-${Math.round(caddiePlan.aimDeg * 10)}-${caddiePlan.aimDirection}`;
    if (lastSpokenPlanRef.current === planKey) {
      return;
    }
    lastSpokenPlanRef.current = planKey;
    speakConciseTip();
  }, [caddiePlan, conciseTipText, speakConciseTip, voiceEnabled]);
  useEffect(() => {
    if (!caddieMcActive || !mcResult) {
      if (!caddieMcActive) {
        lastMcTelemetryRef.current = null;
      }
      return;
    }
    const signedAim =
      caddiePlan?.aimDirection === 'LEFT'
        ? -caddiePlan.aimDeg
        : caddiePlan?.aimDirection === 'RIGHT'
          ? caddiePlan.aimDeg
          : 0;
    const key = [
      caddiePlan?.club ?? 'NA',
      mcResult.samples,
      mcResult.scoreProxy.toFixed(3),
      signedAim.toFixed(1),
    ].join('|');
    if (lastMcTelemetryRef.current === key) {
      return;
    }
    lastMcTelemetryRef.current = key;
    emitTelemetry('hud.caddie.mc', {
      samples: mcResult.samples,
      pFairway: Number(mcResult.pFairway.toFixed(3)),
      pHazard: Number(mcResult.pHazard.toFixed(3)),
      scoreProxy: Number(mcResult.scoreProxy.toFixed(3)),
      club: caddiePlan?.club ?? 'NA',
      aimDeg: signedAim,
      expLongMiss_m: Number(mcResult.expLongMiss_m.toFixed(2)),
      expLatMiss_m: Number(mcResult.expLatMiss_m.toFixed(2)),
    });
  }, [caddiePlan, caddieMcActive, emitTelemetry, mcResult]);
  const caddieAdvices = useMemo<Advice[]>(() => {
    if (!caddieAdviceRolloutEnabled || !caddiePlan) {
      return [];
    }
    const breakdown = plannerResult?.breakdown ?? {
      temp_m: 0,
      alt_m: 0,
      head_m: 0,
      slope_m: 0,
    };
    const hazardReason = (caddiePlan.reason ?? '').toLowerCase();
    const hazardRight = hazardReason.includes('aim left to clear hazards');
    const hazardLeft = hazardReason.includes('aim right to clear hazards');
    const clubStats = caddiePlayerModel.clubs[caddiePlan.club];
    const signedAim =
      caddiePlan.aimDirection === 'LEFT'
        ? -caddiePlan.aimDeg
        : caddiePlan.aimDirection === 'RIGHT'
          ? caddiePlan.aimDeg
          : 0;
    return advise({
      wind: {
        head_mps: caddiePlan.headwind_mps,
        cross_mps: caddiePlan.crosswind_mps,
      },
      deltas: {
        temp_m: breakdown.temp_m ?? 0,
        alt_m: breakdown.alt_m ?? 0,
        head_m: breakdown.head_m ?? 0,
        slope_m: breakdown.slope_m ?? 0,
      },
      plan: {
        club: caddiePlan.club,
        aimDeg: signedAim,
        aimDirection: caddiePlan.aimDirection,
        risk: caddiePlan.risk,
        distance_m: caddiePlan.landing.distance_m,
        reason: caddiePlan.reason,
        hazardRightOfAim: hazardRight,
        hazardLeftOfAim: hazardLeft,
      },
      dispersion: clubStats
        ? {
            sigma_long_m: clubStats.sigma_long_m,
            sigma_lat_m: clubStats.sigma_lat_m,
          }
        : undefined,
      round: {
        hole: 0,
        lastErrors: [],
        streak: { bogey: 0, birdie: 0 },
      },
      style: coachStyle,
      coachProfile,
      learningEnabled: coachLearningEnabled,
    });
  }, [
    caddieAdviceRolloutEnabled,
    caddiePlan,
    caddiePlayerModel,
    coachLearningEnabled,
    coachProfile,
    coachStyle,
    plannerResult,
  ]);
  const caddieAdviceLines = useMemo(
    () =>
      caddieAdviceRolloutEnabled && caddieAdvices.length
        ? advicesToText(caddieAdvices, coachStyle, coachStyle.language)
        : [],
    [caddieAdviceRolloutEnabled, caddieAdvices, coachStyle],
  );
  const caddieAdviceTypes = useMemo(
    () => caddieAdvices.map((item) => item.type),
    [caddieAdvices],
  );
  const caddieTitle = caddieScenario === 'tee' ? 'Tee plan' : 'Next shot';
  useEffect(() => {
    if (!caddiePlan) {
      lastCaddiePlanRef.current = null;
      lastPlanContextRef.current = null;
      planAdoptedRef.current = false;
      return;
    }
    const key = `${caddiePlan.kind}-${caddiePlan.club}-${caddiePlan.mode}-${Math.round(
      caddiePlan.landing.distance_m,
    )}-${Math.round(caddiePlan.aimDeg * 10)}-${caddiePlan.aimDirection}`;
    if (lastCaddiePlanRef.current === key) {
      return;
    }
    const signedAim =
      caddiePlan.aimDirection === 'LEFT'
        ? -caddiePlan.aimDeg
        : caddiePlan.aimDirection === 'RIGHT'
          ? caddiePlan.aimDeg
          : 0;
    const adviceEnabled = caddieAdviceRolloutEnabled;
    const adviceHasText = adviceEnabled && caddieAdviceLines.length > 0;
    const ttsUsed = caddieTtsRolloutEnabled;
    emitTelemetry('hud.caddie.plan', {
      club: caddiePlan.club,
      risk: Number(caddiePlan.risk.toFixed(3)),
      aimDeg: signedAim,
      D: Number(caddiePlan.landing.distance_m.toFixed(1)),
      mode: caddiePlan.mode,
      adviceTypes: caddieAdviceTypes,
      adviceText: adviceHasText ? caddieAdviceLines.slice(0, 5) : [],
      tone: coachStyle.tone,
      verbosity: coachStyle.verbosity,
      language: coachStyle.language,
      emoji: Boolean(coachStyle.emoji),
      format: coachStyle.format,
      mcUsed: caddieMcActive,
      hadAdvice: adviceEnabled,
      ttsUsed,
      tags: ['style/timing'],
    });
    lastCaddiePlanRef.current = key;
    lastPlanContextRef.current = { key, mcUsed: caddieMcActive, hadAdvice: adviceEnabled, ttsUsed };
    planAdoptedRef.current = false;
  }, [
    caddieAdviceLines,
    caddieAdviceRolloutEnabled,
    caddieAdviceTypes,
    caddieMcActive,
    caddiePlan,
    caddieTtsRolloutEnabled,
    coachStyle,
    emitTelemetry,
  ]);
  const [cameraStats, setCameraStats] = useState<CameraStats>({ latency: 0, fps: 0 });
  const telemetryRef = useRef<TelemetryEmitter | null>(resolveTelemetryEmitter());
  const shotIdCounterRef = useRef(0);
  const shotIdRef = useRef(0);
  const bundleRef = useRef<CourseBundle | null>(bundle);
  const playerGeoRef = useRef<GeoPoint | null>(playerLatLon);
  const pinRef = useRef<GeoPoint | null>(pin);
  const landingHeuristicsRef = useRef(createLandingHeuristics());
  const lastLocationFixRef = useRef<LocationFix | null>(null);
  const landingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFeedbackShotRef = useRef<string | null>(null);
  const ghostProgressRef = useRef<Animated.Value | null>(null);
  if (!ghostProgressRef.current) {
    ghostProgressRef.current = new Animated.Value(0);
  }
  const ghostProgress = ghostProgressRef.current;
  const ghostTelemetryKeyRef = useRef<string | null>(null);
  const lastCaddiePlanRef = useRef<string | null>(null);

  const clearLandingTimeout = useCallback(() => {
    if (landingTimeoutRef.current) {
      clearTimeout(landingTimeoutRef.current);
      landingTimeoutRef.current = null;
    }
  }, []);

  const startLandingTimeout = useCallback(() => {
    clearLandingTimeout();
    landingTimeoutRef.current = setTimeout(() => {
      const heuristics = landingHeuristicsRef.current;
      if (heuristics.state() === 'TRACKING') {
        heuristics.cancel('timeout');
        setLandingProposal(null);
        setLandingState(heuristics.state());
      }
    }, 60_000);
  }, [clearLandingTimeout]);

  useEffect(() => {
    telemetryRef.current = resolveTelemetryEmitter();
  }, [qaEnabled]);

  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    playerGeoRef.current = playerLatLon;
  }, [playerLatLon]);

  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  useEffect(() => {
    landingHeuristicsRef.current.setCourse({ bundle, origin: overlayOrigin });
  }, [bundle, overlayOrigin]);

  useEffect(() => {
    if (!qaEnabled) {
      landingHeuristicsRef.current.reset();
      setLandingProposal(null);
      setLandingState('IDLE');
      clearLandingTimeout();
    }
  }, [qaEnabled, clearLandingTimeout]);

  useEffect(() => {
    if (!shotSession) {
      landingHeuristicsRef.current.reset();
      setLandingProposal(null);
      setLandingState('IDLE');
      clearLandingTimeout();
      lastFeedbackShotRef.current = null;
    }
  }, [shotSession, clearLandingTimeout]);

  const emitTelemetry = useCallback(
    (event: string, data: Record<string, unknown>) => {
      if (!qaEnabled) {
        return;
      }
      if (isTelemetryOptedOut()) {
        return;
      }
      const emitter = telemetryRef.current;
      if (emitter) {
        emitter(event, data);
      } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
        console.log(`[qa-arhud] ${event}`, data);
      }
    },
    [qaEnabled],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rc = getCaddieRc();
      let deviceId = 'unknown-device';
      try {
        deviceId = await resolveDeviceId();
      } catch (error) {
        // ignore
      }
      setCoachLearningEnabled(rc.coach.learningEnabled);
      const mcEnabled =
        rc.mc.kill === true ? false : rc.mc.enabled && inRollout(deviceId, rc.mc.percent);
      const adviceEnabled =
        rc.advice.kill === true
          ? false
          : rc.advice.enabled && inRollout(deviceId, rc.advice.percent);
      const ttsEnabled =
        rc.tts.kill === true ? false : rc.tts.enabled && inRollout(deviceId, rc.tts.percent);
      const digestEnabled = rc.digest?.enabled ?? true;
      const sectionsEnabled = rc.green?.sections?.enabled ?? true;
      const pinDropEnabled = rc.green?.pinDrop?.enabled ?? true;
      if (cancelled) {
        return;
      }
      setRcGreenSectionsEnabled(sectionsEnabled);
      setRcGreenPinDropEnabled(pinDropEnabled);
      setCaddieRollout({
        ready: true,
        deviceId,
        mc: mcEnabled,
        advice: adviceEnabled,
        tts: ttsEnabled,
        percents: {
          mc: rc.mc.percent,
          advice: rc.advice.percent,
          tts: rc.tts.percent,
        },
      });
      emitTelemetry('hud.caddie.rollout', {
        deviceId,
        mc: mcEnabled,
        advice: adviceEnabled,
        tts: ttsEnabled,
        perc: {
          mc: rc.mc.percent,
          advice: rc.advice.percent,
          tts: rc.tts.percent,
        },
        percents: {
          mc: rc.mc.percent,
          advice: rc.advice.percent,
          tts: rc.tts.percent,
        },
        kill: {
          mc: rc.mc.kill === true,
          advice: rc.advice.kill === true,
          tts: rc.tts.kill === true,
        },
        digest: { enabled: digestEnabled },
        green: { sections: sectionsEnabled, pinDrop: pinDropEnabled },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [emitTelemetry]);

  useEffect(() => {
    if (!qaEnabled) {
      lastLocationFixRef.current = null;
      setGnssFix(null);
      return undefined;
    }
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) {
        return;
      }
      try {
        const fix = await getLocation();
        if (cancelled) {
          return;
        }
        const previous = lastLocationFixRef.current;
        lastLocationFixRef.current = fix;
        setGnssFix(fix);
        const heuristics = landingHeuristicsRef.current;
        const estimated = estimateSpeedMps(previous, fix);
        const sample: LandingSample = {
          t: fix.timestamp,
          lat: fix.lat,
          lon: fix.lon,
          acc_m: fix.acc_m,
          speed_mps: estimated !== null && Number.isFinite(estimated) ? estimated : 0,
          heading_deg: heading,
        };
        const proposal = heuristics.ingest(sample);
        const nextState = heuristics.state();
        setLandingState((prev) => (prev === nextState ? prev : nextState));
        if (proposal) {
          setLandingProposal(proposal);
          emitTelemetry('hud.auto_land.proposed', {
            carry_m: proposal.carry_m,
            acc_m: sample.acc_m,
            reason: proposal.reason,
            conf: proposal.conf,
          });
          clearLandingTimeout();
        }
      } catch (error) {
        if (error instanceof LocationError && error.code === 'permission-denied') {
          landingHeuristicsRef.current.cancel('permission');
          setLandingState(landingHeuristicsRef.current.state());
          setLandingProposal(null);
          clearLandingTimeout();
          setGnssFix(null);
          cancelled = true;
          return;
        }
      }
      if (!cancelled) {
        timeout = setTimeout(poll, 1000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [qaEnabled, heading, emitTelemetry, clearLandingTimeout]);

  const handleAutoLandingAccept = useCallback(() => {
    const heuristics = landingHeuristicsRef.current;
    const proposal = heuristics.getProposal() ?? landingProposal;
    if (!proposal) {
      return;
    }
    if (!overlayOrigin) {
      heuristics.cancel('no-origin');
      setLandingState(heuristics.state());
      setLandingProposal(null);
      clearLandingTimeout();
      setMarkLandingArmed(true);
      emitTelemetry('hud.auto_land.rejected', { reason: 'no-origin' });
      return;
    }
    const local = toLocalENU(overlayOrigin, proposal.candidate);
    handleLandingSelected(local);
    heuristics.confirm();
    setLandingState(heuristics.state());
    setLandingProposal(null);
    emitTelemetry('hud.auto_land.confirmed', { carry_m: proposal.carry_m });
    clearLandingTimeout();
  }, [
    landingProposal,
    overlayOrigin,
    handleLandingSelected,
    emitTelemetry,
    clearLandingTimeout,
    setMarkLandingArmed,
  ]);

  const handleAutoLandingAdjust = useCallback(() => {
    landingHeuristicsRef.current.reject('adjust');
    setLandingProposal(null);
    setLandingState(landingHeuristicsRef.current.state());
    setMarkLandingArmed(true);
    emitTelemetry('hud.auto_land.rejected', { reason: 'adjust' });
    startLandingTimeout();
  }, [emitTelemetry, startLandingTimeout, setMarkLandingArmed]);

  const handleAutoLandingDismiss = useCallback(() => {
    landingHeuristicsRef.current.reject('dismiss');
    setLandingProposal(null);
    setLandingState(landingHeuristicsRef.current.state());
    emitTelemetry('hud.auto_land.rejected', { reason: 'dismiss' });
    startLandingTimeout();
  }, [emitTelemetry, startLandingTimeout]);

  const handleApplyCaddiePlan = useCallback(() => {
    if (!caddiePlan) {
      return;
    }
    const mcUsed = caddieMcActive;
    const adviceEnabled = caddieAdviceRolloutEnabled;
    const adviceHasText = adviceEnabled && caddieAdviceLines.length > 0;
    const ttsUsed = caddieTtsRolloutEnabled;
    const signedAim =
      caddiePlan.aimDirection === 'LEFT'
        ? -caddiePlan.aimDeg
        : caddiePlan.aimDirection === 'RIGHT'
          ? caddiePlan.aimDeg
          : 0;
    setPlannerExpanded(true);
    setPlannerResult({
      playsLike_m: caddiePlan.landing.distance_m,
      breakdown: { temp_m: 0, alt_m: 0, head_m: 0, slope_m: 0 },
      clubSuggested: caddiePlan.club,
      tuningApplied: caddiePlan.tuningActive,
      aimAdjust_deg: signedAim,
    });
    emitTelemetry('hud.caddie.plan', {
      club: caddiePlan.club,
      risk: Number(caddiePlan.risk.toFixed(3)),
      aimDeg: signedAim,
      D: Number(caddiePlan.landing.distance_m.toFixed(1)),
      mode: caddiePlan.mode,
      applied: true,
      adviceTypes: caddieAdviceTypes,
      adviceText: adviceHasText ? caddieAdviceLines.slice(0, 5) : [],
      tone: coachStyle.tone,
      verbosity: coachStyle.verbosity,
      language: coachStyle.language,
      emoji: Boolean(coachStyle.emoji),
      format: coachStyle.format,
      mcUsed,
      hadAdvice: adviceEnabled,
      ttsUsed,
      tags: ['style/timing'],
    });
    emitTelemetry('hud.caddie.adopt', { adopted: true, mcUsed, hadAdvice: adviceEnabled, ttsUsed });
    planAdoptedRef.current = true;
  }, [
    caddieAdviceLines,
    caddieAdviceRolloutEnabled,
    caddieAdviceTypes,
    caddieMcActive,
    caddiePlan,
    caddieTtsRolloutEnabled,
    coachStyle,
    emitTelemetry,
    setPlannerExpanded,
    setPlannerResult,
  ]);

  useEffect(() => {
    if (!qaEnabled) {
      return;
    }
    let cancelled = false;
    setCoursesLoading(true);
    setCoursesError(null);
    (async () => {
      try {
        const index = await getIndex();
        if (cancelled) {
          return;
        }
        setCourses(index);
        setCoursesLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setCoursesError(error instanceof Error ? error.message : 'Failed to load index');
        setCoursesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qaEnabled]);

  useEffect(() => {
    if (!qaEnabled || searchHere) {
      return () => {};
    }
    let cancelled = false;
    (async () => {
      try {
        const fix = await getLocation();
        if (cancelled) {
          return;
        }
        setSearchHere({ lat: fix.lat, lon: fix.lon });
      } catch (error) {
        if (cancelled) {
          return;
        }
        // location optional for search suggestions
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qaEnabled, searchHere]);

  useEffect(() => {
    if (!qaEnabled || !courses.length) {
      return;
    }
    let active = true;
    (async () => {
      const saved = await loadLastSelectedCourse();
      if (active && saved && courses.some((course) => course.courseId === saved)) {
        setSelectedCourseId(saved);
      }
    })();
    return () => {
      active = false;
    };
  }, [qaEnabled, courses]);

  useEffect(() => {
    if (!qaEnabled) {
      if (autoPickEnabled) {
        setAutoPickEnabled(false);
      }
      setAutoPickPrompt(null);
      setAutoPickCandidate(null);
      setAutoPickError(null);
      autoCourseRef.current?.reset();
    }
  }, [qaEnabled, autoPickEnabled, autoCourseRef]);

  useEffect(() => {
    autoCourseRef.current?.reset();
    setAutoPickCandidate(null);
    setAutoPickPrompt(null);
  }, [courses, autoCourseRef]);

  useEffect(() => {
    if (!qaEnabled || !autoPickEnabled || !courses.length) {
      return;
    }
    let cancelled = false;
    const controller = autoCourseRef.current;
    if (!controller) {
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      if (cancelled) {
        return;
      }
      try {
        const fix = await getLocation();
        if (cancelled) {
          return;
        }
        setAutoPickAvailable(true);
        setAutoPickError(null);
        setSearchHere({ lat: fix.lat, lon: fix.lon });
        const decision = controller.consider(courses, fix, selectedCourseId);
        setAutoPickCandidate(decision.candidate);
        if (!decision.candidate) {
          setAutoPickPrompt(null);
        } else if (decision.shouldPrompt) {
          setAutoPickPrompt((prev) => {
            if (prev && prev.candidate.courseId === decision.candidate?.courseId) {
              return prev;
            }
            return { candidate: decision.candidate, shownAt: Date.now() };
          });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof LocationError && error.code === 'permission-denied') {
          setAutoPickAvailable(false);
          setAutoPickEnabled(false);
          setAutoPickError('Location permission denied');
          setAutoPickCandidate(null);
          setAutoPickPrompt(null);
          autoCourseRef.current?.reset();
          return;
        }
        const message = error instanceof Error ? error.message : 'Location unavailable';
        setAutoPickError(message);
      }
      if (cancelled) {
        return;
      }
      const delay = Math.max(controller.getDebounceMs(), 1000);
      timeout = setTimeout(poll, delay);
    };

    poll();

    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [qaEnabled, autoPickEnabled, courses, selectedCourseId, autoCourseRef]);

  useEffect(() => {
    if (!qaEnabled || !selectedCourseId) {
      setBundle(null);
      setBundleError(null);
      return;
    }
    let cancelled = false;
    setBundleLoading(true);
    setBundleError(null);
    (async () => {
      try {
        const next = await getBundle(selectedCourseId);
        if (cancelled) {
          return;
        }
        setBundle(next);
        setBundleLoading(false);
        const meta = getLastBundleFetchMeta(selectedCourseId);
        setOffline(meta?.fromCache ?? false);
        persistLastSelectedCourse(selectedCourseId).catch(() => {
          // ignore persistence errors
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setBundleError(error instanceof Error ? error.message : 'Failed to load bundle');
        setBundleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qaEnabled, selectedCourseId]);

  useEffect(() => {
    if (!qaEnabled) {
      return undefined;
    }
    const unsubscribe = subscribeHeading((value) => {
      setHeading(value);
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [qaEnabled]);

  useEffect(() => {
    if (!qaEnabled) {
      return undefined;
    }
    let mounted = true;
    let frames = 0;
    let windowStart = Date.now();
    const onFrame = (frame: CameraFrame) => {
      if (!mounted) {
        return;
      }
      frames += 1;
      const now = Date.now();
      if (now - windowStart >= 1000) {
        const fps = frames / ((now - windowStart) / 1000);
        frames = 0;
        windowStart = now;
        setCameraStats((prev) => ({ ...prev, fps }));
      }
      setCameraStats((prev) => ({ ...prev, latency: frame.latencyMs }));
    };
    camera
      .start(onFrame)
      .catch(() => {
        // ignore camera start errors in dev
      });
    return () => {
      mounted = false;
      camera.stop();
    };
  }, [camera, qaEnabled]);

  useEffect(() => {
    setPlayerPosition((prev) => {
      if (!overlayData.points.length) {
        return prev;
      }
      if (!selectedCourseId) {
        return prev;
      }
      const centroid = overlayData.points.reduce(
        (acc, point) => ({
          x: acc.x + point.x,
          y: acc.y + point.y,
        }),
        { x: 0, y: 0 },
      );
      const next = {
        x: centroid.x / overlayData.points.length,
        y: centroid.y / overlayData.points.length,
      };
      return next;
    });
  }, [overlayData.points.length, selectedCourseId]);

  useEffect(() => {
    if (!qaEnabled) {
      return undefined;
    }
    const interval = setInterval(() => {
      const bundleCurrent = bundleRef.current;
      const playerGeo = playerGeoRef.current;
      if (!bundleCurrent || !playerGeo) {
        setHazardInfo((prev) => (prev ? null : prev));
        setPinMetrics((prev) => (prev ? null : prev));
        return;
      }
      const hazard = nearestFeature(playerGeo, bundleCurrent);
      setHazardInfo((prev) => {
        if (!hazard) {
          return prev ? null : prev;
        }
        if (
          prev &&
          prev.id === hazard.id &&
          prev.type === hazard.type &&
          Math.abs(prev.dist_m - hazard.dist_m) < 0.01 &&
          Math.abs(prev.bearing - hazard.bearing) < 0.01
        ) {
          return prev;
        }
        return hazard;
      });
      const pinTarget = pinRef.current;
      if (pinTarget) {
        const local = toLocalENU(playerGeo, pinTarget);
        const distance = Math.hypot(local.x, local.y);
        const bearing = ((Math.atan2(local.x, local.y) * 180) / Math.PI + 360) % 360;
        setPinMetrics((prev) => {
          if (
            prev &&
            Math.abs(prev.distance - distance) < 0.01 &&
            Math.abs(prev.bearing - bearing) < 0.01
          ) {
            return prev;
          }
          return { distance, bearing };
        });
        emitTelemetry('hud.frame', { pinDist: distance });
      } else {
        setPinMetrics((prev) => (prev ? null : prev));
      }
    }, 200);
    return () => {
      clearInterval(interval);
    };
  }, [emitTelemetry, qaEnabled]);

  const hazardCallout = useMemo(() => {
    if (!hazardInfo) {
      return null;
    }
    return {
      distance: hazardInfo.dist_m,
      direction: directionFromBearing(hazardInfo.bearing, heading),
      id: hazardInfo.id,
      type: hazardInfo.type,
      bearing: hazardInfo.bearing,
    };
  }, [hazardInfo, heading]);

  const ghostOverlay = useMemo(() => {
    if (!overlayOrigin || !playerLatLon || !pin) {
      return null;
    }
    const originLocal = playerPosition;
    const targetLocal = toLocalENU(overlayOrigin, pin);
    const dirVector = {
      x: targetLocal.x - originLocal.x,
      y: targetLocal.y - originLocal.y,
    };
    const baseRange = Math.hypot(dirVector.x, dirVector.y);
    const headingRad = (heading * Math.PI) / 180;
    const dirUnit = baseRange > 1
      ? { x: dirVector.x / baseRange, y: dirVector.y / baseRange }
      : { x: Math.sin(headingRad), y: Math.cos(headingRad) };
    const playsLike = plannerResult?.playsLike_m ?? pinMetrics?.distance ?? baseRange;
    if (!Number.isFinite(playsLike) || playsLike <= 0) {
      return null;
    }
    const trajectory = computeGhostTrajectory({
      startLatLon: playerLatLon,
      targetLatLon: pin,
      playsLike_m: playsLike,
      wind_mps: plannerInputs.wind_mps,
      cross_from_deg: plannerInputs.wind_from_deg,
    });
    if (!trajectory || trajectory.path.length < 2) {
      return null;
    }
    const finalRange = trajectory.path[trajectory.path.length - 1]?.x ?? playsLike;
    if (!Number.isFinite(finalRange) || finalRange <= 0) {
      return null;
    }
    const rightUnit = { x: dirUnit.y, y: -dirUnit.x };
    const groundPath = trajectory.path.map((sample, idx) => {
      const progressRatio = trajectory.path.length > 1 ? idx / (trajectory.path.length - 1) : 1;
      const lateral = trajectory.lateral_m * progressRatio;
      return {
        x: originLocal.x + dirUnit.x * sample.x + rightUnit.x * lateral,
        y: originLocal.y + dirUnit.y * sample.x + rightUnit.y * lateral,
      };
    });
    const impactCenter = groundPath[groundPath.length - 1] ?? {
      x: originLocal.x + dirUnit.x * finalRange,
      y: originLocal.y + dirUnit.y * finalRange,
    };
    return {
      profile: trajectory,
      range: finalRange,
      groundPath,
      impactCenter,
      dirUnit,
    } satisfies GhostOverlay;
  }, [
    overlayOrigin,
    playerLatLon,
    pin,
    plannerResult?.playsLike_m,
    plannerInputs.wind_mps,
    plannerInputs.wind_from_deg,
    playerPosition.x,
    playerPosition.y,
    pinMetrics?.distance,
    heading,
  ]);

  const ghostErrors = useMemo<GhostErrorVector | null>(() => {
    if (!ghostOverlay || !shotSession?.landing) {
      return null;
    }
    const dir = ghostOverlay.dirUnit;
    const right = { x: dir.y, y: -dir.x };
    const landingVec = {
      x: shotSession.landing.x - shotSession.origin.x,
      y: shotSession.landing.y - shotSession.origin.y,
    };
    const downrange = landingVec.x * dir.x + landingVec.y * dir.y;
    const lateral = landingVec.x * right.x + landingVec.y * right.y;
    return {
      long: downrange - ghostOverlay.range,
      lateral: lateral - ghostOverlay.profile.lateral_m,
    };
  }, [
    ghostOverlay,
    shotSession?.landing?.x,
    shotSession?.landing?.y,
    shotSession?.origin.x,
    shotSession?.origin.y,
  ]);

  useEffect(() => {
    if (!ghostProgress) {
      return;
    }
    if (!ghostOverlay || !shotSession?.landing) {
      ghostProgress.stopAnimation?.();
      ghostProgress.setValue(0);
      return;
    }
    ghostProgress.stopAnimation?.();
    ghostProgress.setValue(0);
    Animated.timing(ghostProgress, {
      toValue: 1,
      duration: 600,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [ghostOverlay, ghostProgress, shotSession?.landing]);

  useEffect(() => {
    if (!ghostOverlay || !qaEnabled) {
      ghostTelemetryKeyRef.current = null;
      return;
    }
    const emitter = telemetryRef.current;
    if (!emitter) {
      return;
    }
    const range = Number(ghostOverlay.range.toFixed(1));
    const lateral = Number(ghostOverlay.profile.lateral_m.toFixed(2));
    const longErr = ghostErrors ? Number(ghostErrors.long.toFixed(2)) : null;
    const latErr = ghostErrors ? Number(ghostErrors.lateral.toFixed(2)) : null;
    const key = buildGhostTelemetryKey({
      shotId: shotIdRef.current,
      range,
      lateral,
      longErr: longErr ?? null,
      latErr: latErr ?? null,
    });
    if (ghostTelemetryKeyRef.current === key) {
      return;
    }
    ghostTelemetryKeyRef.current = key;
    emitter('hud.ghost', {
      range,
      lateral_m: lateral,
      long_err: longErr,
      lat_err: latErr,
    });
  }, [ghostOverlay, ghostErrors, qaEnabled, telemetryRef]);

  const handleCourseSelect = useCallback(
    (courseId: string) => {
      setSelectedCourseId(courseId);
      setAutoPickPrompt(null);
    },
    [],
  );
  const handleSuggestionSelect = useCallback(
    (courseId: string) => {
      setSearchQuery('');
      handleCourseSelect(courseId);
    },
    [handleCourseSelect],
  );

  const handleRefresh = useCallback(() => {
    if (!qaEnabled) {
      return;
    }
    setCoursesLoading(true);
    setCoursesError(null);
    (async () => {
      try {
        const index = await getIndex();
        setCourses(index);
        setCoursesLoading(false);
      } catch (error) {
        setCoursesError(error instanceof Error ? error.message : 'Failed to load index');
        setCoursesLoading(false);
      }
    })();
  }, [qaEnabled]);

  const handleSetPin = useCallback(() => {
    const current = playerGeoRef.current;
    if (!current || !pinDropUiEnabled) {
      return;
    }
    const payload = { ...current };
    setPin(payload);
    pinRef.current = payload;
    emitTelemetry('hud.pin.set', { lat: current.lat, lon: current.lon });
    showToast('Pin set');
  }, [emitTelemetry, pinDropUiEnabled]);

  const handleClearPin = useCallback(() => {
    if (!pinRef.current) {
      return;
    }
    setPin(null);
    pinRef.current = null;
    setPinMetrics(null);
    emitTelemetry('hud.pin.clear', {});
  }, [emitTelemetry]);

  const baseDistance = pinMetrics?.distance ?? 0;
  const baseDistanceText = baseDistance > 0 ? `${baseDistance.toFixed(1)} m` : '—';
  const plannerDisabled = !pinMetrics || pinMetrics.distance <= 0;
  const planClub = useMemo(() => {
    if (!plannerResult) {
      return null;
    }
    const candidate = plannerResult.clubSuggested;
    if (
      typeof candidate === 'string' &&
      (CLUB_SEQUENCE as readonly string[]).includes(candidate)
    ) {
      return candidate;
    }
    return suggestClub(qaBag, plannerResult.playsLike_m);
  }, [plannerResult, qaBag]);
  const calibrationSaveDisabled = !calibrationResult || !calibrationResult.usedShots;
  const personalBagApplied = userBagLoaded && Boolean(userBagActive);
  const autoPickStatusText = !autoPickAvailable
    ? 'Location permission required'
    : autoPickError && autoPickEnabled
      ? autoPickError
      : autoPickCandidate
        ? `${autoPickCandidate.name ?? autoPickCandidate.courseId} (${formatDistanceMeters(autoPickCandidate.dist_m)})`
        : autoPickEnabled
          ? 'Waiting for GPS…'
          : 'Off';
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);
  const autoPickToggleDisabled = !autoPickAvailable || !courses.length || !qaEnabled;
  const autoPickStatusStyle = [
    styles.autoPickStatus,
    !autoPickEnabled ? styles.autoPickStatusMuted : null,
    !autoPickAvailable || (autoPickError && autoPickEnabled) ? styles.autoPickStatusError : null,
  ];
  const gnssAccuracyValue = useMemo(() => {
    if (!gnssFix) {
      return null;
    }
    if (typeof gnssFix.accuracy_m === 'number' && Number.isFinite(gnssFix.accuracy_m)) {
      return gnssFix.accuracy_m;
    }
    if (typeof gnssFix.acc_m === 'number' && Number.isFinite(gnssFix.acc_m)) {
      return gnssFix.acc_m;
    }
    return null;
  }, [gnssFix?.accuracy_m, gnssFix?.acc_m]);
  const gnssLevel = useMemo(() => gnssAccuracyLevel(gnssAccuracyValue), [gnssAccuracyValue]);
  const gnssBadgeText = useMemo(
    () =>
      [
        formatAccuracyMeters(gnssAccuracyValue),
        formatSatelliteCount(gnssFix?.sats ?? null),
        formatDop(gnssFix?.dop ?? null),
        formatDualFrequency(gnssFix?.dualFreqGuess ?? null),
      ].join(' • '),
    [gnssAccuracyValue, gnssFix?.sats, gnssFix?.dop, gnssFix?.dualFreqGuess],
  );
  const gnssBadgeToneStyle =
    gnssLevel === 'good'
      ? styles.gnssBadgeGood
      : gnssLevel === 'ok'
        ? styles.gnssBadgeOk
        : gnssLevel === 'poor'
          ? styles.gnssBadgePoor
          : styles.gnssBadgeUnknown;
  const gnssShowTip = gnssLevel === 'poor';

  if (!qaEnabled) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.gnssCard}>
        <View style={[styles.gnssBadge, gnssBadgeToneStyle]}>
          <Text style={styles.gnssBadgeText}>{gnssBadgeText}</Text>
        </View>
        {gnssShowTip ? <Text style={styles.gnssTip}>stand still 2–3 s</Text> : null}
      </View>
      <CoursePicker
        courses={courses}
        selected={selectedCourseId}
        loading={coursesLoading}
        onSelect={handleCourseSelect}
        onRefresh={handleRefresh}
        error={coursesError}
        suggestions={searchResults}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSuggestionSelect={handleSuggestionSelect}
      />
      <View style={styles.autoPickCard}>
        <View style={styles.autoPickRow}>
          <View style={styles.autoPickCopy}>
            <Text style={styles.autoPickTitle}>Auto-pick course</Text>
            <Text style={autoPickStatusStyle}>{autoPickStatusText}</Text>
          </View>
          <Switch
            value={autoPickEnabled}
            onValueChange={handleAutoPickToggle}
            disabled={autoPickToggleDisabled}
            thumbColor={autoPickEnabled ? '#2563eb' : '#e2e8f0'}
            trackColor={{ true: '#60a5fa', false: '#334155' }}
          />
        </View>
        {autoPickPrompt ? (
          <View style={styles.autoPickPromptBox}>
            <Text style={styles.autoPickPromptText}>
              {`Switch to ${autoPickPrompt.candidate.name ?? autoPickPrompt.candidate.courseId} (${formatDistanceMeters(autoPickPrompt.candidate.dist_m)} away)?`}
            </Text>
            <View style={styles.autoPickPromptActions}>
              <TouchableOpacity onPress={handleAutoPickSwitch} style={[styles.autoPickButton, styles.autoPickPrimaryButton]}>
                <Text style={styles.autoPickButtonLabel}>Switch</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAutoPickDismiss} style={styles.autoPickButton}>
                <Text style={styles.autoPickButtonLabel}>Not now</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
      <View style={styles.shareCard}>
        <Text style={styles.shareTitle}>Round sharing</Text>
        <Text style={styles.shareSubtitle}>
          Upload the current QA round to generate a share link for replay.
        </Text>
        <TouchableOpacity
          onPress={handleRoundShareUpload}
          disabled={roundShareUploading}
          style={[styles.shareButton, roundShareUploading ? styles.shareButtonDisabled : null]}
        >
          <Text style={styles.shareButtonLabel}>
            {roundShareUploading ? 'Uploading…' : 'Upload Round'}
          </Text>
        </TouchableOpacity>
        {roundShareMessage ? (
          <Text style={[styles.shareStatus, roundShareError ? styles.shareStatusError : null]}>
            {roundShareMessage}
          </Text>
        ) : null}
      </View>
      <View style={styles.cameraSection}>
      <View style={styles.cameraStub}>
        <Text style={styles.cameraLabel}>Camera stub</Text>
        <Text style={styles.cameraStat}>FPS: {cameraStats.fps.toFixed(1)}</Text>
        <Text style={styles.cameraStat}>Latency: {cameraStats.latency.toFixed(0)} ms</Text>
        {ghostOverlay && ghostProgress ? (
          <GhostTrajectoryView
            profile={ghostOverlay.profile}
            progress={ghostProgress}
            range={ghostOverlay.range}
            lateral={ghostOverlay.profile.lateral_m}
            errors={ghostErrors}
          />
        ) : null}
      </View>
      <View style={styles.overlayWrapper}>
        <MapOverlay
          data={overlayData}
          player={playerPosition}
          heading={heading}
          offline={offline}
          hazard={hazardCallout ? { distance: hazardCallout.distance, direction: hazardCallout.direction } : null}
          markLandingActive={markLandingArmed}
          landing={shotSession?.landing ?? null}
          onSelectLanding={handleLandingSelected}
          ghost={ghostOverlay}
          onLongPressPin={pinDropUiEnabled ? handleSetPin : undefined}
          pinDropEnabled={pinDropUiEnabled}
        />
        </View>
      </View>
      <View style={styles.statusPanel}>
        <View style={styles.calibrationChipRow}>
          <View style={[styles.calibrationChip, calibrationChipToneStyle]}>
            <Text style={styles.calibrationChipLabel}>{`Calibration: ${calibrationHealthLabel}`}</Text>
          </View>
          <TouchableOpacity onPress={openCalibrationWizard} style={styles.calibrationChipButton}>
            <Text style={styles.calibrationChipButtonText}>
              {homographySnapshot ? 'Retake' : 'Calibrate'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.calibrationChipMeta}>{calibrationSummaryText}</Text>
        {showCalibrationNudge ? (
          <TouchableOpacity onPress={openCalibrationWizard} style={styles.calibrationNudgeCard}>
            <Text style={styles.calibrationNudgeText}>{calibrationNudgeText}</Text>
          </TouchableOpacity>
        ) : null}
        {pinDropUiEnabled ? (
          <>
            <Text style={styles.sectionTitle}>Pin tools</Text>
            <View style={styles.pinControlsRow}>
              <TouchableOpacity
                onPress={handleSetPin}
                disabled={!playerLatLon}
                style={[
                  styles.pinButton,
                  styles.pinButtonPrimary,
                  !playerLatLon ? styles.pinButtonDisabled : null,
                ]}
              >
                <Text style={styles.pinButtonText}>Set Pin</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleClearPin}
                disabled={!pin}
                style={[styles.pinButton, !pin ? styles.pinButtonDisabled : null]}
              >
                <Text style={styles.pinButtonText}>Clear Pin</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
        <View style={styles.calloutRow}>
          {pinDropUiEnabled ? (
            <View style={styles.calloutCard}>
              <Text style={styles.calloutLabel}>Pin</Text>
              <Text style={styles.calloutValue}>
                {pinMetrics ? `${pinMetrics.distance.toFixed(1)} m @ ${pinMetrics.bearing.toFixed(0)}°` : '—'}
              </Text>
              {greenHintsEnabled && (hudSectionLabel || hudFatSideTag) ? (
                <View style={styles.pinSectionPill}>
                  {hudFatSideTag ? <Text style={styles.pinSectionChevron}>{hudFatSideTag}</Text> : null}
                  {hudSectionLabel ? (
                    <Text style={styles.pinSectionLabel}>{hudSectionLabel}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.calloutCard}>
            <Text style={styles.calloutLabel}>Hazard</Text>
            <Text style={styles.calloutValue}>
              {hazardCallout ? `${hazardCallout.distance.toFixed(1)} m ${hazardCallout.direction}` : '—'}
            </Text>
            {hazardCallout ? (
              <Text style={styles.calloutSubtext}>{hazardCallout.type.toUpperCase()}</Text>
            ) : null}
          </View>
        </View>
        {landingState === 'PROPOSED' && landingProposal ? (
          <View style={styles.autoLandingBanner}>
            <Text style={styles.autoLandingText}>
              {`Auto landing: ${formatDistanceMeters(landingProposal.carry_m)}`}
            </Text>
            <View style={styles.autoLandingActions}>
              <TouchableOpacity
                onPress={handleAutoLandingAccept}
                style={[styles.autoLandingButton, styles.autoLandingPrimaryButton]}
              >
                <Text style={styles.autoLandingButtonLabel}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAutoLandingAdjust}
                style={styles.autoLandingButton}
              >
                <Text style={styles.autoLandingButtonLabel}>Adjust</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAutoLandingDismiss}
                style={styles.autoLandingDismissButton}
              >
                <Text style={styles.autoLandingDismissLabel}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        <View style={[styles.caddieContainer, styles.sectionTitleSpacing]}>
          <View style={styles.caddieHeader}>
            <Text style={styles.sectionTitle}>Caddie</Text>
            {caddiePlayerModel.tuningActive ? (
              <View style={styles.caddieBadge}>
                <Text style={styles.caddieBadgeText}>TUNED</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.caddieDispersionBlock}>
            <View style={styles.caddieDispersionHeader}>
              <Text style={styles.caddieDispersionTitle}>Dispersion learner</Text>
              {dispersionLastSavedLabel ? (
                <Text style={styles.caddieDispersionTimestamp}>
                  Saved {dispersionLastSavedLabel}
                </Text>
              ) : null}
            </View>
            <View style={styles.caddieDispersionActions}>
              <TouchableOpacity
                onPress={handleUpdateDispersion}
                disabled={dispersionLoading}
                style={[
                  styles.caddieDispersionButton,
                  styles.caddieDispersionButtonPrimary,
                  dispersionLoading ? styles.caddieDispersionButtonDisabled : null,
                ]}
              >
                <Text style={styles.caddieDispersionButtonText}>
                  {dispersionLoading ? 'Learning…' : 'Update from last session'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveDispersion}
                disabled={dispersionSaving || !dispersionDirty}
                style={[
                  styles.caddieDispersionButton,
                  dispersionSaving || !dispersionDirty
                    ? styles.caddieDispersionButtonDisabled
                    : null,
                ]}
              >
                <Text style={styles.caddieDispersionButtonText}>
                  {dispersionSaving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
            {dispersionMessage ? (
              <Text style={styles.caddieDispersionMessage}>{dispersionMessage}</Text>
            ) : null}
            {dispersionTableData ? (
              <View style={styles.caddieDispersionTable}>
                <View style={styles.caddieDispersionRowHeader}>
                  <Text style={styles.caddieDispersionHeaderClub}>Club</Text>
                  <Text style={styles.caddieDispersionHeaderValue}>σ long</Text>
                  <Text style={styles.caddieDispersionHeaderValue}>σ lat</Text>
                  <Text style={styles.caddieDispersionHeaderValue}>n</Text>
                </View>
                {CLUB_SEQUENCE.slice()
                  .reverse()
                  .map((club) => {
                    const entry = dispersionTableData?.[club];
                    return (
                      <View key={`dispersion-${club}`} style={styles.caddieDispersionRow}>
                        <Text style={styles.caddieDispersionClub}>{club}</Text>
                        <Text style={styles.caddieDispersionValue}>
                          {entry ? formatSigma(entry.sigma_long_m) : '—'}
                        </Text>
                        <Text style={styles.caddieDispersionValue}>
                          {entry ? formatSigma(entry.sigma_lat_m) : '—'}
                        </Text>
                        <Text style={styles.caddieDispersionValue}>
                          {entry ? `${entry.n}` : '0'}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            ) : (
              <Text style={styles.caddieDispersionEmpty}>No dispersion data yet.</Text>
            )}
          </View>
          <View style={styles.caddieModeRow}>
            {CADDIE_RISK_OPTIONS.map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => setCaddieRiskMode(mode)}
                style={[
                  styles.caddieModeOption,
                  caddieRiskMode === mode ? styles.caddieModeOptionActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.caddieModeText,
                    caddieRiskMode === mode ? styles.caddieModeTextActive : null,
                  ]}
                >
                  {CADDIE_RISK_LABELS[mode]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.caddieStyleGrid}>
            <View style={styles.caddieStyleBlock}>
              <Text style={styles.caddieStyleLabel}>Tone</Text>
              <View style={styles.caddieStyleRow}>
                {COACH_TONE_OPTIONS.map((tone) => (
                  <TouchableOpacity
                    key={tone}
                    onPress={() => applyCoachStyle({ tone })}
                    style={[
                      styles.caddieStyleOption,
                      coachStyle.tone === tone ? styles.caddieStyleOptionActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.caddieStyleOptionText,
                        coachStyle.tone === tone ? styles.caddieStyleOptionTextActive : null,
                      ]}
                    >
                      {COACH_TONE_LABELS[tone]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.caddieStyleBlock}>
              <Text style={styles.caddieStyleLabel}>Verbosity</Text>
              <View style={styles.caddieStyleRow}>
                {COACH_VERBOSITY_OPTIONS.map((verbosity) => (
                  <TouchableOpacity
                    key={verbosity}
                    onPress={() => applyCoachStyle({ verbosity })}
                    style={[
                      styles.caddieStyleOption,
                      coachStyle.verbosity === verbosity ? styles.caddieStyleOptionActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.caddieStyleOptionText,
                        coachStyle.verbosity === verbosity
                          ? styles.caddieStyleOptionTextActive
                          : null,
                      ]}
                    >
                      {COACH_VERBOSITY_LABELS[verbosity]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.caddieStyleRowCompact}>
            <View style={styles.caddieStyleLanguageBlock}>
              <Text style={styles.caddieStyleLabel}>Language</Text>
              <View style={styles.caddieStyleRow}>
                {COACH_LANGUAGE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => applyCoachStyle({ language: option.value })}
                    style={[
                      styles.caddieStyleOption,
                      styles.caddieStyleOptionSmall,
                      coachStyle.language === option.value
                        ? styles.caddieStyleOptionActive
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.caddieStyleOptionText,
                        coachStyle.language === option.value
                          ? styles.caddieStyleOptionTextActive
                          : null,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {coachStyle.tone === 'pep' ? (
              <View style={styles.caddieStyleToggleRow}>
                <Text style={styles.caddieStyleToggleLabel}>Emoji</Text>
                <Switch
                  value={Boolean(coachStyle.emoji)}
                  onValueChange={(value) => applyCoachStyle({ emoji: value })}
                />
              </View>
            ) : null}
          </View>
          <View style={styles.caddieVoiceBlock}>
            <View style={styles.caddieVoiceHeader}>
              <Text style={styles.caddieStyleLabel}>Voice</Text>
              <Switch
                value={voiceEnabled}
                onValueChange={handleVoiceToggle}
                disabled={!caddieTtsRolloutEnabled}
              />
            </View>
            <View style={styles.caddieStyleRow}>
              {COACH_VOICE_LANGUAGE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => handleVoiceLanguageChange(option.value)}
                  disabled={!voiceEnabled}
                  style={[
                    styles.caddieStyleOption,
                    styles.caddieStyleOptionSmall,
                    voiceLang === option.value ? styles.caddieStyleOptionActive : null,
                    !voiceEnabled ? styles.caddieStyleOptionDisabled : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.caddieStyleOptionText,
                      voiceLang === option.value ? styles.caddieStyleOptionTextActive : null,
                      !voiceEnabled ? styles.caddieStyleOptionTextDisabled : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.voiceSliderGroup}>
              <VoiceSlider
                label={`Rate ${voiceRate.toFixed(2)}`}
                value={voiceRate}
                min={VOICE_RATE_MIN}
                max={VOICE_RATE_MAX}
                step={VOICE_RATE_STEP}
                disabled={!voiceEnabled}
                onChange={handleVoiceRateChange}
              />
              <VoiceSlider
                label={`Pitch ${voicePitch.toFixed(2)}`}
                value={voicePitch}
                min={VOICE_PITCH_MIN}
                max={VOICE_PITCH_MAX}
                step={VOICE_PITCH_STEP}
                disabled={!voiceEnabled}
                onChange={handleVoicePitchChange}
              />
            </View>
            <View style={styles.caddieVoiceActions}>
              <TouchableOpacity
                onPress={handlePlayTip}
                disabled={!voiceEnabled || !conciseTipText}
                style={[
                  styles.caddieVoiceButton,
                  !voiceEnabled || !conciseTipText ? styles.caddieVoiceButtonDisabled : null,
                ]}
              >
                <Text style={styles.caddieVoiceButtonLabel}>Play tip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleStopTip}
                disabled={!voiceEnabled}
                style={[
                  styles.caddieVoiceButton,
                  styles.caddieVoiceButtonSecondary,
                  styles.caddieVoiceButtonLast,
                  !voiceEnabled ? styles.caddieVoiceButtonDisabled : null,
                ]}
              >
                <Text style={styles.caddieVoiceButtonLabel}>Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.caddieToggleRow}>
            <Text style={styles.caddieToggleLabel}>Monte Carlo</Text>
            <Switch
              value={caddieUseMC}
              onValueChange={setCaddieUseMC}
              disabled={!caddieMcRolloutEnabled}
            />
          </View>
          {caddieMcActive ? (
            <View style={styles.mcControls}>
              <View style={styles.mcSamplesHeader}>
                <Text style={styles.mcSamplesLabel}>Samples</Text>
                <Text style={styles.mcSamplesValue}>{caddieSamples}</Text>
              </View>
              <View
                style={styles.mcSliderTrack}
                onLayout={handleSliderLayout}
                {...mcPanResponder.panHandlers}
              >
                <View style={[styles.mcSliderFill, { width: sliderFillWidth }]} />
                <View style={[styles.mcSliderHandle, { left: sliderHandleLeft }]} />
              </View>
              <View style={styles.mcSamplesTicks}>
                <Text style={styles.mcSamplesTickLabel}>{MC_SAMPLES_MIN}</Text>
                <Text style={styles.mcSamplesTickLabel}>{MC_SAMPLES_MAX}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.caddieToggleRow}>
            <Text style={styles.caddieToggleLabel}>Go for green</Text>
            <Switch
              value={caddieGoForGreen && likelyPar5}
              onValueChange={setCaddieGoForGreen}
              disabled={!likelyPar5}
            />
          </View>
          {caddiePlan ? (
            <View style={styles.caddiePlanBlock}>
              <Text style={styles.caddiePlanTitle}>{caddieTitle}</Text>
              {showGreenHints ? (
                <View style={styles.greenSectionRow}>
                  {greenSectionLabel ? (
                    <View style={styles.greenSectionChip}>
                      <Text style={styles.greenSectionLabelText}>{greenSectionLabel}</Text>
                    </View>
                  ) : null}
                  {fatSideIcon ? (
                    <View style={styles.greenSectionChip}>
                      <Text style={styles.greenSectionIcon}>{fatSideIcon}</Text>
                      <Text style={styles.greenSectionLabelText}>Fat side</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {caddieTips.map((line, index) => (
                <Text key={`caddie-line-${index}`} style={styles.caddieTipLine}>
                  {line}
                </Text>
              ))}
              {caddieAdviceLines.length ? (
                <View style={styles.caddieAdviceRow}>
                  {caddieAdviceLines.map((line, index) => (
                    <View key={`caddie-advice-${index}`} style={styles.caddieAdviceChip}>
                      <Text style={styles.caddieAdviceText}>{line}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {caddieMcActive && mcResult ? (
                <View style={styles.mcStatsBlock}>
                  <View style={styles.mcMiniBarBlock}>
                    <View style={styles.mcMiniBarLabelRow}>
                      <Text style={styles.mcMiniBarLabel}>Fairway</Text>
                      <Text style={styles.mcMiniBarLabel}>{mcFairwayPct}%</Text>
                    </View>
                    <Bar pct={mcFairwayPct} good />
                  </View>
                  <View style={styles.mcMiniBarBlock}>
                    <View style={styles.mcMiniBarLabelRow}>
                      <Text style={styles.mcMiniBarLabel}>Hazard</Text>
                      <Text style={styles.mcMiniBarLabel}>{mcHazardPct}%</Text>
                    </View>
                    <Bar pct={mcHazardPct} />
                  </View>
                  {mcGreenPct !== null ? (
                    <View style={styles.mcMiniBarBlock}>
                      <View style={styles.mcMiniBarLabelRow}>
                        <Text style={styles.mcMiniBarLabel}>Green</Text>
                        <Text style={styles.mcMiniBarLabel}>{mcGreenPct}%</Text>
                      </View>
                      <Bar pct={mcGreenPct} good />
                    </View>
                  ) : null}
                  <Text style={styles.mcMissHeading}>exp miss (vs aim line)</Text>
                  <View style={styles.mcMissRow}>
                    <Text style={styles.mcMissLabel}>Long</Text>
                    <Text style={styles.mcMissValue}>
                      {formatSignedMeters(mcResult.expLongMiss_m)}
                    </Text>
                    <Text style={styles.mcMissLabel}>Lat</Text>
                    <Text style={styles.mcMissValue}>
                      {formatSignedMeters(mcResult.expLatMiss_m)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.caddieTipLine}>Ingen plan – välj bana och pin.</Text>
          )}
          <TouchableOpacity
            onPress={handleApplyCaddiePlan}
            disabled={!caddiePlan}
            style={[
              styles.caddieApplyButton,
              !caddiePlan ? styles.caddieApplyButtonDisabled : null,
            ]}
          >
            <Text style={styles.caddieApplyButtonText}>Apply to HUD</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.plannerContainer, styles.sectionTitleSpacing]}>
          <TouchableOpacity
            onPress={() => setPlannerExpanded((prev) => !prev)}
            style={styles.plannerHeader}
          >
            <Text style={styles.sectionTitle}>Planner</Text>
            <Text style={styles.plannerChevron}>{plannerExpanded ? '▾' : '▸'}</Text>
          </TouchableOpacity>
          {plannerExpanded ? (
            <View style={styles.plannerContent}>
              <Text style={styles.plannerBase}>Base distance: {baseDistanceText}</Text>
              {plannerControls.map((control) => (
                <View key={control.key} style={styles.plannerRow}>
                  <View style={styles.plannerLabelBlock}>
                    <Text style={styles.plannerLabel}>{control.label}</Text>
                    <Text style={styles.plannerUnit}>{control.unit}</Text>
                  </View>
                  <View style={styles.plannerStepper}>
                    <TouchableOpacity
                      onPress={() => adjustPlannerValue(control.key, -control.step)}
                      style={styles.plannerStepButton}
                    >
                      <Text style={styles.plannerStepText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.plannerValue}>
                      {plannerInputs[control.key].toFixed(
                        control.key === 'wind_from_deg' ||
                          control.key === 'altitude_m' ||
                          control.key === 'temperatureC'
                          ? 0
                          : 1,
                      )}
                    </Text>
                    <TouchableOpacity
                      onPress={() => adjustPlannerValue(control.key, control.step)}
                      style={styles.plannerStepButton}
                    >
                      <Text style={styles.plannerStepText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.plannerButtonRow}>
                <TouchableOpacity
                  onPress={handleComputePlan}
                  disabled={plannerDisabled}
                  style={[
                    styles.plannerButton,
                    styles.plannerButtonPrimary,
                    plannerDisabled ? styles.plannerButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.plannerButtonText}>Compute</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleHit}
                  disabled={!plannerResult}
                  style={[styles.plannerButton, !plannerResult ? styles.plannerButtonDisabled : null]}
                >
                  <Text style={styles.plannerButtonText}>Hit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleArmLanding}
                  disabled={!shotSession}
                  style={[
                    styles.plannerButton,
                    markLandingArmed ? styles.plannerButtonActive : null,
                    !shotSession ? styles.plannerButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.plannerButtonText}>
                    {markLandingArmed ? 'Tap map…' : 'Mark landing'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.plannerResultBlock}>
                <Text style={styles.plannerResultText}>
                  Plays-Like: {plannerResult ? `${plannerResult.playsLike_m.toFixed(1)} m` : '—'}
                </Text>
                {plannerResult ? (
                  <>
                    <Text style={styles.plannerBreakdown}>
                      Δtemp {formatDelta(plannerResult.breakdown.temp_m)} / Δalt{' '}
                      {formatDelta(plannerResult.breakdown.alt_m)} / head{' '}
                      {formatDelta(plannerResult.breakdown.head_m)} / slope{' '}
                      {formatDelta(plannerResult.breakdown.slope_m)}
                    </Text>
                    {planClub ? (
                      <Text style={styles.plannerClub}>Suggested club: {planClub}</Text>
                    ) : null}
                  </>
                ) : null}
              </View>
              {shotSummary ? (
                <View style={styles.resultCard}>
                  <Text style={styles.resultCardTitle}>Result</Text>
                  <Text style={styles.resultCardLine}>
                    Planned: {shotSummary.planned.toFixed(1)} m ({shotSummary.plannedClub})
                  </Text>
                  <Text style={styles.resultCardLine}>
                    Actual carry: {shotSummary.actual.toFixed(1)} m ({shotSummary.actualClub})
                  </Text>
                  {shotSummary.sg ? (
                    <Text style={styles.resultCardLine}>
                      EV {formatEv(shotSummary.evBefore)}→{formatEv(shotSummary.evAfter)} · SG Δ{' '}
                      {formatSg(shotSummary.sg.total)} ({
                        shotSummary.planAdopted ? 'adopted plan' : 'not adopted'
                      })
                    </Text>
                  ) : null}
                  <Text style={styles.resultCardLine}>Error: {formatDelta(shotSummary.error)}</Text>
                  {shotSummary.feedback ? (
                    <View style={styles.resultCardFeedbackBlock}>
                      <View style={styles.resultCardFeedbackHeader}>
                        <Text style={styles.resultCardFeedbackTitle}>{shotSummary.feedback.title}</Text>
                        {shotSummary.feedback.tuningActive ? (
                          <View style={styles.resultCardFeedbackBadge}>
                            <Text style={styles.resultCardFeedbackBadgeText}>TUNED</Text>
                          </View>
                        ) : null}
                      </View>
                      {shotSummary.feedback.lines.map((line, index) => (
                        <Text key={`feedback-line-${index}`} style={styles.resultCardFeedbackLine}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={[styles.calibrationContainer, styles.sectionTitleSpacing]}>
          <TouchableOpacity
            onPress={() => setBagCalibExpanded((prev) => !prev)}
            style={styles.calibrationHeader}
          >
            <Text style={styles.sectionTitle}>Calibrate bag</Text>
            <Text style={styles.plannerChevron}>{bagCalibExpanded ? '▾' : '▸'}</Text>
          </TouchableOpacity>
          {bagCalibExpanded ? (
            <View style={styles.calibrationContent}>
              <Text style={styles.calibrationStatus}>
                {personalBagApplied ? 'Personal bag active' : 'Using default bag'}
              </Text>
              <View style={styles.calibrationActions}>
                <TouchableOpacity
                  onPress={handleCalibrateFromSession}
                  disabled={calibrationLoading}
                  style={[
                    styles.calibrationButton,
                    styles.calibrationButtonPrimary,
                    calibrationLoading ? styles.calibrationButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.calibrationButtonText}>
                    {calibrationLoading ? 'Loading…' : 'Use last session'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSavePersonalBag}
                  disabled={calibrationSaveDisabled}
                  style={[
                    styles.calibrationButton,
                    calibrationSaveDisabled ? styles.calibrationButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.calibrationButtonText}>Save as my bag</Text>
                </TouchableOpacity>
              </View>
              {calibrationMessage ? (
                <Text style={styles.calibrationMessage}>{calibrationMessage}</Text>
              ) : null}
              {calibrationLoading ? <ActivityIndicator size="small" color="#60a5fa" /> : null}
              <View style={styles.calibrationTable}>
                <View style={styles.calibrationRowHeader}>
                  <Text style={styles.calibrationHeaderClub}>Club</Text>
                  <Text style={styles.calibrationHeaderValue}>Default</Text>
                  <Text style={styles.calibrationHeaderValue}>Suggested</Text>
                </View>
                {CLUB_SEQUENCE.slice()
                  .reverse()
                  .map((club) => {
                    const baseline = defaultQaBag[club];
                    const suggested = calibrationResult?.suggested?.[club];
                    const perClub = calibrationResult?.perClub?.[club];
                    const delta =
                      typeof suggested === 'number'
                        ? Math.round(suggested - baseline)
                        : null;
                    const arrow =
                      delta === null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
                    const deltaText =
                      delta === null ? '—' : `${arrow}${Math.abs(delta)} m`;
                    return (
                      <View key={club} style={styles.calibrationRow}>
                        <View style={styles.calibrationClubCell}>
                          <Text style={styles.calibrationClubText}>{club}</Text>
                          {perClub?.n ? (
                            <Text style={styles.calibrationClubSubtext}>
                              {perClub.n} shots
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.calibrationValueText}>{`${baseline.toFixed(0)} m`}</Text>
                        <View style={styles.calibrationSuggestedCell}>
                          <Text style={styles.calibrationValueText}>
                            {typeof suggested === 'number' ? `${suggested.toFixed(0)} m` : '—'}
                          </Text>
                          <Text style={styles.calibrationDeltaText}>{deltaText}</Text>
                        </View>
                      </View>
                    );
                  })}
              </View>
            </View>
          ) : null}
        </View>
        <Text style={[styles.sectionTitle, styles.sectionTitleSpacing]}>Bundle</Text>
        {bundleLoading ? <ActivityIndicator size="small" color="#60a5fa" /> : null}
        {bundleError ? <Text style={styles.errorText}>{bundleError}</Text> : null}
        {bundle && !bundleLoading ? (
          <View style={styles.bundleDetails}>
            <Text style={styles.bundleLine}>Course: {bundle.courseId}</Text>
            <Text style={styles.bundleLine}>Version: {bundle.version}</Text>
            <Text style={styles.bundleLine}>TTL: {bundle.ttlSec}s</Text>
            <Text style={styles.bundleLine}>Features: {bundle.features.length}</Text>
          </View>
        ) : null}
        <CalibrationWizard
          visible={calibrationWizardVisible}
          onDismiss={handleCalibrationWizardDismiss}
          onSaved={handleCalibrationWizardSaved}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 16,
  },
  gnssCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  gnssBadge: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  gnssBadgeText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  gnssBadgeGood: {
    backgroundColor: '#166534',
  },
  gnssBadgeOk: {
    backgroundColor: '#854d0e',
  },
  gnssBadgePoor: {
    backgroundColor: '#7f1d1d',
  },
  gnssBadgeUnknown: {
    backgroundColor: '#1f2937',
  },
  gnssTip: {
    color: '#94a3b8',
    fontSize: 11,
    textTransform: 'none',
  },
  pickerContainer: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  searchContainer: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1120',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchInput: {
    color: '#f8fafc',
    fontSize: 14,
  },
  suggestionList: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1120',
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
    gap: 12,
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionTextBlock: {
    flexShrink: 1,
  },
  suggestionName: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 14,
  },
  suggestionDistance: {
    color: '#cbd5f5',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  autoPickCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  shareCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  shareTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  shareSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
  },
  shareButton: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  shareStatus: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  shareStatusError: {
    color: '#fca5a5',
  },
  autoPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  autoPickCopy: {
    flex: 1,
    gap: 4,
  },
  autoPickTitle: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '600',
  },
  autoPickStatus: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  autoPickStatusMuted: {
    color: '#94a3b8',
  },
  autoPickStatusError: {
    color: '#fca5a5',
  },
  autoPickPromptBox: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  autoPickPromptText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18,
  },
  autoPickPromptActions: {
    flexDirection: 'row',
    gap: 8,
  },
  autoPickButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#334155',
  },
  autoPickPrimaryButton: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  autoPickButtonLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1d4ed8',
  },
  refreshText: {
    color: '#f8fafc',
    fontWeight: '500',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
  },
  placeholderText: {
    color: '#9ca3af',
    paddingVertical: 8,
  },
  courseScroll: {
    flexGrow: 0,
  },
  courseButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1f2937',
    marginRight: 8,
  },
  courseButtonActive: {
    backgroundColor: '#2563eb',
  },
  courseButtonText: {
    color: '#e5e7eb',
    fontWeight: '500',
  },
  courseButtonTextActive: {
    color: '#ffffff',
  },
  cameraSection: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cameraStub: {
    padding: 16,
    backgroundColor: '#0b1120',
  },
  cameraLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: 14,
  },
  cameraStat: {
    color: '#cbd5f5',
    fontSize: 12,
    marginTop: 2,
  },
  ghostContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2937',
    gap: 12,
  },
  ghostTitle: {
    color: '#cbd5f5',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  ghostGraph: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  ghostMarker: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#facc15',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  ghostStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  ghostStat: {
    flex: 1,
    gap: 4,
  },
  ghostLabel: {
    color: '#94a3b8',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  ghostValue: {
    color: '#f8fafc',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  overlayWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  statusPanel: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  calibrationChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  calibrationChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  calibrationChipGood: {
    backgroundColor: 'rgba(34,197,94,0.18)',
  },
  calibrationChipOk: {
    backgroundColor: 'rgba(234,179,8,0.18)',
  },
  calibrationChipPoor: {
    backgroundColor: 'rgba(248,113,113,0.18)',
  },
  calibrationChipLabel: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 13,
  },
  calibrationChipButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#1e3a8a',
  },
  calibrationChipButtonText: {
    color: '#bfdbfe',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  calibrationChipMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  calibrationNudgeCard: {
    marginTop: 4,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  calibrationNudgeText: {
    color: '#bfdbfe',
    fontSize: 12,
    lineHeight: 18,
  },
  pinControlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pinButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1f2937',
  },
  pinButtonPrimary: {
    backgroundColor: '#2563eb',
  },
  pinButtonDisabled: {
    opacity: 0.4,
  },
  pinButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  pinSectionPill: {
    marginTop: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: '#1e293b',
  },
  pinSectionChevron: {
    color: '#f8fafc',
    fontSize: 12,
    marginRight: 4,
  },
  pinSectionLabel: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  plannerContainer: {
    backgroundColor: '#101827',
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  plannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plannerChevron: {
    color: '#94a3b8',
    fontSize: 16,
  },
  plannerContent: {
    gap: 12,
  },
  plannerBase: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  plannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  plannerLabelBlock: {
    flex: 1,
    gap: 2,
  },
  plannerLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  plannerUnit: {
    color: '#94a3b8',
    fontSize: 12,
  },
  plannerStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plannerStepButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannerStepText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  plannerValue: {
    minWidth: 68,
    textAlign: 'center',
    color: '#f8fafc',
    fontVariant: ['tabular-nums'],
  },
  plannerButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  plannerButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannerButtonPrimary: {
    backgroundColor: '#2563eb',
  },
  plannerButtonActive: {
    backgroundColor: '#7c3aed',
  },
  plannerButtonDisabled: {
    opacity: 0.5,
  },
  plannerButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  plannerResultBlock: {
    gap: 6,
  },
  plannerResultText: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 15,
  },
  plannerBreakdown: {
    color: '#cbd5f5',
    fontSize: 12,
    lineHeight: 18,
  },
  plannerClub: {
    color: '#facc15',
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: '#0b1120',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 4,
  },
  resultCardTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 14,
  },
  resultCardLine: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  resultCardFeedbackBlock: {
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    marginTop: 6,
    paddingTop: 6,
    gap: 4,
  },
  resultCardFeedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultCardFeedbackTitle: {
    color: '#f97316',
    fontWeight: '700',
    fontSize: 13,
  },
  resultCardFeedbackBadge: {
    backgroundColor: '#1d4ed8',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resultCardFeedbackBadgeText: {
    color: '#bfdbfe',
    fontSize: 10,
    fontWeight: '700',
  },
  resultCardFeedbackLine: {
    color: '#f8fafc',
    fontSize: 12,
  },
  caddieContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  caddieHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caddieBadge: {
    backgroundColor: '#1f2937',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  caddieBadgeText: {
    color: '#facc15',
    fontSize: 10,
    fontWeight: '700',
  },
  caddieDispersionBlock: {
    backgroundColor: '#0b1120',
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  caddieDispersionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caddieDispersionTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  caddieDispersionTimestamp: {
    color: '#94a3b8',
    fontSize: 11,
  },
  caddieDispersionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  caddieDispersionButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#1f2937',
  },
  caddieDispersionButtonPrimary: {
    backgroundColor: '#2563eb',
  },
  caddieDispersionButtonDisabled: {
    opacity: 0.5,
  },
  caddieDispersionButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 12,
  },
  caddieDispersionMessage: {
    color: '#cbd5f5',
    fontSize: 11,
  },
  caddieDispersionTable: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  caddieDispersionRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 12,
  },
  caddieDispersionHeaderClub: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  caddieDispersionHeaderValue: {
    width: 60,
    textAlign: 'right',
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  caddieDispersionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 12,
    backgroundColor: '#0f172a',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2937',
  },
  caddieDispersionClub: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  caddieDispersionValue: {
    width: 60,
    textAlign: 'right',
    color: '#e2e8f0',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  caddieDispersionEmpty: {
    color: '#94a3b8',
    fontSize: 12,
  },
  caddieModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  caddieModeOption: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caddieModeOptionActive: {
    backgroundColor: '#2563eb',
  },
  caddieModeText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  caddieModeTextActive: {
    color: '#f8fafc',
  },
  caddieStyleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  caddieStyleBlock: {
    flex: 1,
    gap: 6,
  },
  caddieStyleLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  caddieStyleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  caddieStyleOption: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  caddieStyleOptionSmall: {
    paddingHorizontal: 8,
  },
  caddieStyleOptionActive: {
    backgroundColor: '#2563eb',
  },
  caddieStyleOptionText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  caddieStyleOptionTextActive: {
    color: '#f8fafc',
  },
  caddieStyleOptionDisabled: {
    opacity: 0.4,
  },
  caddieStyleOptionTextDisabled: {
    color: '#4b5563',
  },
  caddieStyleRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  caddieStyleLanguageBlock: {
    flex: 1,
    gap: 6,
  },
  caddieStyleToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  caddieStyleToggleLabel: {
    color: '#cbd5f5',
    fontSize: 12,
    fontWeight: '600',
  },
  caddieVoiceBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2937',
    gap: 10,
  },
  caddieVoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceSliderGroup: {
    gap: 6,
  },
  voiceSliderBlock: {
    gap: 4,
  },
  voiceSliderLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
  },
  voiceSliderLabelDisabled: {
    color: '#4b5563',
  },
  voiceSliderTrack: {
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  voiceSliderTrackDisabled: {
    backgroundColor: '#111827',
  },
  voiceSliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#2563eb',
    borderRadius: 11,
  },
  voiceSliderHandle: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#0f172a',
  },
  caddieVoiceActions: {
    flexDirection: 'row',
    gap: 8,
  },
  caddieVoiceButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  caddieVoiceButtonSecondary: {
    backgroundColor: '#1f2937',
  },
  caddieVoiceButtonDisabled: {
    backgroundColor: '#1f2937',
    opacity: 0.4,
  },
  caddieVoiceButtonLast: {
    marginRight: 0,
  },
  caddieVoiceButtonLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  caddieToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caddieToggleLabel: {
    color: '#cbd5f5',
    fontSize: 13,
    fontWeight: '600',
  },
  mcControls: {
    marginTop: 8,
    gap: 8,
  },
  mcSamplesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mcSamplesLabel: {
    color: '#cbd5f5',
    fontSize: 12,
    fontWeight: '600',
  },
  mcSamplesValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  mcSliderTrack: {
    position: 'relative',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
  },
  mcSliderFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  mcSliderHandle: {
    position: 'absolute',
    top: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#0f172a',
  },
  mcSamplesTicks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mcSamplesTickLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
  },
  caddiePlanBlock: {
    gap: 6,
  },
  caddiePlanTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  greenSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 2,
  },
  greenSectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 4,
  },
  greenSectionLabelText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '600',
  },
  greenSectionIcon: {
    color: '#38bdf8',
    fontSize: 12,
  },
  caddieTipLine: {
    color: '#cbd5f5',
    fontSize: 13,
    lineHeight: 18,
  },
  caddieAdviceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  caddieAdviceChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  caddieAdviceText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '600',
  },
  mcStatsBlock: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 6,
  },
  mcMiniBarBlock: {
    gap: 4,
  },
  mcMiniBarLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mcMiniBarLabel: {
    color: '#cbd5f5',
    fontSize: 11,
    fontWeight: '600',
  },
  mcMiniBarTrack: {
    height: 4,
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  mcMiniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  mcMiniBarFillPositive: {
    backgroundColor: '#16a34a',
  },
  mcMiniBarFillNegative: {
    backgroundColor: '#ef4444',
  },
  mcMissHeading: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  mcMissRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  mcMissLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  mcMissValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  caddieApplyButton: {
    marginTop: 4,
    borderRadius: 8,
    backgroundColor: '#10b981',
    paddingVertical: 10,
    alignItems: 'center',
  },
  caddieApplyButtonDisabled: {
    backgroundColor: '#1e293b',
  },
  caddieApplyButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  calloutRow: {
    flexDirection: 'row',
    gap: 8,
  },
  calloutCard: {
    flex: 1,
    backgroundColor: '#0b1120',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 4,
  },
  calloutLabel: {
    color: '#cbd5f5',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  calloutValue: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 14,
  },
  calloutSubtext: {
    color: '#94a3b8',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  autoLandingBanner: {
    marginTop: 12,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  autoLandingText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  autoLandingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoLandingButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
  },
  autoLandingPrimaryButton: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  autoLandingButtonLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  autoLandingDismissButton: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
  },
  autoLandingDismissLabel: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  calibrationContainer: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  calibrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calibrationContent: {
    gap: 12,
  },
  calibrationStatus: {
    color: '#94a3b8',
    fontSize: 12,
  },
  calibrationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  calibrationButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
  },
  calibrationButtonPrimary: {
    backgroundColor: '#1d4ed8',
  },
  calibrationButtonDisabled: {
    opacity: 0.5,
  },
  calibrationButtonText: {
    color: '#f8fafc',
    fontWeight: '500',
  },
  calibrationMessage: {
    color: '#f8fafc',
    fontSize: 12,
  },
  calibrationTable: {
    gap: 6,
  },
  calibrationRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomColor: '#1f2937',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calibrationHeaderClub: {
    flex: 1,
    color: '#cbd5f5',
    fontSize: 12,
    fontWeight: '500',
  },
  calibrationHeaderValue: {
    flex: 1,
    color: '#cbd5f5',
    fontSize: 12,
    textAlign: 'right',
    fontWeight: '500',
  },
  calibrationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomColor: '#1f2937',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calibrationClubCell: {
    flex: 1,
    gap: 2,
  },
  calibrationClubText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  calibrationClubSubtext: {
    color: '#94a3b8',
    fontSize: 11,
  },
  calibrationValueText: {
    flex: 1,
    color: '#e2e8f0',
    textAlign: 'right',
  },
  calibrationSuggestedCell: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  calibrationDeltaText: {
    color: '#facc15',
    fontSize: 11,
  },
  sectionTitleSpacing: {
    marginTop: 12,
  },
  bundleDetails: {
    gap: 4,
  },
  bundleLine: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  mapContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  mapBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b1120',
  },
  offlineBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#f97316',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  offlineBadgeText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 10,
  },
  markLandingBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  markLandingText: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  hazardBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  hazardLabel: {
    color: '#cbd5f5',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hazardValue: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default QAArHudOverlayScreen;
