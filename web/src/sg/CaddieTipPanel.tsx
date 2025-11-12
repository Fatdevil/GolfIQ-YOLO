import * as React from 'react';

import { getApiKey } from '@web/api';
import { TipConsole } from '@web/dev/TipConsole';
import { useEventSession } from '@web/session/eventSession';

type Tip = { playsLike_m: number; club: string; reasoning: string[] };

type Props = {
  runId: string;
  hole: number;
  shot: number;
  before_m: number;
  bearing_deg: number;
};

export function CaddieTipPanel({ runId, hole, shot, before_m, bearing_deg }: Props) {
  const session = useEventSession();
  const memberId = session.memberId ?? undefined;
  const [loading, setLoading] = React.useState(false);
  const [tip, setTip] = React.useState<Tip | undefined>();
  const [err, setErr] = React.useState<string | undefined>();
  const [sending, setSending] = React.useState(false);
  const [sendErr, setSendErr] = React.useState<string | undefined>();

  const requestAdvice = React.useCallback(async () => {
    try {
      setLoading(true);
      setErr(undefined);
      setSendErr(undefined);
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

  const sendToWatch = React.useCallback(async () => {
    if (!tip || !memberId) {
      return;
    }
    try {
      setSending(true);
      setSendErr(undefined);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = getApiKey();
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }
      const response = await fetch(`/api/watch/${memberId}/tips`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tipId: `run-${runId}-h${hole}-s${shot}`,
          title: `H${hole} S${shot}: ${tip.club ?? ''}`.trim(),
          body: tip.reasoning?.join(' • ') ?? 'Caddie tip',
          club: tip.club,
          playsLike_m: tip.playsLike_m,
          shotRef: { runId, hole, shot },
        }),
      });
      if (!response.ok) {
        throw new Error('send failed');
      }
    } catch (error) {
      setSendErr(error instanceof Error ? error.message : 'error');
    } finally {
      setSending(false);
    }
  }, [memberId, runId, hole, shot, tip]);

  const watchDisabled = sending || !tip || !memberId;
  const watchTitle = !memberId ? 'Requires a member ID to send tips' : undefined;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-slate-100">Caddie</div>
        <div className="flex items-center gap-2">
          {tip ? (
            <button
              className="text-xs font-medium text-slate-200 underline decoration-dashed underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={sendToWatch}
              disabled={watchDisabled}
              title={watchTitle}
            >
              {sending ? 'Sending…' : 'Send to Watch'}
            </button>
          ) : null}
          <button
            className="text-xs font-medium text-emerald-300 underline disabled:cursor-not-allowed disabled:opacity-60"
            onClick={requestAdvice}
            disabled={loading}
            type="button"
          >
            {loading ? '…' : 'Get advice'}
          </button>
        </div>
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
      {sendErr ? <div className="mt-2 text-xs text-rose-400">Send error: {sendErr}</div> : null}
      {import.meta.env.DEV && memberId ? (
        <TipConsole memberId={memberId} />
      ) : null}
    </div>
  );
}

export default CaddieTipPanel;
