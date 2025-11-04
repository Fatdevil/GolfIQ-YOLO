import type { RoundState, ShotEvent } from "../round/types";
import { CloudEvent, CloudRound, CloudShot } from "./types";

type RealtimeChannelLike = {
  on: (...args: unknown[]) => RealtimeChannelLike;
  subscribe: (...args: unknown[]) => Promise<{ status?: string } | undefined>;
  unsubscribe: () => Promise<void>;
};

type SupabaseClientLike = {
  from: (table: string) => {
    upsert: (payload: unknown, options?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    insert?: (payload: unknown) => Promise<{ data: unknown; error: unknown }>;
    select: (...args: unknown[]) => any;
    eq?: (...args: unknown[]) => any;
    delete?: (...args: unknown[]) => {
      in?: (column: string, values: unknown[]) => Promise<{ data?: unknown; error: unknown }>;
      match?: (criteria: Record<string, unknown>) => Promise<{ data?: unknown; error: unknown }>;
    };
  };
  channel: (name: string) => RealtimeChannelLike;
};

type SupabaseModuleLike = {
  createClient: (
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ) => SupabaseClientLike;
};

const ENV_URL_KEYS = [
  "SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_URL",
  "QA_SUPABASE_URL",
];

const ENV_KEY_KEYS = [
  "SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "QA_SUPABASE_ANON_KEY",
];

const ENV_FLAG_KEYS = [
  "CLOUD_SYNC_ENABLED",
  "EXPO_PUBLIC_CLOUD_SYNC",
  "QA_CLOUD_SYNC",
];

const RC_FLAG_KEYS = ["cloud.sync.enabled", "cloud.sync.beta"] as const;

const SHOT_BATCH_SIZE = 100;

const SUPABASE_MODULE_ID = "@supabase/supabase-js";

let client: SupabaseClientLike | null = null;
let clientOverride: SupabaseClientLike | null = null;
let enabledOverride: boolean | null = null;

let supabaseModulePromise: Promise<SupabaseModuleLike | null> | null = null;

const roundFingerprints = new Map<string, string>();
const shotFingerprints = new Map<string, string>();
type TelemetryFn = (event: string, payload?: Record<string, unknown>) => void;
let telemetry: TelemetryFn | null = null;

function chunk<T>(input: readonly T[], size: number): T[][] {
  if (size <= 0) {
    return [Array.from(input)];
  }
  const result: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    result.push(Array.from(input.slice(i, i + size)));
  }
  return result;
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "unknown";
}

function readEnv(key: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  const env = (process as { env?: Record<string, string | undefined> }).env;
  return env ? env[key] : undefined;
}

function firstTruthy(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = readEnv(key);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return ["1", "true", "yes", "on", "enabled"].includes(normalized);
  }
  return false;
}

function readRcFlag(): boolean {
  if (typeof globalThis === "undefined") {
    return false;
  }
  const candidate = (globalThis as Record<string, unknown>).RC;
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  const record = candidate as Record<string, unknown>;
  for (const key of RC_FLAG_KEYS) {
    if (normalizeBoolean(record[key])) {
      return true;
    }
  }
  return false;
}

function hasCredentials(): boolean {
  const url = firstTruthy(ENV_URL_KEYS);
  const key = firstTruthy(ENV_KEY_KEYS);
  return Boolean(url && key);
}

function envFlagEnabled(): boolean {
  for (const key of ENV_FLAG_KEYS) {
    if (normalizeBoolean(readEnv(key))) {
      return true;
    }
  }
  return false;
}

function now(): number {
  return Date.now();
}

async function loadSupabaseModule(): Promise<SupabaseModuleLike | null> {
  if (supabaseModulePromise) {
    return supabaseModulePromise;
  }
  supabaseModulePromise = (async () => {
    try {
      const mod = await import(/* @vite-ignore */ SUPABASE_MODULE_ID);
      return mod as SupabaseModuleLike;
    } catch {
      return null;
    }
  })();
  return supabaseModulePromise;
}

