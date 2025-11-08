import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { makeTimeline, pickTopShots, planFrame } from '@shared/reels/select';
import type { ReelShotRef, ReelTimeline, ReelUserOptions } from '@shared/reels/types';
import { DEFAULT_REEL_EXPORT_PRESET_ID } from '@shared/reels/presets';
import type { Homography, Pt } from '@shared/tracer/calibrate';
import type { ShotForTracer } from '@shared/tracer/draw';
import { emitReelExportFailure, emitReelExportSuccess } from '@shared/telemetry/reels';
import { drawCommands } from '../../routes/composer/draw';
import { encodeReel, ReelEncodeError } from './export/encode';
import { REEL_EXPORT_PRESETS } from './export/templates';
import type { ReelExportPreset } from './export/types';
import ExportModal from './export/ExportModal';
import CalibratePanel from './CalibratePanel';

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (16 / 9));

const EXPORT_OPTIONS_STORAGE_KEY = 'reel.export.options.v1';
const DEFAULT_PRESET = REEL_EXPORT_PRESETS[0] ?? null;
const DEFAULT_PRESET_ID = DEFAULT_PRESET?.id ?? DEFAULT_REEL_EXPORT_PRESET_ID;
const DEFAULT_EXPORT_OPTIONS: ReelUserOptions = {
  presetId: DEFAULT_PRESET_ID,
  watermark: true,
  caption: null,
  audio: false,
};

function isValidPresetId(id: string | null | undefined): id is string {
  return Boolean(id && REEL_EXPORT_PRESETS.some((preset) => preset.id === id));
}

function sanitizeExportOptions(candidate: Partial<ReelUserOptions> | null | undefined): ReelUserOptions {
  const merged: Partial<ReelUserOptions> = { ...DEFAULT_EXPORT_OPTIONS, ...(candidate ?? {}) };
  const presetId = isValidPresetId(merged.presetId) ? (merged.presetId as string) : DEFAULT_PRESET_ID;
  const watermark = merged.watermark !== false;
  const audio = merged.audio === true;
  let caption: string | null = null;
  if (typeof merged.caption === 'string') {
    const trimmed = merged.caption.slice(0, 80).trim();
    caption = trimmed.length ? trimmed : null;
  }
  return {
    presetId,
    watermark,
    caption,
    audio,
  } satisfies ReelUserOptions;
}

function loadStoredExportOptions(): ReelUserOptions {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return sanitizeExportOptions(null);
  }
  try {
    const raw = window.localStorage.getItem(EXPORT_OPTIONS_STORAGE_KEY);
    if (!raw) {
      return sanitizeExportOptions(null);
    }
    const parsed = JSON.parse(raw) as Partial<ReelUserOptions> | null;
    return sanitizeExportOptions(parsed ?? null);
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.warn('[Reels] failed to load export options', error);
    }
    return sanitizeExportOptions(null);
  }
}

type ReelPayload = {
  shots?: ReelShotRef[];
  timeline?: ReelTimeline;
  fps?: number;
};

type CalibrationSnapshot = {
  homography: Homography;
  tee: Pt;
  flag: Pt;
  yardage_m: number;
  quality: number;
};

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const globalBuffer =
    typeof globalThis !== 'undefined' ? (globalThis as { Buffer?: { from: (input: string, encoding: string) => Uint8Array | number[] } }).Buffer : undefined;
  if (globalBuffer) {
    const buf = globalBuffer.from(base64, 'base64');
    return buf instanceof Uint8Array ? buf : Uint8Array.from(buf);
  }
  throw new Error('Base64 decoding is not supported in this environment');
}

function decodePayload(raw: string | null): ReelPayload | null {
  if (!raw) {
    return null;
  }
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const bytes = base64ToBytes(padded);
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    let json = '';
    if (decoder) {
      json = decoder.decode(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        json += String.fromCharCode(bytes[i]!);
      }
    }
    return JSON.parse(json);
  } catch (error) {
    console.warn('[Reels] failed to decode payload', error);
    return null;
  }
}

function resolveShots(payload: ReelPayload | null): ReelShotRef[] {
  if (!payload) {
    return [];
  }
  if (payload.timeline?.shots?.length) {
    return payload.timeline.shots.map((entry) => entry.ref).filter(Boolean);
  }
  return Array.isArray(payload.shots) ? payload.shots : [];
}

