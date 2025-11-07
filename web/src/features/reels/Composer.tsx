import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { makeTimeline, pickTopShots, planFrame } from '@shared/reels/select';
import type { ReelShotRef, ReelTimeline } from '@shared/reels/types';
import type { Homography, Pt } from '@shared/tracer/calibrate';
import { buildShotTracerDraw } from '@shared/tracer/draw';
import { drawCommands } from '../../routes/composer/draw';
import { renderTracerReel } from './export/ffmpeg';
import { REEL_EXPORT_PRESETS, buildDrawTimeline } from './export/templates';
import type { ReelExportPreset } from './export/types';
import CalibratePanel from './CalibratePanel';

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (16 / 9));

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
  const [exportPresetId, setExportPresetId] = useState<string>(REEL_EXPORT_PRESETS[0]?.id ?? 'tiktok-1080');
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [includeBadges, setIncludeBadges] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(false);
  const [durationWarning, setDurationWarning] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const selectedPreset = useMemo<ReelExportPreset>(() => {
    return REEL_EXPORT_PRESETS.find((preset) => preset.id === exportPresetId) ?? REEL_EXPORT_PRESETS[0]!;
  }, [exportPresetId]);

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

  const handleStartExport = useCallback(async () => {
    if (!timeline || !primaryShot || !selectedPreset) {
      setExportStatus('No reel payload available.');
      return;
    }
    const durationMs = exportDurationMs;
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
      setDownloadName(null);
    }
    const tracer = buildShotTracerDraw(primaryShot.ref, {
      width: selectedPreset.width,
      height: selectedPreset.height,
      H: timeline.homography ?? null,
    });
    if (!tracer) {
      setExportStatus('This swing is missing tracer data.');
      return;
    }
    const buildTimeline = buildDrawTimeline(primaryShot.ref, tracer, selectedPreset.theme);
    const controller = new AbortController();
    setAbortController(controller);
    setExporting(true);
    setExportStatus('Preparing export…');
    setExportProgress(0.05);
    try {
      const result = await renderTracerReel({
        videoSrc: (primaryShot.ref as unknown as { videoSrc?: string }).videoSrc ?? null,
        fps: selectedPreset.fps,
        width: selectedPreset.width,
        height: selectedPreset.height,
        startMs: 0,
        endMs: Math.max(1, durationMs),
        drawTimeline: buildTimeline,
        includeBadges,
        watermark: includeWatermark,
        templateId: selectedPreset.id,
        musicSrc: includeMusic ? '/assets/audio/reels/theme.mp3' : null,
        onProgress: (ratio) => {
          setExportProgress(Math.max(0, Math.min(1, ratio)));
        },
        signal: controller.signal,
      });
      const extension = result.codec === 'mp4' ? 'mp4' : 'webm';
      const baseName = `${selectedPreset.id}-${Date.now()}`;
      const blobUrl = URL.createObjectURL(result.blob);
      setDownloadUrl(blobUrl);
      setDownloadName(`${baseName}.${extension}`);
      setExportStatus(result.codec === 'mp4' ? 'MP4 ready for download' : 'WebM fallback ready');
      setExportProgress(1);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportStatus('Export cancelled');
      } else {
        console.error('[Reels] export failed', error);
        setExportStatus('Failed to export reel. Please try again.');
      }
    } finally {
      setExporting(false);
      setAbortController(null);
    }
  }, [
    timeline,
    primaryShot,
    selectedPreset,
    exportDurationMs,
    downloadUrl,
    includeBadges,
    includeWatermark,
    includeMusic,
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-50">Auto Reel Composer</h1>
        <p className="text-slate-400">
          Generate a vertical highlight reel with tracer overlays, stat bar, and GolfIQ-YOLO watermark.
        </p>
      </header>
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
      {exportModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-slate-50">Export reel</h3>
                <p className="text-sm text-slate-400">Choose a preset and options, then start encoding.</p>
              </div>
              <button
                type="button"
                onClick={handleCloseExport}
                disabled={exporting}
                className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Close
              </button>
            </div>
            <div className="mt-6 space-y-5">
              <section>
                <div className="text-sm font-semibold text-slate-200">Presets</div>
                <div className="mt-3 grid gap-3">
                  {REEL_EXPORT_PRESETS.map((preset) => (
                    <label
                      key={preset.id}
                      className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-4 py-3 transition hover:border-emerald-400/70 ${
                        exportPresetId === preset.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-slate-100">{preset.label}</div>
                          <div className="text-xs text-slate-400">{preset.description}</div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {preset.width}×{preset.height} · {preset.fps} fps
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="reel-preset"
                        value={preset.id}
                        checked={exportPresetId === preset.id}
                        onChange={() => setExportPresetId(preset.id)}
                        className="sr-only"
                      />
                    </label>
                  ))}
                </div>
              </section>
              <section className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeWatermark}
                    onChange={(event) => setIncludeWatermark(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
                  />
                  Watermark
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeBadges}
                    onChange={(event) => setIncludeBadges(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
                  />
                  Carry &amp; club badges
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeMusic}
                    onChange={(event) => setIncludeMusic(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
                  />
                  Add music bed
                </label>
              </section>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Clip length</span>
                <span>{(exportDurationMs / 1000).toFixed(1)} s @ {selectedPreset.fps} fps</span>
              </div>
              {durationWarning ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  {durationWarning}
                </div>
              ) : null}
              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.round(exportProgress * 100)}%` }}
                  />
                </div>
                {exportStatus ? <div className="text-sm text-slate-300">{exportStatus}</div> : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleStartExport}
                  disabled={exporting || !primaryShot}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
                >
                  {exporting ? 'Encoding…' : 'Start export'}
                </button>
                {exporting ? (
                  <button
                    type="button"
                    onClick={handleCancelExport}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
                  >
                    Cancel
                  </button>
                ) : null}
                {downloadUrl && downloadName ? (
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="inline-flex items-center justify-center rounded-lg border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
                  >
                    Download {downloadName}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
