import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { BetaBadge } from "@/access/BetaBadge";
import { FeatureGate } from "@/access/FeatureGate";
import { UpgradeGate } from "@/access/UpgradeGate";
import { useAccessPlan } from "@/access/UserAccessContext";
import {
  appendRangeSession,
  computeBasicStats,
  formatRangeSessionLabel,
  loadRangeSessions,
  type RangeGameType,
  type RangeSession,
} from "@/features/range/sessions";
import {
  CoachCategory,
  MissionId,
  RANGE_MISSIONS,
  computeMissionProgress,
  getMissionById,
  loadSelectedMissionId,
  pickMissionForCategory,
  saveSelectedMissionId,
  clearSelectedMissionId,
  type RangeMission,
} from "@/features/range/missions";
import {
  type CameraFitness,
  type RangeAnalyzeRequest,
  type RangeAnalyzeResponse,
  postRangeAnalyze,
} from "@/features/range/api";
import { CameraFitnessBadge } from "@/features/range/CameraFitnessBadge";
import { CalibrationGuide } from "@/features/range/CalibrationGuide";
import { useCalibrationStatus } from "@/features/range/useCalibrationStatus";
import { loadCalibrationStatus } from "@/features/range/calibrationStatus";
import { RangeImpactCard } from "../range/RangeImpactCard";
import { computeRangeSummary } from "../range/stats";
import { RangeShot, RangeShotMetrics } from "../range/types";
import { computeGappingStats, recommendedCarry } from "@web/bag/gapping";
import { loadBag, updateClubCarry } from "@web/bag/storage";
import type { BagState } from "@web/bag/types";
import {
  TargetBingoConfig as ClassicTargetBingoConfig,
  buildRangeShareSummary,
  buildSprayBins,
  scoreTargetBingo,
} from "../features/range/games";
import type { TargetBingoResult as ClassicTargetBingoResult } from "../features/range/games";
import {
  createDefaultTargetBingoConfig,
  createInitialBingoState,
  registerShotOnBingo,
  type TargetBand,
  type TargetBingoState,
} from "@/features/range/games/types";
import { SprayHeatmap } from "../features/range/SprayHeatmap";
import GhostMatchPanel from "../features/range/GhostMatchPanel";
import {
  GhostProfile,
  createGhostId,
  getLatestGhost,
  saveGhost,
} from "../features/range/ghost";
import {
  createGhostMatchStats,
  formatSignedDelta,
  incrementGhostStats,
  type GhostMatchLiveStats,
} from "../features/range/ghostMatch";
import { useCalibration } from "../hooks/useCalibration";
import type { CalibrationSnapshot } from "../hooks/useCalibration";
import { useUnits } from "@/preferences/UnitsContext";
import type { DistanceUnit } from "@/preferences/units";
import { convertMeters, formatDistance } from "@/utils/distance";
import { useUserSession } from "@/user/UserSessionContext";
import { postRangeSessionSnapshots } from "@/user/historyApi";
import { mapRangeSessionToSnapshot } from "@/user/historySync";
import { persistMissionOutcomeFromSession } from "@/practice/missionOutcomeRecorder";
import {
  PRACTICE_MISSION_WINDOW_DAYS,
  loadPracticeMissionHistory,
} from "@/practice/practiceMissionHistory";
import {
  buildMissionProgressById,
  type MissionProgress,
  type PracticeMissionHistoryEntry,
} from "@shared/practice/practiceHistory";
import { fetchBagStats } from "@/api/bagStatsClient";
import { mapBagStateToPlayerBag } from "@/bag/utils";
import { buildBagReadinessOverview } from "@shared/caddie/bagReadiness";
import { type BagClubStatsMap } from "@shared/caddie/bagStats";
import { buildBagPracticeRecommendations, type BagPracticeRecommendation } from "@shared/caddie/bagPracticeRecommendations";

const DEFAULT_ANALYZE_FRAMES = 8;
const DEFAULT_REF_LEN_PX = 100;

function computeRefLenPx(calibration: CalibrationSnapshot | null): number {
  if (!calibration || typeof calibration.metersPerPixel !== "number") {
    return DEFAULT_REF_LEN_PX;
  }
  const metersPerPixel = calibration.metersPerPixel;
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    return DEFAULT_REF_LEN_PX;
  }
  return Math.max(1, Math.round(1 / metersPerPixel));
}

function mapShotQuality(
  fitness: CameraFitness | null | undefined,
  fallbackQuality: string | null | undefined,
): "good" | "medium" | "poor" {
  if (fitness) {
    if (fitness.level === "good") {
      return "good";
    }
    if (fitness.level === "bad") {
      return "poor";
    }
    return "medium";
  }
  if (fallbackQuality === "good" || fallbackQuality === "medium" || fallbackQuality === "poor") {
    return fallbackQuality;
  }
  if (fallbackQuality === "warning") {
    return "medium";
  }
  if (fallbackQuality === "bad") {
    return "poor";
  }
  return "medium";
}