export default function Composer(): JSX.Element {
  const [params] = useSearchParams();
  const payload = useMemo(() => decodePayload(params.get('payload')), [params]);
  const payloadShots = useMemo(() => resolveShots(payload), [payload]);
  const selectedShots = useMemo(() => {
    if (payloadShots.length) {
      return payloadShots;
    }
    return pickTopShots(Array.isArray(payload?.shots) ? payload.shots : [], 2);
  }, [payload, payloadShots]);
  const [calibration, setCalibration] = useState<CalibrationSnapshot | null>(null);
  const defaultYardage = useMemo(() => {
    if (!selectedShots.length) {
      return undefined;
    }
    const shot = selectedShots[0];
    if (shot?.carry_m && Number.isFinite(shot.carry_m)) {
      return shot.carry_m;
    }
    if (shot?.total_m && Number.isFinite(shot.total_m)) {
      return shot.total_m;
    }
    return undefined;
  }, [selectedShots]);
  const defaultBearing = useMemo(() => {
    if (!selectedShots.length) {
      return 0;
    }
    const bearing = selectedShots[0]?.startDeg;
    return Number.isFinite(bearing) ? (bearing as number) : 0;
  }, [selectedShots]);
  const timeline = useMemo(() => {
    if (payload?.timeline && payload?.timeline.shots?.length) {
      return {
        ...payload.timeline,
        homography: calibration?.homography ?? payload.timeline.homography ?? null,
        shots: payload.timeline.shots.map((entry) => ({
          ...entry,
          ref: entry.ref,
        })),
      } satisfies ReelTimeline;
    }
    if (selectedShots.length) {
      const base = makeTimeline(selectedShots, payload?.timeline?.fps ?? payload?.fps ?? 30);
      return {
        ...base,
        homography: calibration?.homography ?? null,
      } satisfies ReelTimeline;
    }
    return null;
  }, [payload, selectedShots, calibration]);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportOptions, setExportOptions] = useState<ReelUserOptions>(() => loadStoredExportOptions());
  const [includeBadges, setIncludeBadges] = useState(true);
  const [durationWarning, setDurationWarning] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedPreset = useMemo<ReelExportPreset>(() => {
    return REEL_EXPORT_PRESETS.find((preset) => preset.id === exportOptions.presetId) ?? REEL_EXPORT_PRESETS[0]!;
  }, [exportOptions.presetId]);

  const handleOptionsChange = useCallback((next: ReelUserOptions) => {
    setExportOptions(sanitizeExportOptions(next));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window?.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(EXPORT_OPTIONS_STORAGE_KEY, JSON.stringify(exportOptions));
    } catch (error) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.warn('[Reels] failed to persist export options', error);
      }
    }
  }, [exportOptions]);

  const primaryShot = useMemo(() => {
    if (!timeline?.shots?.length) {
      return null;
    }
    return timeline.shots[0] ?? null;
  }, [timeline]);

  const exportDurationMs = useMemo(() => {
    if (!timeline || !primaryShot) {
      return 0;
    }
    const durationFrames = primaryShot.duration || timeline.frames;
    return Math.max(0, Math.round((durationFrames / Math.max(1, timeline.fps)) * 1000));
  }, [timeline, primaryShot]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleCalibrationSave = useCallback((snapshot: CalibrationSnapshot) => {
    setCalibration(snapshot);
  }, []);

  const calibrateWidth = timeline ? Math.min(260, timeline.width) : 240;
  const calibrateHeight = timeline
    ? Math.round((timeline.height / Math.max(1, timeline.width)) * calibrateWidth)
    : Math.round((PREVIEW_HEIGHT / PREVIEW_WIDTH) * 240);

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (!exportModalOpen) {
      setDurationWarning(null);
      return;
    }
    if (exportDurationMs > 20_000) {
      setDurationWarning('Clips longer than 20 seconds may feel sluggish on social feeds. Trim the swing for best results.');
    } else {
      setDurationWarning(null);
    }
  }, [exportModalOpen, exportDurationMs]);

  useEffect(() => {
    if (!timeline || !canvasRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = timeline.width;
    canvas.height = timeline.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    let frameIndex = 0;
    let cancelled = false;
    let timer: number | undefined;
    const tick = () => {
      if (!timeline.frames) {
        return;
      }
      drawCommands(ctx, timeline, planFrame(timeline, frameIndex));
      frameIndex = (frameIndex + 1) % timeline.frames;
      if (!cancelled) {
        timer = window.setTimeout(tick, 1000 / Math.max(1, timeline.fps));
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [timeline]);

  const handleOpenExport = useCallback(() => {
    setExportModalOpen(true);
    setExportStatus(null);
    setExportProgress(0);
  }, []);

  const handleCloseExport = useCallback(() => {
    if (exporting) {
      return;
    }
    setExportModalOpen(false);
    setExportStatus(null);
  }, [exporting]);

  const handleCancelExport = useCallback(() => {
    if (!abortController) {
      return;
    }
    abortController.abort();
  }, [abortController]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setToastMessage(null);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toastMessage]);

  const handleStartExport = useCallback(
    async (options: ReelUserOptions) => {
      if (!timeline || !primaryShot) {
        setExportStatus('No reel payload available.');
        return;
      }
      const normalizedOptions = sanitizeExportOptions(options);
      setExportOptions(normalizedOptions);
      const preset =
        REEL_EXPORT_PRESETS.find((candidate) => candidate.id === normalizedOptions.presetId) ??
        REEL_EXPORT_PRESETS[0] ?? null;
      if (!preset) {
        setExportStatus('No preset available for export.');
        return;
      }
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null);
        setDownloadName(null);
      }
      setToastMessage(null);
      const shotsForEncoding = timeline.shots.map((shot) => shot.ref as unknown as ShotForTracer);
      if (!shotsForEncoding.length) {
        setExportStatus('No swings selected for export.');
        return;
      }
      const controller = new AbortController();
      setAbortController(controller);
      setExporting(true);
      setExportStatus('Preparing export…');
      setExportProgress(0.05);
      const watermark = normalizedOptions.watermark !== false;
      const audio = normalizedOptions.audio === true;
      const caption = normalizedOptions.caption ?? null;
      try {
        const result = await encodeReel(shotsForEncoding, {
          presetId: preset.id,
          watermark,
          caption,
          audio,
          homography: timeline.homography ?? null,
          signal: controller.signal,
          onProgress: (ratio) => {
            setExportProgress(Math.max(0, Math.min(1, ratio)));
          },
        });
        const extension = result.mime === 'video/mp4' ? 'mp4' : 'webm';
        const baseName = `${preset.id}-${Date.now()}`;
        const blobUrl = URL.createObjectURL(result.blob);
        setDownloadUrl(blobUrl);
        setDownloadName(`${baseName}.${extension}`);
        setExportStatus(result.mime === 'video/mp4' ? 'MP4 ready for download' : 'WebM fallback ready');
        setExportProgress(1);
        emitReelExportSuccess({
          presetId: preset.id,
          codec: result.mime,
          frames: result.frameCount,
          durationMs: result.durationMs,
        });
        if (result.mime === 'video/webm') {
          setToastMessage('Exported WebM via MediaRecorder fallback.');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setExportStatus('Export cancelled');
          setToastMessage('Export cancelled.');
          emitReelExportFailure({ presetId: preset.id, stage: 'encode', message: 'aborted' });
        } else if (error instanceof ReelEncodeError) {
          emitReelExportFailure({ presetId: preset.id, stage: error.stage, message: error.message });
          console.error('[Reels] export failed', error);
          setExportStatus('Failed to export reel. Please try again.');
          setToastMessage('Export failed. Please try again.');
        } else {
          console.error('[Reels] export failed', error);
          setExportStatus('Failed to export reel. Please try again.');
          setToastMessage('Export failed. Please try again.');
          emitReelExportFailure({ presetId: preset.id, stage: 'encode', message: (error as Error).message });
        }
      } finally {
        setExporting(false);
        setAbortController(null);
      }
    },
    [timeline, primaryShot, exportDurationMs, downloadUrl],
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-50">Auto Reel Composer</h1>
        <p className="text-slate-400">
          Generate a vertical highlight reel with tracer overlays, stat bar, and GolfIQ-YOLO watermark.
        </p>
      </header>
      {toastMessage ? (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100 shadow-lg">
          {toastMessage}
        </div>
      ) : null}
      {!timeline ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-6 text-slate-300">
          Provide a reel payload via the <code className="rounded bg-slate-800 px-1 py-0.5">payload</code> query parameter.
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm uppercase tracking-wide text-slate-500">Live preview</div>
              <div className="mt-4 flex justify-center">
                <canvas
                  ref={canvasRef}
                  style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, borderRadius: '24px' }}
                  className="overflow-hidden border border-slate-800 shadow-lg"
                />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm text-slate-300">
                <div>
                  <dt className="text-slate-500">Frames</dt>
                  <dd className="font-semibold text-slate-100">{timeline.frames}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Duration</dt>
                  <dd className="font-semibold text-slate-100">
                    {(timeline.frames / Math.max(1, timeline.fps)).toFixed(1)} s @ {timeline.fps} fps
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Resolution</dt>
                  <dd className="font-semibold text-slate-100">
                    {timeline.width} × {timeline.height}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Shots</dt>
                  <dd className="font-semibold text-slate-100">{timeline.shots.length}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-sm font-semibold text-slate-200">Shots included</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {timeline.shots.map((entry) => (
                  <li key={entry.ref.id} className="rounded border border-slate-800/60 bg-slate-900/50 px-3 py-2">
                    <div className="font-semibold text-slate-100">
                      {entry.ref.club ?? '—'} · {Math.round(entry.ref.carry_m ?? 0)} m carry
                    </div>
                    <div className="text-xs text-slate-400">
                      Total {Math.round(entry.ref.total_m ?? entry.ref.carry_m ?? 0)} m · PL{' '}
                      {entry.ref.playsLikePct != null ? entry.ref.playsLikePct.toFixed(1) : '0.0'}%
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-6">
            <div className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
              <div className="text-sm font-semibold text-slate-200">Camera calibration</div>
              <p className="text-xs text-slate-400">
                {calibration
                  ? `Applied · ${Math.round(calibration.quality * 100)}% quality`
                  : 'Tap Save to apply calibration to tracer rendering.'}
              </p>
              <CalibratePanel
                width={calibrateWidth}
                height={calibrateHeight}
                holeBearingDeg={defaultBearing}
                defaultYardage={defaultYardage}
                onSave={handleCalibrationSave}
              />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">Export</h2>
              <p className="text-sm text-slate-400">
                Pick a preset to create a share-ready vertical reel. Rendering happens locally with FFmpeg.wasm and
                falls back to WebM when MP4 is unavailable.
              </p>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Active preset</div>
                <div className="mt-2 text-lg font-semibold text-slate-100">{selectedPreset.label}</div>
                <div className="text-xs text-slate-400">{selectedPreset.description}</div>
                <div className="mt-2 text-[11px] text-slate-500">
                  {selectedPreset.w}×{selectedPreset.h} · {selectedPreset.fps} fps · ~
                  {Math.round(selectedPreset.bitrate / 1_000_000)} Mbps · Safe top {selectedPreset.safe.top}px · bottom{' '}
                  {selectedPreset.safe.bottom}px
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenExport}
                disabled={!timeline || !primaryShot}
                className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
              >
                {exporting ? 'Exporting…' : 'Export Reel'}
              </button>
              {exportStatus ? <p className="text-sm text-slate-300">{exportStatus}</p> : null}
              {downloadUrl && downloadName ? (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-emerald-400 px-4 py-2 text-base font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
                >
                  Download {downloadName}
                </a>
              ) : null}
            </div>
          </section>
        </div>
      )}
      <ExportModal
        open={exportModalOpen}
        presets={REEL_EXPORT_PRESETS}
        options={exportOptions}
        onOptionsChange={handleOptionsChange}
        onSubmit={handleStartExport}
        onClose={handleCloseExport}
        exporting={exporting}
        exportProgress={exportProgress}
        exportStatus={exportStatus}
        durationMs={exportDurationMs}
        includeBadges={includeBadges}
        onIncludeBadgesChange={setIncludeBadges}
        onCancel={handleCancelExport}
        downloadUrl={downloadUrl}
        downloadName={downloadName}
        durationWarning={durationWarning}
      />
    </div>
  );
}

export const __EXPORT_OPTIONS_STORAGE_KEY = EXPORT_OPTIONS_STORAGE_KEY;
export const __DEFAULT_EXPORT_OPTIONS = DEFAULT_EXPORT_OPTIONS;
export { sanitizeExportOptions as __sanitizeExportOptionsForTest, loadStoredExportOptions as __loadStoredExportOptionsForTest };
