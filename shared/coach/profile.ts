import type { TrainingFocus } from '../training/types';
import { getItem, removeItem, setItem } from '../core/pstore';
import { getCaddieRc } from '../caddie/rc';

export type { TrainingFocus } from '../training/types';

export interface PlayerProfile {
  id: string;
  version: '1.0';
  updatedAt: string;
  focusWeights: Record<TrainingFocus, number>;
  riskPreference: 'safe' | 'normal' | 'aggressive';
  style: { tone: 'concise' | 'neutral' | 'pep'; verbosity: 'short' | 'normal' | 'detailed' };
  adherenceScore: number;
  sgLiftByFocus: Partial<Record<TrainingFocus, number>>;
  adoptRate: number;
}

export interface PracticeUpdate {
  focus: TrainingFocus;
  completed: boolean;
  sgDelta?: number;
}

export interface RoundUpdate {
  adopt: boolean;
  sgLift?: Record<TrainingFocus, number>;
}

export interface SyncOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const STORAGE_KEY = 'coach.profile.v1';
const LEGACY_PRIVACY_KEY = 'coach.profile.privacy';
const COACH_OPTIN_KEY = 'privacy.coachLearning.optIn';
const PROFILE_VERSION = '1.0';
const TRAINING_FOCUS_VALUES: readonly TrainingFocus[] = [
  'long-drive',
  'tee',
  'approach',
  'wedge',
  'short',
  'putt',
  'recovery',
];

const DEFAULT_STYLE: PlayerProfile['style'] = { tone: 'neutral', verbosity: 'normal' };

let profileCache: PlayerProfile | null = null;
let profileIdCache: string | null = null;
let privacyOptInCache: boolean | null = null;

interface CoachTelemetryEvent {
  event: 'coach.profile.updated';
  data: Record<string, unknown>;
}

interface CoachTelemetrySink {
  (event: CoachTelemetryEvent): void;
}

interface TelemetryGlobal {
  __COACH_PROFILE_TELEMETRY__?: unknown;
}

function getTelemetrySink(): CoachTelemetrySink | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const holder = globalThis as TelemetryGlobal;
  const candidate = holder.__COACH_PROFILE_TELEMETRY__;
  if (typeof candidate === 'function') {
    return candidate as CoachTelemetrySink;
  }
  return null;
}

function emitProfileTelemetry(previous: PlayerProfile, next: PlayerProfile, dWeights: Record<TrainingFocus, number>): void {
  const sink = getTelemetrySink();
  const payload: Record<string, unknown> = {
    id: next.id,
    updatedAt: next.updatedAt,
    dWeights,
    dRisk:
      previous.riskPreference === next.riskPreference
        ? null
        : { from: previous.riskPreference, to: next.riskPreference },
    dStyle: {
      tone:
        previous.style.tone === next.style.tone
          ? null
          : { from: previous.style.tone, to: next.style.tone },
      verbosity:
        previous.style.verbosity === next.style.verbosity
          ? null
          : { from: previous.style.verbosity, to: next.style.verbosity },
    },
    sgLiftByFocus: next.sgLiftByFocus,
  };
  if (sink) {
    try {
      sink({ event: 'coach.profile.updated', data: payload });
      return;
    } catch {
      // ignore telemetry sink failures
    }
  }
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[coach] profile updated', payload);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function nowIso(date?: Date): string {
  return (date ?? new Date()).toISOString();
}

function withDefaultFocusWeights(weights?: Partial<Record<TrainingFocus, number>>): Record<TrainingFocus, number> {
  const result: Record<TrainingFocus, number> = {
    'long-drive': 1 / TRAINING_FOCUS_VALUES.length,
    tee: 1 / TRAINING_FOCUS_VALUES.length,
    approach: 1 / TRAINING_FOCUS_VALUES.length,
    wedge: 1 / TRAINING_FOCUS_VALUES.length,
    short: 1 / TRAINING_FOCUS_VALUES.length,
    putt: 1 / TRAINING_FOCUS_VALUES.length,
    recovery: 1 / TRAINING_FOCUS_VALUES.length,
  };
  if (!weights) {
    return result;
  }
  let sum = 0;
  TRAINING_FOCUS_VALUES.forEach((focus) => {
    const value = typeof weights[focus] === 'number' ? Number(weights[focus]) : 0;
    if (Number.isFinite(value) && value > 0) {
      result[focus] = value;
      sum += value;
    }
  });
  if (sum <= 0) {
    return result;
  }
  TRAINING_FOCUS_VALUES.forEach((focus) => {
    result[focus] = Math.max(0, result[focus]) / sum;
  });
  return result;
}