function buildCloudRound(round: RoundState): CloudRound {
  const holes: CloudRound["holes"] = {};
  for (const entry of Object.values(round.holes ?? {})) {
    const holeNo = Number(entry.hole ?? entry);
    if (!Number.isFinite(holeNo) || holeNo <= 0) {
      continue;
    }
    holes[holeNo] = {
      par: Number.isFinite(entry.par ?? NaN) ? Number(entry.par) : 4,
      index: Number.isFinite(entry.index ?? NaN) ? Number(entry.index) : undefined,
      pin:
        entry.pin && Number.isFinite(entry.pin.lat ?? NaN) && Number.isFinite(entry.pin.lon ?? NaN)
          ? { lat: Number(entry.pin.lat), lon: Number(entry.pin.lon) }
          : undefined,
      manualScore: Number.isFinite(entry.manualScore ?? NaN) ? Number(entry.manualScore) : undefined,
      manualPutts: Number.isFinite(entry.manualPutts ?? NaN) ? Number(entry.manualPutts) : undefined,
    };
  }
  return {
    id: String(round.id),
    courseId: String(round.courseId),
    startedAt: Number.isFinite(round.startedAt) ? Number(round.startedAt) : now(),
    finishedAt: Number.isFinite(round.finishedAt ?? NaN) ? Number(round.finishedAt) : undefined,
    currentHole: Number.isFinite(round.currentHole) ? Number(round.currentHole) : 1,
    tournamentSafe: Boolean(round.tournamentSafe),
    holes,
    updatedAt: now(),
  };
}

function serializeRound(row: CloudRound): Record<string, unknown> {
  return {
    id: row.id,
    course_id: row.courseId,
    started_at: new Date(row.startedAt).toISOString(),
    finished_at: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
    current_hole: row.currentHole,
    tournament_safe: row.tournamentSafe,
    holes: row.holes,
    updated_at: new Date(row.updatedAt).toISOString(),
  };
}

function roundFingerprint(round: CloudRound): string {
  const { updatedAt, ...rest } = round;
  return JSON.stringify(rest);
}

function buildCloudShot(roundId: string, shot: ShotEvent): CloudShot {
  const updatedTs = Number.isFinite(shot.end?.ts ?? NaN)
    ? Number(shot.end?.ts)
    : Number.isFinite(shot.start.ts) ? Number(shot.start.ts) : now();
  const shotId = shot.id ? String(shot.id) : `${roundId}-${shot.hole}-${shot.seq}`;
  return {
    roundId: String(roundId),
    id: shotId,
    hole: Number.isFinite(shot.hole) ? Number(shot.hole) : 0,
    seq: Number.isFinite(shot.seq) ? Number(shot.seq) : 0,
    kind: shot.kind,
    start: {
      lat: Number(shot.start.lat),
      lon: Number(shot.start.lon),
      ts: Number.isFinite(shot.start.ts) ? Number(shot.start.ts) : now(),
    },
    end:
      shot.end && Number.isFinite(shot.end.lat ?? NaN) && Number.isFinite(shot.end.lon ?? NaN)
        ? {
            lat: Number(shot.end.lat),
            lon: Number(shot.end.lon),
            ts: Number.isFinite(shot.end.ts ?? NaN) ? Number(shot.end.ts) : now(),
          }
        : undefined,
    startLie: shot.startLie,
    endLie: shot.endLie,
    club: shot.club,
    source: shot.source,
    carry_m: Number.isFinite(shot.carry_m ?? NaN) ? Number(shot.carry_m) : undefined,
    toPinStart_m: Number.isFinite(shot.toPinStart_m ?? NaN) ? Number(shot.toPinStart_m) : undefined,
    toPinEnd_m: Number.isFinite(shot.toPinEnd_m ?? NaN) ? Number(shot.toPinEnd_m) : undefined,
    sg: Number.isFinite(shot.sg ?? NaN) ? Number(shot.sg) : undefined,
    playsLikePct: Number.isFinite(shot.playsLikePct ?? NaN) ? Number(shot.playsLikePct) : undefined,
    updatedAt: updatedTs,
  };
}

function shotFingerprintCacheKey(roundId: string, shot: { id?: string | null; hole: number; seq: number }): string {
  if (shot.id) {
    return `${roundId}:id:${shot.id}`;
  }
  return `${roundId}:seq:${shot.hole}:${shot.seq}`;
}

