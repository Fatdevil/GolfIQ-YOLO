import * as React from 'react';

import { getApiKey } from '@web/api';

type Tip = { playsLike_m: number; club: string; reasoning: string[] };

type Props = {
  runId: string;
  hole: number;
  shot: number;
  before_m: number;
  bearing_deg: number;
};

export function CaddieTipPanel({ runId, hole, shot, before_m, bearing_deg }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [tip, setTip] = React.useState<Tip | undefined>();
  const [err, setErr] = React.useState<string | undefined>();

  const requestAdvice = React.useCallback(async () => {
    try {
      setLoading(true);
      setErr(undefined);
      const body = {
        runId,
        hole,
        shotNumber: shot,
        shot: { before_m, target_bearing_deg: bearing_deg, lie: 'fairway' },
        env: { wind_mps: 4.0, wind_dir_deg: 270, temp_c: 18.0, elev_delta_m: 0 },
        bag: {
          carries_m: {
            PW: 115,
            '9i': 125,
            '8i': 135,
            '7i': 145,
            '6i': 155,
            '5i': 165,
            '4i': 175,
            '3w': 210,
            D: 230,
          },
        },
      };
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = getApiKey();
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }
      const response = await fetch('/api/caddie/advise', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error('advise failed');
      }
      const payload = (await response.json()) as Tip;
      setTip(payload);
    } catch (error) {
      setTip(undefined);
      setErr(error instanceof Error ? error.message : 'error');
    } finally {
      setLoading(false);
    }
  }, [runId, hole, shot, before_m, bearing_deg]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-slate-100">Caddie</div>
        <button
          className="text-xs font-medium text-emerald-300 underline disabled:cursor-not-allowed disabled:opacity-60"
          onClick={requestAdvice}
          disabled={loading}
          type="button"
        >
          {loading ? '…' : 'Get advice'}
        </button>
      </div>
      {tip ? (
        <div className="mt-2 space-y-1 text-sm text-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
              Club: <strong className="ml-1 text-slate-100">{tip.club}</strong>
            </span>
            <span>
              Plays-like <strong>{Math.round(tip.playsLike_m)} m</strong>
            </span>
          </div>
          <ul className="list-disc pl-5 text-xs text-slate-300">
            {tip.reasoning.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {err ? <div className="mt-2 text-xs text-rose-400">Error: {err}</div> : null}
    </div>
  );
}

export default CaddieTipPanel;