function normalizeStyle(value: unknown): PlayerProfile['style'] {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_STYLE };
  }
  const input = value as Partial<PlayerProfile['style']>;
  const tone = input?.tone;
  const verbosity = input?.verbosity;
  const validTone: PlayerProfile['style']['tone'][] = ['concise', 'neutral', 'pep'];
  const validVerbosity: PlayerProfile['style']['verbosity'][] = ['short', 'normal', 'detailed'];
  return {
    tone: validTone.includes(tone as PlayerProfile['style']['tone']) ? (tone as PlayerProfile['style']['tone']) : DEFAULT_STYLE.tone,
    verbosity: validVerbosity.includes(verbosity as PlayerProfile['style']['verbosity'])
      ? (verbosity as PlayerProfile['style']['verbosity'])
      : DEFAULT_STYLE.verbosity,
  };
}

export function createDefaultProfile(id: string, timestamp: Date = new Date()): PlayerProfile {
  return {
    id,
    version: PROFILE_VERSION,
    updatedAt: nowIso(timestamp),
    focusWeights: withDefaultFocusWeights(),
    riskPreference: 'normal',
    style: { ...DEFAULT_STYLE },
    adherenceScore: 0.5,
    sgLiftByFocus: {},
    adoptRate: 0.5,
  };
}

function cloneProfile(profile: PlayerProfile): PlayerProfile {
  return {
    ...profile,
    focusWeights: { ...profile.focusWeights },
    style: { ...profile.style },
    sgLiftByFocus: { ...profile.sgLiftByFocus },
  };
}

function normalizeProfile(raw: unknown, id: string): PlayerProfile {
  if (!raw || typeof raw !== 'object') {
    return createDefaultProfile(id);
  }
  const input = raw as Partial<PlayerProfile>;
  const profileId = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : id;
  const focusWeights = withDefaultFocusWeights(input.focusWeights);
  const risk = input.riskPreference;
  const style = normalizeStyle(input.style);
  const adherence = clamp01(typeof input.adherenceScore === 'number' ? input.adherenceScore : 0.5);
  const adoptRate = clamp01(typeof input.adoptRate === 'number' ? input.adoptRate : 0.5);
  const sgLift: Partial<Record<TrainingFocus, number>> = {};
  if (input.sgLiftByFocus && typeof input.sgLiftByFocus === 'object') {
    TRAINING_FOCUS_VALUES.forEach((focus) => {
      const value = (input.sgLiftByFocus as Record<string, unknown>)[focus];
      if (typeof value === 'number' && Number.isFinite(value)) {
        sgLift[focus] = value;
      }
    });
  }
  const updatedAt = typeof input.updatedAt === 'string' && input.updatedAt.trim().length
    ? input.updatedAt
    : nowIso();
  return {
    id: profileId,
    version: PROFILE_VERSION,
    updatedAt,
    focusWeights,
    riskPreference: risk === 'safe' || risk === 'aggressive' ? risk : 'normal',
    style,
    adherenceScore: adherence,
    sgLiftByFocus: sgLift,
    adoptRate,
  };
}