function pickNumber(...values: (number | null | undefined)[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

  function mapRangeMetrics(response: RangeAnalyzeResponse): RangeShotMetrics {
  const metrics = response.metrics ?? null;
  const ballSpeedMps = pickNumber(response.ball_speed_mps, metrics?.ball_speed_mps);
  const ballSpeedMph =
    pickNumber(response.ball_speed_mph, metrics?.ball_speed_mph) ??
    (ballSpeedMps != null ? ballSpeedMps * 2.23694 : null);

  const fallbackQuality =
    (typeof metrics?.quality === "string" ? metrics?.quality : null) ??
    (typeof response.impact_quality === "string" ? response.impact_quality : null) ??
    (typeof metrics?.impact_quality === "string" ? metrics?.impact_quality : null);

  return {
    ballSpeedMps,
    ballSpeedMph,
    carryM: pickNumber(response.carry_m, metrics?.carry_m),
    launchDeg: pickNumber(response.launch_deg, metrics?.launch_deg),
    sideAngleDeg: pickNumber(response.side_deg, metrics?.side_angle_deg),
    quality: mapShotQuality(response.quality ?? null, fallbackQuality),
  };
}

function buildRangeAnalyzeRequest(
  calibration: CalibrationSnapshot | null,
  missionId?: MissionId | null,
): RangeAnalyzeRequest {
  const fps = calibration?.fps ?? 120.0;
  return {
    frames: DEFAULT_ANALYZE_FRAMES,
    fps,
    ref_len_m: 1.0,
    ref_len_px: computeRefLenPx(calibration),
    persist: false,
    mission_id: missionId ?? undefined,
  };
}

type RangeMode = "practice" | "target-bingo" | "gapping" | "mission";
type RangeGameMode = "none" | RangeGameType;

export default function RangePracticePage() {
  const { t } = useTranslation();
  const { calibration } = useCalibration();
  const { unit } = useUnits();
  const { status: calibrationStatus } = useCalibrationStatus();
  const { session: userSession } = useUserSession();
  const { isPro, loading: accessLoading } = useAccessPlan();
  const location = useLocation();
  const userId = userSession?.userId ?? null;
  const [bag] = React.useState<BagState>(() => loadBag());
  const [bagStats, setBagStats] = React.useState<BagClubStatsMap | null>(null);
  const [currentClubId, setCurrentClubId] = React.useState<string>(
    () => bag.clubs[0]?.id ?? "7i"
  );
  const [shots, setShots] = React.useState<RangeShot[]>([]);
  const [latest, setLatest] = React.useState<RangeShotMetrics | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cameraFitness, setCameraFitness] = React.useState<CameraFitness | null>(null);
  const [mode, setMode] = React.useState<RangeMode>("practice");
  const [gameMode, setGameMode] = React.useState<RangeGameMode>("none");
  const [bingoState, setBingoState] = React.useState<TargetBingoState | null>(
    null
  );
  const [missionId, setMissionId] = React.useState<MissionId | null>(null);
  const [practiceHistory, setPracticeHistory] = React.useState<PracticeMissionHistoryEntry[]>([]);
  const [bingoCfg, setBingoCfg] = React.useState<ClassicTargetBingoConfig>({
    target_m: 150,
    tolerance_m: 7,
    maxShots: 20,
  });
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null);
  const [ghost, setGhost] = React.useState<GhostProfile | null>(() => getLatestGhost());
  const [ghostStatus, setGhostStatus] = React.useState<string | null>(null);
  const [ghostSession, setGhostSession] = React.useState<RangeSession | null>(
    null
  );
  const [ghostStats, setGhostStats] = React.useState<GhostMatchLiveStats | null>(
    null
  );
  const [saveStatus, setSaveStatus] = React.useState<string | null>(null);
  const [showCalibrationGuide, setShowCalibrationGuide] = React.useState<boolean>(
    () => !loadCalibrationStatus().calibrated,
  );
  const [recommendations, setRecommendations] = React.useState<BagPracticeRecommendation[]>([]);
  const ghostCandidates = React.useMemo(() => loadRangeSessions(), []);
  const sessionStartRef = React.useRef<string>(new Date().toISOString());
  const ghostSessionOptions = React.useMemo(
    () => ghostCandidates.slice().reverse(),
    [ghostCandidates],
  );
  const hasGhostCandidates = ghostSessionOptions.length > 0;

  const clubLabels = React.useMemo(
    () =>
      bag.clubs.reduce<Record<string, string>>((acc, club) => {
        acc[club.id] = club.label;
        return acc;
      }, {}),
    [bag],
  );

  const mission = missionId ? getMissionById(missionId) ?? null : null;
  const missionProgress = React.useMemo(
    () => (mission ? computeMissionProgress(mission, shots) : null),
    [mission, shots]
  );
  const missionHistoryProgress = React.useMemo(() => {
    if (!missionId) return null;
    const map = buildMissionProgressById(practiceHistory, [missionId], {
      windowDays: PRACTICE_MISSION_WINDOW_DAYS,
    });
    return map[missionId];
  }, [missionId, practiceHistory]);
  const recommendationProgress = React.useMemo(() => {
    if (recommendations.length === 0) return {} as Record<string, MissionProgress>;
    return buildMissionProgressById(
      practiceHistory,
      recommendations.map((rec) => rec.id),
      { windowDays: PRACTICE_MISSION_WINDOW_DAYS },
    );
  }, [practiceHistory, recommendations]);
  const searchParams = React.useMemo(() => new URLSearchParams(location.search ?? ""), [location.search]);

  const missionPrefInitialized = React.useRef(false);

  React.useEffect(() => {
    if (accessLoading) return;
    if (!isPro) {
      setMissionId(null);
      clearSelectedMissionId();
      return;
    }
    if (missionPrefInitialized.current) return;

    const missionParam = searchParams.get("missionId") as MissionId | null;
    const focusParam = searchParams.get("focus") as CoachCategory | null;

    const fromUrl = missionParam && getMissionById(missionParam) ? missionParam : null;
    const fromFocus =
      !fromUrl && focusParam
        ? pickMissionForCategory(focusParam)[0]?.id ?? null
        : null;
    const stored = loadSelectedMissionId();
    const nextMission = fromUrl ?? fromFocus ?? stored ?? null;

    if (nextMission) {
      setMissionId(nextMission);
      saveSelectedMissionId(nextMission);
    }
    missionPrefInitialized.current = true;
  }, [accessLoading, isPro, searchParams]);

  React.useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const stats = await fetchBagStats();
        if (!cancelled) {
          setBagStats(stats);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[practice] Failed to load bag stats", err);
          setBagStats({});
        }
      }
    };

    loadStats().catch((err) => console.warn("[practice] bag stats load crashed", err));

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (missionId && !mission) {
      setMissionId(null);
    }
  }, [missionId, mission]);

  React.useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const history = await loadPracticeMissionHistory();
        if (!cancelled) {
          setPracticeHistory(history);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[practice] Failed to load mission history", err);
        }
      }
    };

    loadHistory().catch((err) => console.warn("[practice] mission history load crashed", err));

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    try {
      const playerBag = mapBagStateToPlayerBag(bag);
      const overview = buildBagReadinessOverview(playerBag, bagStats ?? {});
      const recs = buildBagPracticeRecommendations(overview, overview.suggestions, practiceHistory);
      setRecommendations(recs);
    } catch (err) {
      console.warn("[practice] Failed to build practice recommendations", err);
      setRecommendations([]);
    }
  }, [bag, bagStats, practiceHistory]);

  React.useEffect(() => {
    const presetClub = searchParams.get("club");
    if (presetClub && bag.clubs.some((club) => club.id === presetClub)) {
      setCurrentClubId(presetClub);
    }
  }, [bag.clubs, searchParams]);

  const makeGhostProfileFromCurrent = React.useCallback(
    (
      cfg: ClassicTargetBingoConfig,
      result: ClassicTargetBingoResult,
    ): GhostProfile => {
      const createdAt = Date.now();
      const targetText = formatDistance(cfg.target_m, unit, { withUnit: true });
      return {
        id: createGhostId(),
        createdAt,
        name: `My ghost – ${targetText} (${new Date(createdAt).toLocaleDateString()})`,
        config: { ...cfg },
        result: {
          totalShots: result.totalShots,
          hits: result.hits,
          hitRate_pct: result.hitRate_pct,
          avgAbsError_m: result.avgAbsError_m,
        },
      } satisfies GhostProfile;
    },
    [unit]
  );

  const summary = React.useMemo(() => computeRangeSummary(shots), [shots]);
  const bingoResult = React.useMemo(
    () =>
      mode === "target-bingo"
        ? scoreTargetBingo(shots, bingoCfg)
        : null,
    [mode, shots, bingoCfg]
  );
  const sprayBins = React.useMemo(() => buildSprayBins(shots, 10), [shots]);

  React.useEffect(() => {
    if (!copyStatus) {
      return;
    }
    const id = window.setTimeout(() => setCopyStatus(null), 3000);
    return () => window.clearTimeout(id);
  }, [copyStatus]);

  React.useEffect(() => {
    if (!ghostStatus) {
      return;
    }
    const id = window.setTimeout(() => setGhostStatus(null), 3000);
    return () => window.clearTimeout(id);
  }, [ghostStatus]);

  React.useEffect(() => {
    if (!saveStatus) {
      return;
    }
    const id = window.setTimeout(() => setSaveStatus(null), 3000);
    return () => window.clearTimeout(id);
  }, [saveStatus]);

  React.useEffect(() => {
    if (gameMode !== "GHOSTMATCH_V1") {
      setGhostSession(null);
      setGhostStats(null);
    }
  }, [gameMode]);

  const handleEndSession = React.useCallback(async () => {
    if (shots.length === 0) {
      return;
    }

    const nowIso = new Date().toISOString();
    const { shotCount, avgCarry_m, carryStd_m } = computeBasicStats(shots);

    let missionGoodReps: number | null = null;
    let missionTargetReps: number | null = null;
    if (mission && missionProgress) {
      missionGoodReps = missionProgress.hitsInBands;
      missionTargetReps = missionProgress.attempts;
    }

    let target_m: number | null = null;
    let hitRate_pct: number | null = null;
    let avgError_m: number | null = null;
    if (mode === "target-bingo") {
      const bingo = scoreTargetBingo(shots, bingoCfg);
      if (bingo.totalShots > 0) {
        target_m = bingoCfg.target_m;
        hitRate_pct = bingo.hitRate_pct;
        avgError_m = bingo.avgAbsError_m ?? null;
      }
    }

    const sessionStartMs = Date.parse(sessionStartRef.current);
    const ghostSaved =
      ghost != null &&
      Number.isFinite(sessionStartMs) &&
      ghost.createdAt >= sessionStartMs;

    let gameType: RangeGameType | undefined;
    let bingoLines: number | undefined;
    let bingoHits: number | undefined;
    let ghostSessionId: string | undefined;
    let ghostLabel: string | undefined;
    let ghostShots: number | undefined;
    let ghostScoreDelta: number | undefined;

    if (gameMode === "TARGET_BINGO_V1" && bingoState) {
      gameType = "TARGET_BINGO_V1";
      bingoLines = bingoState.completedLines;
      bingoHits = Object.values(bingoState.hitsByCell).reduce(
        (sum, value) => sum + value,
        0
      );
    }

    if (gameMode === "GHOSTMATCH_V1" && ghostSession) {
      gameType = "GHOSTMATCH_V1";
      ghostSessionId = ghostSession.id;
      ghostLabel = formatRangeSessionLabel(ghostSession);
      ghostShots = ghostSession.shotCount;
      ghostScoreDelta = ghostStats?.deltaShots;
    }

    const session = {
      id: `rs-${Date.now().toString(36)}`,
      startedAt: sessionStartRef.current,
      endedAt: nowIso,
      clubId: currentClubId ?? null,
      missionId: mission?.id ?? missionId ?? null,
      missionGoodReps,
      missionTargetReps,
      avgCarry_m,
      carryStd_m,
      shotCount,
      target_m,
      hitRate_pct,
      avgError_m,
      ghostSaved,
      gameType,
      bingoLines,
      bingoHits,
      ghostSessionId,
      ghostLabel,
      ghostShots,
      ghostScoreDelta,
    };

    appendRangeSession(session);

    await persistMissionOutcomeFromSession(mission, shots, {
      sessionId: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      missionTargetReps,
    });

    if (userId) {
      const snapshot = mapRangeSessionToSnapshot(session);
      void Promise.resolve(postRangeSessionSnapshots([snapshot])).catch(() => {
        // silent fail for local-first storage
      });
    }

    sessionStartRef.current = nowIso;
    setShots([]);
    setLatest(null);
    if (gameMode === "TARGET_BINGO_V1" && bingoState) {
      setBingoState(createInitialBingoState(bingoState.config));
    }
    if (gameMode === "GHOSTMATCH_V1" && ghostSession) {
      setGhostStats(createGhostMatchStats(ghostSession));
    }
    setSaveStatus(t("range.session.saved"));
  }, [
    shots,
    mission,
    missionProgress,
    mode,
    gameMode,
    bingoState,
    bingoCfg,
    currentClubId,
    missionId,
    ghost,
    ghostSession,
    ghostStats,
    userId,
    t,
  ]);

  async function handleHit() {
    setLoading(true);
    setError(null);
    try {
      const payload = buildRangeAnalyzeRequest(calibration, mission?.id ?? missionId);
      const response = await postRangeAnalyze(payload);
      const metrics = mapRangeMetrics(response);
      setCameraFitness(response.quality ?? null);
      const timestamp = Date.now();
      const clubEntry = bag.clubs.find((item) => item.id === currentClubId);
      const clubLabel = clubEntry?.label ?? currentClubId;
      setShots((prev) => {
        const shot: RangeShot = {
          id: `${timestamp}-${prev.length + 1}`,
          ts: timestamp,
          club: clubLabel,
          clubId: currentClubId,
          clubLabel,
          metrics,
        };
        return [...prev, shot];
      });
      if (gameMode === "TARGET_BINGO_V1") {
        setBingoState((prev) =>
          prev ? registerShotOnBingo(prev, metrics.carryM) : prev
        );
      }
      if (gameMode === "GHOSTMATCH_V1" && ghostSession) {
        setGhostStats((prev) => incrementGhostStats(prev));
      }
      setLatest(metrics);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to analyze shot";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopySummary() {
    const summaryPayload = buildRangeShareSummary({
      mode,
      bingoConfig: bingoCfg,
      shots,
      bingoResult,
      sessionSummary: summary,
    });
    const text = JSON.stringify(summaryPayload, null, 2);

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        setCopyStatus("Sammanfattning kopierad");
      } else {
        setCopyStatus("Clipboard saknas i denna miljö");
      }
    } catch (err) {
      console.error("Failed to copy range summary", err);
      setCopyStatus("Kunde inte kopiera");
    }
  }

  const bingoShots = bingoResult?.shots.slice(-5) ?? [];

  const clubOptions = bag.clubs;
  const currentClub = React.useMemo(
    () => clubOptions.find((club) => club.id === currentClubId),
    [clubOptions, currentClubId]
  );

  const gappingShots = React.useMemo(
    () => shots.filter((shot) => (shot.clubId ?? shot.club) === currentClubId),
    [shots, currentClubId]
  );
  const gappingStats = React.useMemo(
    () => (mode === "gapping" ? computeGappingStats(gappingShots) : null),
    [mode, gappingShots]
  );
  const bingoHitTotal = React.useMemo(
    () =>
      bingoState
        ? Object.values(bingoState.hitsByCell).reduce(
            (sum, count) => sum + count,
            0
          )
        : 0,
    [bingoState]
  );
  const bingoGrid = React.useMemo(() => {
    if (!bingoState) return [] as TargetBand[][];
    const rows: TargetBand[][] = [];
    for (let r = 0; r < bingoState.config.rows; r += 1) {
      rows.push(
        bingoState.config.bands.slice(
          r * bingoState.config.columns,
          (r + 1) * bingoState.config.columns
        )
      );
    }
    return rows;
  }, [bingoState]);
  const suggestedCarry = React.useMemo(
    () => (mode === "gapping" ? recommendedCarry(gappingStats) : null),
    [mode, gappingStats]
  );

  function handleSaveSuggestedCarry() {
    if (suggestedCarry == null) {
      return;
    }
    const latestBag = loadBag();
    updateClubCarry(latestBag, currentClubId, suggestedCarry);
    setCopyStatus("Bag uppdaterad");
  }

  const formatErrorText = React.useCallback(
    (value: number) => {
      const converted = convertMeters(value, unit);
      const suffix = unit === "metric" ? " m" : " yd";
      if (converted == null || Math.abs(converted) < 0.5) {
        return `0${suffix}`;
      }
      const rounded = Math.abs(converted).toFixed(1);
      return value > 0 ? `+${rounded}${suffix} lång` : `−${rounded}${suffix} kort`;
    },
    [unit]
  );

  const formatRecommendationCopy = React.useCallback(
    (rec: BagPracticeRecommendation) => {
      const [lowerId, upperId] = rec.targetClubs;
      const lower = lowerId ? clubLabels[lowerId] ?? lowerId : undefined;
      const upper = upperId ? clubLabels[upperId] ?? upperId : undefined;
      const club = lower;

      return {
        title: t(rec.titleKey, { lower, upper, club }),
        description: t(rec.descriptionKey, { lower, upper, club }),
      };
    },
    [clubLabels, t]
  );

  const formatRecommendationStatus = React.useCallback(
    (status: BagPracticeRecommendation["status"]) => {
      if (status === "new") return t("bag.practice.status.new");
      if (status === "due") return t("bag.practice.status.due");
      return t("bag.practice.status.fresh");
    },
    [t]
  );

  return (
    <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("range.practice.title")}</h1>

      <section className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
          <span className="font-medium text-slate-700">
            {t("range.calibration.label")}
          </span>
          {calibrationStatus.calibrated ? (
            <span className="text-emerald-700">
              {t("range.calibration.status.calibrated")}
            </span>
          ) : (
            <span className="text-amber-700">
              {t("range.calibration.status.notCalibrated")}
            </span>
          )}
          <button
            type="button"
            className="ml-1 underline text-sky-700 hover:text-sky-800"
            onClick={() => setShowCalibrationGuide(true)}
          >
            {t("range.calibration.action.openGuide")}
          </button>
        </div>

        {cameraFitness && <CameraFitnessBadge quality={cameraFitness} />}
      </section>

      {showCalibrationGuide && (
        <CalibrationGuide onClose={() => setShowCalibrationGuide(false)} />
      )}

      {recommendations.length > 0 && (
        <section
          className="rounded-lg border border-emerald-500/30 bg-emerald-900/20 p-4 text-sm"
          data-testid="range-practice-recommendations"
        >
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
              {t("bag.practice.recommendedTitle")}
            </p>
            <p className="text-xs text-emerald-100/80">
              {t("bag.practice.recommendedHelper")}
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {recommendations.map((rec) => {
              const copy = formatRecommendationCopy(rec);
              const statusLabel = formatRecommendationStatus(rec.status);
              const progress = recommendationProgress?.[rec.id];
              const helperParts: string[] = [];

              if (progress) {
                helperParts.push(
                  progress.completedSessions > 0
                    ? t("practice.missionProgress.recent", {
                        count: progress.completedSessions,
                        days: PRACTICE_MISSION_WINDOW_DAYS,
                      })
                    : t("practice.missionProgress.empty"),
                );

                if (progress.inStreak) {
                  helperParts.push(t("practice.missionProgress.streak"));
                }
              }

              const helper = helperParts.join(" • ");
              const statusClasses =
                rec.status === "due"
                  ? "border-amber-400/60 bg-amber-500/10 text-amber-200"
                  : rec.status === "fresh"
                    ? "border-slate-500/60 bg-slate-800 text-slate-200"
                    : "border-emerald-400/60 bg-emerald-500/10 text-emerald-200";

              return (
                <div
                  key={rec.id}
                  className="rounded-md border border-slate-800/60 bg-slate-950/60 p-3"
                  data-testid="range-practice-recommendation"
                >
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <h3 className="font-semibold text-slate-100">{copy.title}</h3>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${statusClasses}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-slate-200">{copy.description}</p>
                  {helper ? (
                    <p className="text-[11px] text-slate-400" data-testid="range-practice-recommendation-progress">
                      {helper}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-slate-200">
          {t("range.bingo.title")}
          <select
            value={gameMode}
            onChange={(e) => {
              const value = e.target.value as RangeGameMode;
              if (value === "GHOSTMATCH_V1" && ghostCandidates.length === 0) {
                setGameMode("none");
                return;
              }
              setGameMode(value);
              if (value === "TARGET_BINGO_V1") {
                const cfg = createDefaultTargetBingoConfig();
                setBingoState(createInitialBingoState(cfg));
                setMode("target-bingo");
              } else {
                setBingoState(null);
                if (mode === "target-bingo") {
                  setMode("practice");
                }
              }
            }}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            <option value="none">{t("range.mode.plain")}</option>
            <option value="TARGET_BINGO_V1">{t("range.mode.bingo")}</option>
            <option
              value="GHOSTMATCH_V1"
              disabled={ghostCandidates.length === 0}
            >
              {t("range.mode.ghost")}
            </option>
          </select>
        </label>
      </div>

      {gameMode === "GHOSTMATCH_V1" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
          {!hasGhostCandidates ? (
            <p className="text-slate-400">{t("range.ghost.noneSelected")}</p>
          ) : (
            <>
              <label
                className="flex flex-col gap-1 text-slate-200"
                htmlFor="ghost-session-select"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("range.mode.ghost")}
                </span>
                <select
                  id="ghost-session-select"
                  value={ghostSession?.id ?? ""}
                  onChange={(e) => {
                    const selected =
                      ghostSessionOptions.find((x) => x.id === e.target.value) ??
                      null;
                    setGhostSession(selected);
                    setGhostStats(createGhostMatchStats(selected));
                  }}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                >
                  <option value="">{t("range.ghost.noneSelected")}</option>
                  {ghostSessionOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatRangeSessionLabel(s)}
                    </option>
                  ))}
                </select>
              </label>

              {ghostSession && (
                <div className="mt-3 rounded border border-slate-200/60 bg-slate-50 p-2 text-xs text-slate-800">
                  <div className="font-semibold">{t("range.ghost.title")}</div>
                  <div className="text-[11px] text-slate-500">
                    {t("range.ghost.subtitle")}
                  </div>

                  <div className="mt-2 flex justify-between">
                    <div>
                      <div>
                        {t("range.ghost.ghostShots", {
                          count: ghostStats?.ghostShots ?? ghostSession.shotCount ?? 0,
                        })}
                      </div>
                      <div>
                        {t("range.ghost.currentShots", {
                          count: ghostStats?.currentShots ?? 0,
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px]">{t("range.ghost.deltaLabel")}</div>
                      <div className="font-mono">
                        {formatSignedDelta(ghostStats?.deltaShots ?? 0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <label className="text-sm">
          Club:
          <select
            value={currentClubId}
            onChange={(event) => setCurrentClubId(event.target.value)}
            className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            {clubOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.id})
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            void handleHit();
          }}
          disabled={loading}
          className="ml-auto px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
        >
          {loading ? "Analyzing…" : "Hit & analyze"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex rounded-lg border border-slate-800 bg-slate-900/60 p-1">
          <button
            type="button"
            onClick={() => setMode("practice")}
            className={`px-3 py-1 rounded-md ${
              mode === "practice"
                ? "bg-emerald-600 text-white"
                : "text-slate-300 hover:text-white"
            }`}
          >
            {t("range.practice.mode.practice")}
          </button>
          <button
            type="button"
            onClick={() => setMode("target-bingo")}
            className={`px-3 py-1 rounded-md ${
              mode === "target-bingo"
                ? "bg-emerald-600 text-white"
                : "text-slate-300 hover:text-white"
            }`}
          >
            {t("range.practice.mode.targetBingo")}
          </button>
          <button
            type="button"
            onClick={() => setMode("gapping")}
            className={`px-3 py-1 rounded-md ${
              mode === "gapping"
                ? "bg-emerald-600 text-white"
                : "text-slate-300 hover:text-white"
            }`}
          >
            {t("range.practice.mode.gapping")}
          </button>
          <button
            type="button"
            onClick={() => setMode("mission")}
            aria-label="Missions"
            data-testid="mission-mode-button"
            className={`px-3 py-1 rounded-md ${
              mode === "mission"
                ? "bg-emerald-600 text-white"
                : "text-slate-300 hover:text-white"
            }`}
          >
            {t("range.practice.mode.mission")}
          </button>
        </div>

        <button
          type="button"
          className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          onClick={handleEndSession}
          disabled={shots.length === 0}
        >
          {t("range.session.endButton")}
        </button>

        <button
          type="button"
          onClick={() => {
            void handleCopySummary();
          }}
          className="ml-auto px-3 py-1.5 rounded-md border border-emerald-600 text-emerald-400 hover:bg-emerald-600/10"
        >
          Kopiera sammanfattning
        </button>
      </div>

      {copyStatus && <div className="text-xs text-emerald-400">{copyStatus}</div>}
      {saveStatus && <div className="text-xs text-emerald-400">{saveStatus}</div>}

      {mode === "mission" && (
        <section className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                {t("range.mission.header")}
              </h2>
              <BetaBadge />
            </div>
          </div>
          {accessLoading ? (
            <p className="text-xs text-slate-500">{t("loading")}</p>
          ) : isPro ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm text-slate-700">
                  {t("range.mission.select")}
                  <select
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                    value={missionId ?? ""}
                    onChange={(e) => {
                      const value = e.target.value as MissionId | "";
                      if (!value) {
                        setMissionId(null);
                        clearSelectedMissionId();
                        return;
                      }
                      setMissionId(value);
                      saveSelectedMissionId(value);
                    }}
                  >
                    <option value="">{t("range.mission.none")}</option>
                    {RANGE_MISSIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {mission ? (
                <MissionDetails
                  mission={mission}
                  missionProgress={missionProgress}
                  missionHistoryProgress={missionHistoryProgress}
                  unit={unit}
                />
              ) : (
                <p className="text-xs text-slate-400">
                  {t("range.mission.noneSelected")}
                </p>
              )}
            </>
          ) : (
            <UpgradeGate feature="RANGE_MISSIONS">
              <p className="text-xs text-slate-200" data-testid="mission-upgrade-message">
                Mission-based practice is available on Pro plans.
              </p>
            </UpgradeGate>
          )}
        </section>
      )}

      {gameMode === "TARGET_BINGO_V1" && bingoState && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                {t("range.bingo.title")}
              </h2>
              <p className="text-slate-400">{t("range.bingo.subtitle")}</p>
            </div>
            {bingoState.isComplete && (
              <span className="ml-auto rounded-full bg-emerald-600/20 px-3 py-1 text-[11px] font-semibold text-emerald-300">
                Bingo!
              </span>
            )}
          </div>

          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${bingoState.config.columns}, minmax(0, 1fr))`,
            }}
          >
            {bingoGrid.map((row, rowIndex) =>
              row.map((band, colIndex) => {
                const hits = bingoState.hitsByCell[band.id] ?? 0;
                return (
                  <div
                    key={`${band.id}-${rowIndex}-${colIndex}`}
                    className={`rounded-md border px-2 py-2 ${
                      hits > 0
                        ? "border-emerald-500/60 bg-emerald-900/30"
                        : "border-slate-800 bg-slate-950"
                    }`}
                  >
                    <div className="text-[11px] text-slate-400">
                      {`${formatDistance(band.minCarry_m, unit, { withUnit: true })} – ${formatDistance(band.maxCarry_m, unit, { withUnit: true })}`}
                    </div>
                    <div className="text-lg font-semibold text-slate-100">
                      {hits}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-[11px] text-slate-300">
            <span
              data-testid="bingo-targets"
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1"
            >
              {t("range.bingo.grid.header")}: {bingoHitTotal}
            </span>
            <span
              data-testid="bingo-lines"
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1"
            >
              {t("range.bingo.lines", { count: bingoState.completedLines })}
            </span>
            <span
              data-testid="bingo-shots"
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1"
            >
              {t("range.bingo.shots", { count: bingoState.totalShots })}
            </span>
          </div>
        </section>
      )}

      {mode === "target-bingo" && gameMode !== "TARGET_BINGO_V1" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Mål ({unit === "metric" ? "m" : "yd"})</span>
            <input
              type="number"
              min={50}
              max={250}
              value={bingoCfg.target_m}
              onChange={(event) =>
                setBingoCfg((prev) => ({ ...prev, target_m: Number(event.target.value) }))
              }
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Tolerans (± {unit === "metric" ? "m" : "yd"})</span>
            <input
              type="number"
              min={3}
              max={20}
              value={bingoCfg.tolerance_m}
              onChange={(event) =>
                setBingoCfg((prev) => ({ ...prev, tolerance_m: Number(event.target.value) }))
              }
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Senaste skott</span>
            <input
              type="number"
              min={5}
              max={50}
              value={bingoCfg.maxShots}
              onChange={(event) =>
                setBingoCfg((prev) => ({ ...prev, maxShots: Number(event.target.value) }))
              }
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
          </label>
        </div>
      )}

      {error && <div className="text-xs text-red-600">{error}</div>}

      <RangeImpactCard metrics={latest} />

      <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
        <div className="font-semibold mb-1">Session summary</div>
        <div>Shots: {summary.shots}</div>
        <div>
          Avg ball speed: {summary.avgBallSpeedMps != null ? `${(summary.avgBallSpeedMps * 3.6).toFixed(1)} km/h` : "—"}
        </div>
        <div>
          Avg carry: {formatDistance(summary.avgCarryM, unit, { withUnit: true })}
        </div>
        <div>
          Side dispersion (σ): {summary.dispersionSideDeg != null ? `${summary.dispersionSideDeg.toFixed(1)}°` : "—"}
        </div>
      </div>

      {mode === "gapping" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">
              {t("range.practice.gapping.title")}
            </span>
            {currentClub && (
              <span className="text-slate-400 text-[11px]">
                Klubb: {currentClub.label} ({currentClub.id})
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <label className="text-[11px] text-slate-300">
                Klubb
                <select
                  value={currentClubId}
                  onChange={(event) => setCurrentClubId(event.target.value)}
                  className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                >
                  {clubOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} ({option.id})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>Antal slag: {gappingStats?.samples ?? 0}</div>
            <div>
              Snitt carry: {formatDistance(gappingStats?.meanCarry_m ?? null, unit, { withUnit: true })}
            </div>
            <div>
              Median (p50): {formatDistance(gappingStats?.p50_m ?? null, unit, { withUnit: true })}
            </div>
            <div>
              Spridning (std): {formatDistance(gappingStats?.std_m ?? null, unit, { withUnit: true })}
            </div>
          </div>

          {suggestedCarry != null && currentClub && (
            <div className="rounded border border-emerald-700 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              Föreslagen carry för {currentClub.label}: {formatDistance(suggestedCarry, unit, { withUnit: true })}
            </div>
          )}

          {suggestedCarry != null && (
            <button
              type="button"
              onClick={handleSaveSuggestedCarry}
              className="rounded-md border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/10"
            >
              Spara i Min bag
            </button>
          )}
        </div>
      )}

      {mode === "target-bingo" && bingoResult && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Target Bingo</h2>
            <span className="text-slate-400 text-[10px]">
              Målet: {formatDistance(bingoCfg.target_m, unit, { withUnit: true })} ± {formatDistance(
                bingoCfg.tolerance_m,
                unit,
                { withUnit: true }
              )}
            </span>
            {ghost && (
              <span className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                Aktuell Ghost: {ghost.name}
              </span>
            )}
          </div>
          {bingoResult.totalShots === 0 ? (
            <div className="text-slate-500">Inga giltiga skott ännu.</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-slate-400">Träffar</div>
                <div className="text-lg font-semibold text-emerald-400">
                  {bingoResult.hits} / {bingoResult.totalShots}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Träffprocent</div>
                <div className="text-lg font-semibold text-slate-100">
                  {bingoResult.hitRate_pct.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-slate-400">Genomsnittligt fel</div>
                <div className="text-lg font-semibold text-slate-100">
                  {formatDistance(bingoResult.avgAbsError_m, unit, { withUnit: true })}
                </div>
              </div>
            </div>
          )}
          {bingoResult.totalShots > 0 && (
            <div className="space-y-1">
              <div className="text-slate-400">Senaste skotten</div>
              <ul className="space-y-1">
                {bingoShots.map((result) => (
                  <li key={result.shot.id} className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        result.isHit ? "bg-emerald-400" : "bg-red-500"
                      }`}
                    />
                    <span className="text-slate-200">
                      #{result.index}
                    </span>
                    <span className="text-slate-400">
                      {formatErrorText(result.carryError_m)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {bingoResult.totalShots >= 5 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const profile = makeGhostProfileFromCurrent(bingoCfg, bingoResult);
                  saveGhost(profile);
                  setGhost(profile);
                  setGhostStatus("Ghost sparad! Jämför mot denna profil nästa gång.");
                }}
                className="rounded-md border border-emerald-600 px-3 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-600/10"
              >
                Spara som Ghost
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-700 px-3 py-1 text-[11px] text-slate-300"
                disabled
              >
                Visa sparade Ghosts
              </button>
              {ghostStatus && (
                <span className="text-[11px] text-emerald-300">{ghostStatus}</span>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "target-bingo" && gameMode !== "TARGET_BINGO_V1" && (
        <FeatureGate feature="range.ghostMatch">
          <UpgradeGate feature="RANGE_GHOSTMATCH">
            <GhostMatchPanel cfg={bingoCfg} current={bingoResult ?? null} ghost={ghost} />
          </UpgradeGate>
        </FeatureGate>
      )}

      {mode === "target-bingo" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">Träffbild</h2>
          <SprayHeatmap bins={sprayBins} />
        </div>
      )}

      <div className="max-h-48 overflow-auto rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
        <div className="font-semibold mb-1">Shot log</div>
        {shots.length === 0 ? (
          <div className="text-slate-500">No shots yet.</div>
        ) : (
          <ul className="space-y-1">
            {shots
              .slice()
              .reverse()
              .map((shot) => (
                <li key={shot.id} className="flex justify-between">
                  <span>
                    {(shot.clubLabel ?? shot.club) ?? "—"} •
                    {" "}
                    {shot.metrics.ballSpeedMph != null ? `${shot.metrics.ballSpeedMph.toFixed(1)} mph` : "—"}
                  </span>
                  <span className="text-slate-500">
                    {formatDistance(shot.metrics.carryM, unit, { withUnit: true })}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type MissionDetailsProps = {
  mission: RangeMission;
  missionProgress: ReturnType<typeof computeMissionProgress> | null;
  missionHistoryProgress: MissionProgress | null;
  unit: DistanceUnit;
};

const MissionDetails: React.FC<MissionDetailsProps> = ({
  mission,
  missionProgress,
  missionHistoryProgress,
  unit,
}) => {
  const { t } = useTranslation();
  const targetText = mission.targetBands
    .map((band) =>
      `${formatDistance(band.from, unit, { withUnit: true })} – ${formatDistance(band.to, unit, { withUnit: true })}`,
    )
    .join(" • ");

  const missionHistoryLabel = React.useMemo(() => {
    const base =
      missionHistoryProgress && missionHistoryProgress.completedSessions > 0
        ? t("practice.missionProgress.recent", {
            count: missionHistoryProgress.completedSessions,
            days: PRACTICE_MISSION_WINDOW_DAYS,
          })
        : t("practice.missionProgress.empty");

    if (missionHistoryProgress?.inStreak) {
      return `${base} • ${t("practice.missionProgress.streak")}`;
    }

    return base;
  }, [missionHistoryProgress, t]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <div className="font-medium text-slate-900">{mission.label}</div>
      <div className="mt-1 text-slate-600">{mission.description}</div>
      <div className="mt-1 text-xs text-slate-500" data-testid="mission-history-progress">
        {missionHistoryLabel}
      </div>
      <div className="mt-2 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Targets:</span> {targetText}
      </div>
      {mission.suggestedClubs && (
        <div className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">Clubs:</span> {mission.suggestedClubs.join(", ")}
        </div>
      )}

      {missionProgress ? (
        missionProgress.attempts === 0 ? (
          <p className="mt-3 text-xs text-slate-500">{t("range.mission.hint.start")}</p>
        ) : (
          <div className="mt-3 space-y-1 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {t("range.mission.progressLabel", { defaultValue: "Hits in mission targets" })}
              </span>
              <span>
                {missionProgress.hitsInBands} / {missionProgress.attempts} ({Math.round(missionProgress.successRatio * 100)}%)
              </span>
            </div>
            <div>
              {missionProgress.success
                ? t("range.mission.success", { defaultValue: "Mission completed! ✅" })
                : t("range.mission.keepGoing", {
                    threshold: Math.round((missionProgress.threshold ?? 0.5) * 100),
                    defaultValue: `Mission not completed — aim for ${Math.round((missionProgress.threshold ?? 0.5) * 100)}%`,
                  })}
            </div>
          </div>
        )
      ) : (
        <p className="mt-3 text-xs text-slate-500">{t("range.mission.hint.start")}</p>
      )}
    </div>
  );
};

export { MissionDetails };
