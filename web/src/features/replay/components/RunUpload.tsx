import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Upload, Download } from "lucide-react";

import { getRun } from "../../../api";
import type { ParsedHudRun } from "../utils/parseHudRun";
import { parseHudRun } from "../utils/parseHudRun";
import type { ParsedRound } from "../utils/parseRound";
import { parseRound } from "../utils/parseRound";
import type { Shot } from "../utils/parseShotLog";
import { parseShotLog } from "../utils/parseShotLog";

export type RunSlot = "primary" | "comparison";

export interface LoadedRunPatch {
  run?: ParsedHudRun;
  shots?: Shot[];
  round?: ParsedRound | null;
}

interface RunUploadProps {
  onRunLoaded: (payload: LoadedRunPatch, slot: RunSlot) => void;
}

type FetchState = "idle" | "loading" | "error";

export function RunUpload({ onRunLoaded }: RunUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [runId, setRunId] = useState("");
  const [slot, setSlot] = useState<RunSlot>("primary");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleParsed = useCallback(
    (payload: unknown, target: RunSlot) => {
      try {
        if (Array.isArray(payload)) {
          const run = parseHudRun(payload);
          const shots = parseShotLog(payload);
          onRunLoaded({ run, shots }, target);
        } else if (payload && typeof payload === 'object') {
          const record = payload as Record<string, unknown>;
          if (Array.isArray(record.events)) {
            const events = record.events as unknown[];
            const run = parseHudRun(events);
            const shots = parseShotLog(events);
            onRunLoaded({ run, shots }, target);
          } else {
            const round = parseRound(payload);
            onRunLoaded({ round }, target);
          }
        } else {
          throw new Error('Unsupported JSON payload');
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [onRunLoaded],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }
      const [file] = Array.from(files);
      if (!file) return;
      if (!file.name.endsWith(".json")) {
        setError("Please select a hud_run.json file");
        return;
      }
      const targetSlot = slot;
      file
        .text()
        .then((text) => {
          try {
            const parsed = JSON.parse(text);
            handleParsed(parsed, targetSlot);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    },
    [handleParsed, slot],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      handleFiles(event.dataTransfer?.files ?? null);
    },
    [handleFiles],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const onFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleFiles(event.target.files);
    },
    [handleFiles],
  );

  const fetchRun = useCallback(async () => {
    if (!runId.trim()) {
      setError("Enter a run id");
      return;
    }
    setFetchState("loading");
    setError(null);
    const targetSlot = slot;
    try {
      const run = await getRun(runId.trim());
      const events = (run as Record<string, unknown>)["events"];
      if (!Array.isArray(events)) {
        throw new Error("Run did not include telemetry events");
      }
      handleParsed(events as unknown[], targetSlot);
      setFetchState("idle");
    } catch (err) {
      setFetchState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [handleParsed, runId, slot]);

  const helperText = useMemo(() => {
    if (fetchState === "loading") {
      return "Fetching run…";
    }
    if (error) {
      return error;
    }
    return "Drop hud_run.json / round_run.json or load by run id";
  }, [error, fetchState]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span>Target slot</span>
        <div className="inline-flex overflow-hidden rounded border border-slate-700">
          <button
            type="button"
            onClick={() => setSlot("primary")}
            className={`px-3 py-1 transition ${
              slot === "primary"
                ? "bg-emerald-500 text-emerald-950"
                : "bg-slate-900/70 text-slate-300 hover:bg-slate-800/80"
            }`}
          >
            Primary
          </button>
          <button
            type="button"
            onClick={() => setSlot("comparison")}
            className={`px-3 py-1 transition ${
              slot === "comparison"
                ? "bg-emerald-500 text-emerald-950"
                : "bg-slate-900/70 text-slate-300 hover:bg-slate-800/80"
            }`}
          >
            Comparison
          </button>
        </div>
      </div>
      <div
        className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center transition hover:border-emerald-400 hover:bg-slate-900"
        onDrop={onDrop}
        onDragOver={onDragOver}
        role="button"
        tabIndex={0}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            fileInputRef.current?.click();
          }
        }}
      >
        <Upload className="h-10 w-10 text-emerald-300" />
        <div className="space-y-2">
          <p className="text-lg font-semibold text-slate-100">Drop hud_run.json or round_run.json</p>
          <p className="text-sm text-slate-400">or choose the file from your computer</p>
        </div>
        <button
          type="button"
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow hover:bg-emerald-400"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onFileInput}
        />
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-semibold text-slate-300" htmlFor="run-id-input">
              Fetch from server
            </label>
            <input
              id="run-id-input"
              type="text"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
              placeholder="Enter run id"
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={fetchRun}
            className="inline-flex items-center justify-center gap-2 rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            <Download className="h-4 w-4" />
            Load
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">{helperText}</p>
      </div>
    </section>
  );
}