async function readStoredProfile(): Promise<unknown> {
  try {
    const raw = await getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function writeStoredProfile(profile: PlayerProfile): Promise<void> {
  try {
    await setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage failure
  }
}

function ema(current: number, target: number, alpha: number): number {
  if (alpha <= 0) {
    return current;
  }
  if (alpha >= 1) {
    return target;
  }
  return current * (1 - alpha) + target * alpha;
}

function adjustWeights(weights: Record<TrainingFocus, number>, focus: TrainingFocus, delta: number): Record<TrainingFocus, number> {
  const next: Record<TrainingFocus, number> = { ...weights };
  next[focus] = Math.max(0, (next[focus] ?? 0) + delta);
  let sum = 0;
  TRAINING_FOCUS_VALUES.forEach((key) => {
    sum += Math.max(0, next[key] ?? 0);
  });
  if (sum <= 0) {
    return withDefaultFocusWeights();
  }
  TRAINING_FOCUS_VALUES.forEach((key) => {
    next[key] = Math.max(0, next[key] ?? 0) / sum;
  });
  return next;
}

function updateSgLift(
  existing: Partial<Record<TrainingFocus, number>>,
  updates: Partial<Record<TrainingFocus, number>>,
  alpha: number,
): Partial<Record<TrainingFocus, number>> {
  const next: Partial<Record<TrainingFocus, number>> = { ...existing };
  TRAINING_FOCUS_VALUES.forEach((focus) => {
    if (Object.prototype.hasOwnProperty.call(updates, focus)) {
      const value = updates[focus];
      if (typeof value === 'number' && Number.isFinite(value)) {
        const current = typeof next[focus] === 'number' ? (next[focus] as number) : 0;
        next[focus] = ema(current, value, alpha);
      }
    }
  });
  return next;
}

export async function loadPlayerProfile(id: string): Promise<PlayerProfile> {
  if (profileCache && profileIdCache === id) {
    return cloneProfile(profileCache);
  }
  const stored = await readStoredProfile();
  const normalized = normalizeProfile(stored, id);
  profileCache = normalized;
  profileIdCache = id;
  return cloneProfile(normalized);
}

export async function savePlayerProfile(profile: PlayerProfile, options?: SyncOptions): Promise<void> {
  profileCache = cloneProfile(profile);
  profileIdCache = profile.id;
  await writeStoredProfile(profile);
  const rc = getCaddieRc();
  const syncEnabled = rc.coach.syncEnabled && (await isCoachLearningOptedIn());
  if (!syncEnabled) {
    return;
  }
  const fetchImpl = options?.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) {
    return;
  }
  const base = options?.baseUrl ?? '';
  const url = `${base}/coach/profile`;
  try {
    await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: profile.id, profile }),
    });
  } catch {
    // ignore sync failures
  }
}

export async function resetPlayerProfile(id: string): Promise<PlayerProfile> {
  profileCache = null;
  profileIdCache = null;
  await removeItem(STORAGE_KEY);
  const next = createDefaultProfile(id);
  await savePlayerProfile(next);
  return cloneProfile(next);
}

export async function setCoachLearningOptIn(value: boolean): Promise<void> {
  privacyOptInCache = value;
  const serialized = value ? '1' : '0';
  try {
    await setItem(COACH_OPTIN_KEY, serialized);
  } catch {
    // ignore persistence failure
  }
  try {
    await setItem(LEGACY_PRIVACY_KEY, serialized);
  } catch {
    // ignore legacy persistence failure
  }
}

export async function isCoachLearningOptedIn(): Promise<boolean> {
  if (privacyOptInCache !== null) {
    return privacyOptInCache;
  }
  const readFlag = async (key: string): Promise<boolean | null> => {
    try {
      const raw = await getItem(key);
      if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        return ['1', 'true', 'yes', 'on'].includes(normalized);
      }
    } catch {
      // ignore storage errors
    }
    return null;
  };
  const current = await readFlag(COACH_OPTIN_KEY);
  if (current !== null) {
    privacyOptInCache = current;
    return current;
  }
  const legacy = await readFlag(LEGACY_PRIVACY_KEY);
  if (legacy !== null) {
    privacyOptInCache = legacy;
    return legacy;
  }
  privacyOptInCache = false;
  return false;
}

export async function isCoachLearningActive(rc: { coach?: { learningEnabled?: boolean } }): Promise<boolean> {
  const optIn = await isCoachLearningOptedIn();
  return Boolean(rc?.coach?.learningEnabled) && optIn;
}

