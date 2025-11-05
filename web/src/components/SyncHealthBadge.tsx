import { useEffect, useMemo, useState } from "react";

import {
  forceResync,
  getSyncHealth,
  subscribeSyncHealth,
  type SyncHealthSnapshot,
} from '@shared/events/resync';

const STATUS_STYLES: Record<SyncHealthSnapshot["status"], string> = {
  ok: "bg-emerald-500/10 text-emerald-200 border-emerald-500/40",
  behind: "bg-amber-500/10 text-amber-200 border-amber-500/40",
  error: "bg-red-500/10 text-red-200 border-red-500/40",
};

const STATUS_LABEL: Record<SyncHealthSnapshot["status"], string> = {
  ok: "OK",
  behind: "Behind",
  error: "Error",
};

export function SyncHealthBadge(): JSX.Element {
  const [snapshot, setSnapshot] = useState<SyncHealthSnapshot>(() => getSyncHealth());

  useEffect(() => {
    return subscribeSyncHealth((next) => {
      setSnapshot(next);
    });
  }, []);

  const formattedSync = useMemo(() => {
    if (!snapshot.lastSyncTs) {
      return "No successful sync yet";
    }
    return `Last sync ${new Date(snapshot.lastSyncTs).toLocaleString()}`;
  }, [snapshot.lastSyncTs]);

  const statusClass = STATUS_STYLES[snapshot.status];
  const statusLabel = STATUS_LABEL[snapshot.status];
  const reason = snapshot.lastError;

  const handleForceResync = () => {
    const target = snapshot.scheduledEventId ?? "qa-resync";
    forceResync(target);
  };

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-xs uppercase text-slate-500">Sync Health</div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClass}`}
            >
              {statusLabel}
              {snapshot.pending ? <span className="ml-2 text-[10px] opacity-80">(resync queued)</span> : null}
            </span>
          </div>
          <div className="text-xs text-slate-400">{formattedSync}</div>
          {reason ? <div className="text-xs text-slate-500">{reason}</div> : null}
        </div>
        <button
          type="button"
          onClick={handleForceResync}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          Force resync
        </button>
      </div>
    </div>
  );
}

export default SyncHealthBadge;