function serializeShot(shot: CloudShot): Record<string, unknown> {
  return {
    round_id: shot.roundId,
    shot_id: shot.id,
    hole: shot.hole,
    seq: shot.seq,
    kind: shot.kind,
    payload: {
      start: shot.start,
      end: shot.end ?? null,
      startLie: shot.startLie,
      endLie: shot.endLie ?? null,
      club: shot.club ?? null,
      source: shot.source ?? null,
      carry_m: shot.carry_m ?? null,
      toPinStart_m: shot.toPinStart_m ?? null,
      toPinEnd_m: shot.toPinEnd_m ?? null,
      sg: shot.sg ?? null,
      playsLikePct: shot.playsLikePct ?? null,
    },
    updated_at: new Date(shot.updatedAt).toISOString(),
  };
}

function shotFingerprint(shot: CloudShot): string {
  return JSON.stringify(serializeShot(shot));
}

function mapEventRow(row: Record<string, unknown>): CloudEvent | null {
  const eventIdRaw = row.event_id;
  const participantIdRaw = row.participant_id;
  const roundIdRaw = row.round_id;
  if (typeof eventIdRaw !== "string" || typeof participantIdRaw !== "string" || typeof roundIdRaw !== "string") {
    return null;
  }
  const holesRaw = row.holes;
  let holes: CloudEvent["holes"] = { start: 1, end: 18 };
  if (holesRaw && typeof holesRaw === "object") {
    const candidate = holesRaw as { start?: unknown; end?: unknown };
    const start = Number(candidate.start);
    const end = Number(candidate.end);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      holes = { start, end };
    }
  }
  const updatedAtRaw = typeof row.updated_at === "string" ? Date.parse(row.updated_at) : now();
  return {
    eventId: eventIdRaw,
    participantId: participantIdRaw,
    participantName: typeof row.participant_name === "string" ? row.participant_name : participantIdRaw,
    roundId: roundIdRaw,
    gross: Number.isFinite(row.gross as number) ? Number(row.gross) : 0,
    net: Number.isFinite(row.net as number) ? Number(row.net) : null,
    sg: Number.isFinite(row.sg as number) ? Number(row.sg) : null,
    hcp: Number.isFinite(row.hcp as number) ? Number(row.hcp) : null,
    holes,
    updatedAt: Number.isFinite(updatedAtRaw) ? updatedAtRaw : now(),
  };
}

async function ensureClient(): Promise<SupabaseClientLike | null> {
  if (!isEnabled()) {
    return null;
  }
  if (clientOverride) {
    return clientOverride;
  }
  if (client) {
    return client;
  }
  const module = await loadSupabaseModule();
  if (!module) {
    return null;
  }
  const url = firstTruthy(ENV_URL_KEYS);
  const key = firstTruthy(ENV_KEY_KEYS);
  if (!url || !key) {
    return null;
  }
  client = module.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: typeof fetch === "function" ? fetch : undefined },
  });
  return client;
}

export function isEnabled(): boolean {
  if (enabledOverride !== null) {
    return enabledOverride;
  }
  if (!hasCredentials()) {
    return false;
  }
  return envFlagEnabled() || readRcFlag();
}

export async function pushRound(round: RoundState): Promise<void> {
  if (!isEnabled()) {
    return;
  }
  const supa = await ensureClient();
  if (!supa) {
    return;
  }
  const payload = buildCloudRound(round);
  const fingerprint = roundFingerprint(payload);
  const prior = roundFingerprints.get(payload.id);
  if (prior === fingerprint) {
    return;
  }
  const { error } = await supa.from("round_states").upsert(serializeRound(payload), {
    onConflict: "id",
    returning: "minimal",
  });
  if (error) {
    const code = errorCode(error);
    telemetry?.("sync.error.round", { id: payload.id, code });
    throw new Error(`cloud-sync: round upsert failed (${code})`);
  }
  roundFingerprints.set(payload.id, fingerprint);
}