export async function pullRemoteProfile(id: string, options?: SyncOptions): Promise<PlayerProfile | null> {
  const rc = getCaddieRc();
  if (!rc.coach.syncEnabled || !(await isCoachLearningOptedIn())) {
    return null;
  }
  const fetchImpl = options?.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) {
    return null;
  }
  const base = options?.baseUrl ?? '';
  const url = `${base}/coach/profile?deviceId=${encodeURIComponent(id)}`;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as unknown;
    const normalized = normalizeProfile(data, id);
    return normalized;
  } catch {
    return null;
  }
}

function applyPracticeUpdate(profile: PlayerProfile, update: PracticeUpdate, timestamp: Date): PlayerProfile {
  const previous = cloneProfile(profile);
  const newWeights = adjustWeights(previous.focusWeights, update.focus, update.completed ? 0.08 : -0.04);
  let lifts = previous.sgLiftByFocus;
  if (typeof update.sgDelta === 'number' && Number.isFinite(update.sgDelta)) {
    lifts = updateSgLift(previous.sgLiftByFocus, { [update.focus]: update.sgDelta }, 0.35);
  }
  const next: PlayerProfile = {
    ...previous,
    updatedAt: nowIso(timestamp),
    focusWeights: newWeights,
    adherenceScore: ema(previous.adherenceScore, update.completed ? 1 : 0, 0.3),
    sgLiftByFocus: lifts,
  };
  emitProfileTelemetry(previous, next, diffWeights(previous.focusWeights, next.focusWeights));
  return next;
}

function diffWeights(before: Record<TrainingFocus, number>, after: Record<TrainingFocus, number>): Record<TrainingFocus, number> {
  const delta: Record<TrainingFocus, number> = {} as Record<TrainingFocus, number>;
  TRAINING_FOCUS_VALUES.forEach((focus) => {
    delta[focus] = (after[focus] ?? 0) - (before[focus] ?? 0);
  });
  return delta;
}

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function applyRoundUpdate(profile: PlayerProfile, update: RoundUpdate, timestamp: Date): PlayerProfile {
  const previous = cloneProfile(profile);
  const weightAdjustments: Record<TrainingFocus, number> = {} as Record<TrainingFocus, number>;
  if (update.sgLift && typeof update.sgLift === 'object') {
    Object.entries(update.sgLift).forEach(([key, value]) => {
      if (!TRAINING_FOCUS_VALUES.includes(key as TrainingFocus)) {
        return;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return;
      }
      const focus = key as TrainingFocus;
      weightAdjustments[focus] = Math.max(-0.1, Math.min(0.1, -value * 0.1));
    });
  }
  let newWeights = previous.focusWeights;
  Object.entries(weightAdjustments).forEach(([key, delta]) => {
    newWeights = adjustWeights(newWeights, key as TrainingFocus, delta as number);
  });
  const lifts = update.sgLift ? updateSgLift(previous.sgLiftByFocus, update.sgLift, 0.4) : previous.sgLiftByFocus;
  const adoption = ema(previous.adoptRate, update.adopt ? 1 : 0, 0.25);
  const liftValues = Object.values(lifts).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const avgLift = mean(liftValues);
  let riskPreference: PlayerProfile['riskPreference'] = previous.riskPreference;
  if (adoption < 0.35) {
    riskPreference = 'safe';
  } else if (adoption > 0.7 && avgLift > 0.05 && previous.adherenceScore > 0.6) {
    riskPreference = 'aggressive';
  } else if (avgLift >= -0.05) {
    riskPreference = 'normal';
  }
  const adherence = ema(previous.adherenceScore, update.adopt ? 1 : 0.5, 0.15);
  const style = deriveStyleFromMetrics(previous.style, adherence, avgLift);
  const next: PlayerProfile = {
    ...previous,
    updatedAt: nowIso(timestamp),
    focusWeights: newWeights,
    sgLiftByFocus: lifts,
    riskPreference,
    adoptRate: adoption,
    adherenceScore: adherence,
    style,
  };
  emitProfileTelemetry(previous, next, diffWeights(previous.focusWeights, next.focusWeights));
  return next;
}

