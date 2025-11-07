import { useEffect, useMemo } from 'react';

import type { ReelUserOptions } from '@shared/reels/types';
import { emitReelExportOpened, emitReelExportOptions, emitReelExportSubmitted } from '@shared/telemetry/reels';

import type { ReelExportPreset } from './types';

type ExportModalProps = {
  open: boolean;
  presets: ReelExportPreset[];
  options: ReelUserOptions;
  onOptionsChange: (next: ReelUserOptions) => void;
  onSubmit: (options: ReelUserOptions) => void;
  onClose: () => void;
  exporting: boolean;
  exportProgress: number;
  exportStatus: string | null;
  durationMs: number;
  includeBadges: boolean;
  onIncludeBadgesChange: (next: boolean) => void;
  onCancel?: () => void;
  downloadUrl?: string | null;
  downloadName?: string | null;
  durationWarning?: string | null;
};

function toHasCaption(value: string | null | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return value.trim().length > 0;
}

function clampCaption(value: string): string {
  if (value.length <= 80) {
    return value;
  }
  return value.slice(0, 80);
}

export default function ExportModal(props: ExportModalProps): JSX.Element | null {
  const {
    open,
    presets,
    options,
    onOptionsChange,
    onSubmit,
    onClose,
    exporting,
    exportProgress,
    exportStatus,
    durationMs,
    includeBadges,
    onIncludeBadgesChange,
    onCancel,
    downloadUrl,
    downloadName,
    durationWarning,
  } = props;

  const activePreset = useMemo(() => {
    return presets.find((preset) => preset.id === options.presetId) ?? presets[0] ?? null;
  }, [options.presetId, presets]);

  const watermarkEnabled = options.watermark !== false;
  const audioEnabled = options.audio === true;
  const captionValue = typeof options.caption === 'string' ? clampCaption(options.caption) : '';
  const hasCaption = toHasCaption(captionValue);

  useEffect(() => {
    if (!open) {
      return;
    }
    emitReelExportOpened();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    emitReelExportOptions({
      presetId: options.presetId,
      watermark: watermarkEnabled,
      hasCaption,
      audio: audioEnabled,
    });
  }, [open, options.presetId, watermarkEnabled, hasCaption, audioEnabled]);

  if (!open) {
    return null;
  }

  const clipSeconds = Math.max(0, durationMs) / 1000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-slate-50">Export reel</h3>
            <p className="text-sm text-slate-400">Choose a preset and options, then start encoding.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
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
              {presets.map((preset) => (
                <label
                  key={preset.id}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-4 py-3 transition hover:border-emerald-400/70 ${
                    options.presetId === preset.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold text-slate-100">{preset.label}</div>
                      <div className="text-xs text-slate-400">{preset.description}</div>
                    </div>
                    <div className="text-xs text-slate-400 text-right">
                      {preset.w}×{preset.h} · {preset.fps} fps
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    Safe zone top {preset.safe.top}px · bottom {preset.safe.bottom}px · ~{Math.round(preset.bitrate / 1_000_000)} Mbps
                  </div>
                  <input
                    type="radio"
                    name="reel-preset"
                    value={preset.id}
                    checked={options.presetId === preset.id}
                    onChange={() => onOptionsChange({ ...options, presetId: preset.id })}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>
          </section>
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={watermarkEnabled}
                onChange={(event) => onOptionsChange({ ...options, watermark: event.target.checked })}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
              />
              Watermark overlay
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={audioEnabled}
                onChange={(event) => onOptionsChange({ ...options, audio: event.target.checked })}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
              />
              Include audio bed
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={includeBadges}
                onChange={(event) => onIncludeBadgesChange(event.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
              />
              Carry &amp; club badges
            </label>
          </section>
          <section className="space-y-2">
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              Caption (optional)
              <input
                type="text"
                value={captionValue}
                maxLength={80}
                onChange={(event) => onOptionsChange({ ...options, caption: clampCaption(event.target.value) })}
                placeholder="Add a caption to stash for sharing later"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-emerald-400/50"
              />
              <span className="text-xs text-slate-500">{captionValue.length}/80 characters</span>
            </label>
          </section>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Clip length</span>
            <span>{clipSeconds.toFixed(1)} s @ {activePreset?.fps ?? 0} fps</span>
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
              onClick={() => {
                emitReelExportSubmitted({
                  presetId: options.presetId,
                  watermark: watermarkEnabled,
                  hasCaption,
                  audio: audioEnabled,
                });
                onSubmit({
                  ...options,
                  caption: captionValue,
                });
              }}
              disabled={exporting}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
            >
              {exporting ? 'Encoding…' : 'Start export'}
            </button>
            {exporting ? (
              <button
                type="button"
                onClick={onCancel}
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
  );
}