export async function pushShots(roundId: string, shots: ShotEvent[]): Promise<void> {
  if (!isEnabled() || !shots.length) {
    return;
  }
  const supa = await ensureClient();
  if (!supa) {
    return;
  }
  type PendingShot = { payload: CloudShot; fingerprint: string; cacheKey: string };
  const pending: PendingShot[] = [];
  for (const shot of shots) {
    const payload = buildCloudShot(roundId, shot);
    const fingerprint = shotFingerprint(payload);
    const cacheKey = shotFingerprintCacheKey(roundId, shot);
    if (shotFingerprints.get(cacheKey) === fingerprint) {
      continue;
    }
    pending.push({ payload, fingerprint, cacheKey });
  }
  if (!pending.length) {
    return;
  }
  let hadError = false;
  for (const batch of chunk(pending, SHOT_BATCH_SIZE)) {
    const records = batch.map((entry) => serializeShot(entry.payload));
    const { error } = await supa.from("round_shots").upsert(records, {
      onConflict: "round_id,shot_id",
      returning: "minimal",
    });
    if (error) {
      hadError = true;
      telemetry?.("sync.error.shots", { roundId, code: errorCode(error), n: batch.length });
      continue;
    }
    for (const entry of batch) {
      shotFingerprints.set(entry.cacheKey, entry.fingerprint);
    }
  }
  if (hadError) {
    throw new Error(`cloud-sync: shot upsert failed (${roundId})`);
  }
}

export async function deleteShots(roundId: string, shotKeys: string[]): Promise<void> {
  if (!isEnabled() || !shotKeys.length) {
    return;
  }
  const supa = await ensureClient();
  if (!supa) {
    return;
  }
  const ids = shotKeys
    .filter((key) => key.startsWith("id:"))
    .map((key) => key.slice(3))
    .filter((id) => id.length > 0);
  const seqKeys = shotKeys
    .filter((key) => key.startsWith("seq:"))
    .map((key) => key.slice(4));

  if (ids.length) {
    const deleter = supa.from("round_shots").delete?.();
    const response = typeof deleter?.in === "function" ? await deleter.in("shot_id", ids) : { error: null };
    if (response.error) {
      telemetry?.("sync.error.delete.ids", { roundId, n: ids.length, code: errorCode(response.error) });
    } else {
      for (const id of ids) {
        shotFingerprints.delete(`${roundId}:id:${id}`);
      }
    }
  }

  for (const seqKey of seqKeys) {
    const [holeRaw, seqRaw] = seqKey.split(":");
    const hole = Number(holeRaw);
    const seq = Number(seqRaw);
    if (!Number.isFinite(hole) || !Number.isFinite(seq)) {
      continue;
    }
    const deleter = supa.from("round_shots").delete?.();
    const response = typeof deleter?.match === "function"
      ? await deleter.match({ round_id: roundId, hole, seq })
      : { error: null };
    if (response.error) {
      telemetry?.("sync.error.delete.seq", {
        roundId,
        hole,
        seq,
        code: errorCode(response.error),
      });
      continue;
    }
    shotFingerprints.delete(`${roundId}:seq:${hole}:${seq}`);
  }
}

export async function subscribeEvent(
  eventId: string,
  callback: (rows: CloudEvent[]) => void,
): Promise<() => Promise<void> | void> {
  if (!isEnabled()) {
    return () => {};
  }
  const supa = await ensureClient();
  if (!supa) {
    return () => {};
  }
  const channel = supa.channel(`event:${eventId}`);
  const emit = async () => {
    const { data, error } = await supa
      .from("event_rounds")
      .select("event_id, participant_id, participant_name, round_id, gross, net, sg, hcp, holes, updated_at")
      .eq("event_id", eventId);
    if (error || !Array.isArray(data)) {
      return;
    }
    const mapped = data
      .map((row) => mapEventRow(row as Record<string, unknown>))
      .filter((row): row is CloudEvent => Boolean(row));
    callback(mapped);
  };

  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "event_rounds", filter: `event_id=eq.${eventId}` },
    () => {
      void emit();
    },
  );
  const subscription = await channel.subscribe();
  if (subscription?.status === "SUBSCRIBED") {
    void emit();
  }
  return async () => {
    try {
      await channel.unsubscribe();
    } catch {
      // ignore teardown errors
    }
  };
}

export function __setSupabaseClientForTests(mock: SupabaseClientLike | null): void {
  clientOverride = mock;
  if (!mock) {
    client = null;
  }
}

export function __setCloudSyncEnabledForTests(flag: boolean | null): void {
  enabledOverride = flag;
}

export function __resetCloudSyncStateForTests(): void {
  roundFingerprints.clear();
  shotFingerprints.clear();
  if (!clientOverride) {
    client = null;
  }
  telemetry = null;
}

export function __setCloudSyncTelemetryForTests(handler: TelemetryFn | null): void {
  telemetry = handler;
}