function deriveStyleFromMetrics(
  current: PlayerProfile['style'],
  adherence: number,
  avgLift: number,
): PlayerProfile['style'] {
  if (adherence < 0.4) {
    return { tone: 'concise', verbosity: 'short' };
  }
  if (avgLift > 0.15 && adherence > 0.65) {
    return { tone: 'pep', verbosity: 'detailed' };
  }
  if (adherence > 0.55) {
    return { tone: current.tone === 'concise' ? 'neutral' : current.tone, verbosity: 'normal' };
  }
  return { ...current };
}

export function updateFromPractice(profile: PlayerProfile, update: PracticeUpdate, timestamp: Date = new Date()): PlayerProfile {
  return applyPracticeUpdate(profile, update, timestamp);
}

export function updateFromRound(profile: PlayerProfile, update: RoundUpdate, timestamp: Date = new Date()): PlayerProfile {
  return applyRoundUpdate(profile, update, timestamp);
}

function decayTowards(value: number, baseline: number, factor: number): number {
  return baseline + (value - baseline) * factor;
}

export function decay(profile: PlayerProfile, now: Date = new Date(), halfLifeDays?: number): PlayerProfile {
  const rc = getCaddieRc();
  const halfLife = typeof halfLifeDays === 'number' && halfLifeDays > 0 ? halfLifeDays : rc.coach.decayHalfLifeDays;
  const lastUpdated = Date.parse(profile.updatedAt);
  if (!Number.isFinite(lastUpdated)) {
    return profile;
  }
  const elapsedMs = now.getTime() - lastUpdated;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return profile;
  }
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  const decayFactor = Math.exp((-Math.log(2) / halfLife) * elapsedDays);
  const uniform = 1 / TRAINING_FOCUS_VALUES.length;
  const nextWeights: Record<TrainingFocus, number> = { ...profile.focusWeights };
  TRAINING_FOCUS_VALUES.forEach((focus) => {
    const current = profile.focusWeights[focus] ?? uniform;
    nextWeights[focus] = decayTowards(current, uniform, decayFactor);
  });
  let sum = 0;
  TRAINING_FOCUS_VALUES.forEach((focus) => {
    sum += nextWeights[focus];
  });
  if (sum > 0) {
    TRAINING_FOCUS_VALUES.forEach((focus) => {
      nextWeights[focus] = nextWeights[focus] / sum;
    });
  }
  const next: PlayerProfile = {
    ...profile,
    updatedAt: nowIso(now),
    focusWeights: nextWeights,
    sgLiftByFocus: Object.fromEntries(
      Object.entries(profile.sgLiftByFocus).map(([key, value]) => {
        if (!TRAINING_FOCUS_VALUES.includes(key as TrainingFocus) || typeof value !== 'number') {
          return [key, value];
        }
        return [key, value * decayFactor];
      }),
    ),
    adherenceScore: decayTowards(profile.adherenceScore, 0.5, decayFactor),
    adoptRate: decayTowards(profile.adoptRate, 0.5, decayFactor),
  };
  emitProfileTelemetry(profile, next, diffWeights(profile.focusWeights, next.focusWeights));
  return next;
}

export async function resolveProfileId(): Promise<string> {
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
  } catch {
    // ignore missing module
  }
  try {
    const Constants = (await import('expo-constants')) as Record<string, unknown> & {
      installationId?: string | null;
      deviceId?: string | null;
    };
    if (Constants && typeof Constants === 'object') {
      const installationId = typeof Constants.installationId === 'string' ? Constants.installationId.trim() : '';
      if (installationId) {
        return installationId;
      }
      const deviceId = typeof Constants.deviceId === 'string' ? Constants.deviceId.trim() : '';
      if (deviceId) {
        return deviceId;
      }
    }
  } catch {
    // ignore missing module
  }
  return 'unknown-device';
}
