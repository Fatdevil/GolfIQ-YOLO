import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

import { getOfflineQueue } from "../bootstrap/offline";
import type { QueueState } from "../offline/Queue";

const queue = getOfflineQueue();

export default function QueueIndicator(): JSX.Element {
  const state = useQueueState();
  const [open, setOpen] = useState(false);

  const pending = state.pending;
  const hasError = Boolean(state.lastError);
  const icon = selectIcon(state);
  const statusLabel = formatStatus(state);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Offline queue status"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
      >
        {icon}
        {pending > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1.1rem] items-center justify-center rounded-full bg-emerald-500 text-[0.6rem] font-semibold text-slate-950">
            {pending}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-slate-700 bg-slate-900/95 p-3 text-left shadow-xl">
          <div className="mb-2 text-sm font-semibold text-slate-100">Offline queue</div>
          <dl className="space-y-1 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <dt>Pending</dt>
              <dd className="font-medium text-slate-100">{pending}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Status</dt>
              <dd className="font-medium text-slate-100">{statusLabel}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Network</dt>
              <dd className="font-medium text-slate-100">{state.online ? "Online" : "Offline"}</dd>
            </div>
            {state.nextAttemptAt ? (
              <div className="flex items-center justify-between">
                <dt>Next attempt</dt>
                <dd className="font-medium text-slate-100">{formatNextAttempt(state.nextAttemptAt)}</dd>
              </div>
            ) : null}
            {hasError ? (
              <div className="mt-2 rounded bg-amber-500/10 p-2 text-[0.7rem] text-amber-200">
                <div className="font-semibold">Last error</div>
                <p className="mt-1 whitespace-pre-line leading-snug">{state.lastError}</p>
              </div>
            ) : null}
          </dl>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded border border-emerald-400 px-2 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
              onClick={() => {
                void queue.drain().catch(() => undefined);
                setOpen(false);
              }}
            >
              Retry now
            </button>
            <button
              type="button"
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              onClick={() => queue.clearLastError()}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function useQueueState(): QueueState {
  return useSyncExternalStore(
    (listener) => queue.subscribe(listener),
    () => queue.getSnapshot(),
    () => queue.getServerSnapshot(),
  );
}

function selectIcon(state: QueueState): JSX.Element {
  if (state.lastError) {
    return <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />;
  }
  if (state.processing) {
    return <Loader2 className="h-4 w-4 animate-spin text-emerald-300" aria-hidden="true" />;
  }
  if (state.pending > 0) {
    return <UploadCloud className="h-4 w-4 text-emerald-300" aria-hidden="true" />;
  }
  return <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />;
}

function formatStatus(state: QueueState): string {
  if (state.lastError) {
    return "Attention";
  }
  if (!state.online) {
    return "Paused";
  }
  if (state.processing) {
    return "Processing";
  }
  if (state.pending > 0) {
    return "Scheduled";
  }
  return "Idle";
}

function formatNextAttempt(timestamp: number): string {
  const delta = Math.max(0, timestamp - Date.now());
  if (delta < 1_000) {
    return "now";
  }
  if (delta < 60_000) {
    return `${Math.round(delta / 1_000)}s`;
  }
  const minutes = Math.round(delta / 60_000);
  return `${minutes}m`;
}

