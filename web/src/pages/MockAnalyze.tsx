import { FormEvent, useState } from "react";
import MetricCard from "../components/MetricCard";
import { postMockAnalyze } from "../api";

interface MockFormState {
  frames: number;
  fps: number;
  ref_len_m: number;
  ref_len_px: number;
  smoothing_window: number;
  persist: boolean;
  ball_dx_px: number;
  ball_dy_px: number;
  club_dx_px: number;
  club_dy_px: number;
}

interface MockResult {
  run_id?: string;
  metrics?: Record<string, number>;
  events?: Array<Record<string, unknown>>;
}

export default function MockAnalyzePage() {
  const [form, setForm] = useState<MockFormState>({
    frames: 120,
    fps: 240,
    ref_len_m: 3,
    ref_len_px: 600,
    smoothing_window: 3,
    persist: false,
    ball_dx_px: 250,
    ball_dy_px: -20,
    club_dx_px: 220,
    club_dy_px: -35,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MockResult | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        frames: form.frames,
        fps: form.fps,
        ref_len_m: form.ref_len_m,
        ref_len_px: form.ref_len_px,
        smoothing_window: form.smoothing_window,
        persist: form.persist,
        ball_dx_px: form.ball_dx_px,
        ball_dy_px: form.ball_dy_px,
        club_dx_px: form.club_dx_px,
        club_dy_px: form.club_dy_px,
      };
      const data = await postMockAnalyze(payload);
      setResult(data);
    } catch (err) {
      console.error(err);
      setError("Mock analyze failed. Review API logs for details.");
    } finally {
      setLoading(false);
    }
  };

  const metrics = result?.metrics ?? {};

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Mock Analyze</h1>
        <p className="text-sm text-slate-400">
          Synthesize a run with deterministic deltas to validate downstream metrics.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col text-sm">
            Frames
            <input
              type="number"
              min={1}
              value={form.frames}
              onChange={(e) => setForm((p) => ({ ...p, frames: Number(e.target.value) }))}
              className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              required
            />
          </label>
          <label className="flex flex-col text-sm">
            FPS
            <input
              type="number"
              min={1}
              value={form.fps}
              onChange={(e) => setForm((p) => ({ ...p, fps: Number(e.target.value) }))}
              className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              required
            />
          </label>
          <label className="flex flex-col text-sm">
            Ref length (m)
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.ref_len_m}
              onChange={(e) => setForm((p) => ({ ...p, ref_len_m: Number(e.target.value) }))}
              className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              required
            />
          </label>
          <label className="flex flex-col text-sm">
            Ref length (px)
            <input
              type="number"
              min={0}
              value={form.ref_len_px}
              onChange={(e) => setForm((p) => ({ ...p, ref_len_px: Number(e.target.value) }))}
              className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              required
            />
          </label>
          <label className="flex flex-col text-sm">
            Smoothing window
            <input
              type="number"
              min={1}
              value={form.smoothing_window}
              onChange={(e) => setForm((p) => ({ ...p, smoothing_window: Number(e.target.value) }))}
              className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.persist}
              onChange={(e) => setForm((p) => ({ ...p, persist: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950"
            />
            Persist run
          </label>
        </div>

        <fieldset className="grid gap-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <legend className="px-2 text-sm font-semibold text-emerald-200">Ball delta</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-sm">
              ΔX
              <input
                type="number"
                value={form.ball_dx_px}
                onChange={(e) => setForm((p) => ({ ...p, ball_dx_px: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-sm">
              ΔY
              <input
                type="number"
                value={form.ball_dy_px}
                onChange={(e) => setForm((p) => ({ ...p, ball_dy_px: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <legend className="px-2 text-sm font-semibold text-emerald-200">Club delta</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-sm">
              ΔX
              <input
                type="number"
                value={form.club_dx_px}
                onChange={(e) => setForm((p) => ({ ...p, club_dx_px: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-sm">
              ΔY
              <input
                type="number"
                value={form.club_dy_px}
                onChange={(e) => setForm((p) => ({ ...p, club_dy_px: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              />
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
        >
          {loading ? "Running mock…" : "Run mock analyze"}
        </button>
      </form>

      {result && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-emerald-200">Result</h2>
            {result.run_id && (
              <p className="mt-2 text-sm text-slate-400">
                Run ID: <span className="font-mono text-emerald-300">{result.run_id}</span>
              </p>
            )}
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(metrics).map(([key, value]) => (
                <MetricCard key={key} title={key} value={value} />
              ))}
            </div>
          </div>
          {result.events && result.events.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="text-base font-semibold text-emerald-200">Events</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                {result.events.map((event, index) => (
                  <li
                    key={index}
                    className="rounded border border-slate-800 bg-slate-900/80 px-3 py-2 font-mono text-xs"
                  >
                    {JSON.stringify(event)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
