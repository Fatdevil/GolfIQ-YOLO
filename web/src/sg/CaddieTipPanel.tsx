import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { getApiKey } from '@web/api';
import { FeatureGate } from '@web/access/FeatureGate';
import { TipConsole } from '@web/dev/TipConsole';
import { useEventSession } from '@web/session/eventSession';

type Tip = {
  playsLike_m: number | null;
  club: string | null;
  reasoning: string[];
  confidence: number;
  silent: boolean;
  silent_reason?: string | null;
};

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
  const tournamentSafe = session.tournamentSafe ?? false;
  const [loading, setLoading] = React.useState(false);
  const [tip, setTip] = React.useState<Tip | undefined>();
  const [err, setErr] = React.useState<string | undefined>();
  const [sending, setSending] = React.useState(false);
  const [sendErr, setSendErr] = React.useState<string | undefined>();
  const { t } = useTranslation();

  const activeTip = tip && !tip.silent ? tip : null;

  const silentKey = React.useMemo(() => {
    if (!tip?.silent) {
      return null;
    }
    switch (tip.silent_reason) {
      case 'low_confidence':
        return 'caddie.silent.lowConfidence';
      case 'tournament_safe':
        return 'caddie.silent.tournament';
      default:
        return 'caddie.silent.generic';
    }
  }, [tip?.silent, tip?.silent_reason]);
  const silentMessage = silentKey ? t(silentKey) : null;

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
        tournamentSafe,
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
      setTip({
        ...payload,
        reasoning: Array.isArray(payload.reasoning) ? payload.reasoning : [],
      });
    } catch (error) {
      setTip(undefined);
      setErr(error instanceof Error ? error.message : 'error');
    } finally {
      setLoading(false);
    }
  }, [runId, hole, shot, before_m, bearing_deg, tournamentSafe]);

  const sendToWatch = React.useCallback(async () => {
    if (!tip || !memberId || tip.silent) {
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

  const watchDisabled = sending || !activeTip || !memberId;
  const watchTitle = !memberId ? 'Requires a member ID to send tips' : undefined;
  const showAdvice = Boolean(activeTip);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-slate-100">Caddie</div>
          {tournamentSafe ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
              {t('caddie.tournament.badge')}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {showAdvice ? (
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
      {showAdvice && activeTip ? (
        <div className="mt-2 space-y-2 text-sm text-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            {activeTip.club ? (
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
                Club: <strong className="ml-1 text-slate-100">{activeTip.club}</strong>
              </span>
            ) : null}
          </div>
          <FeatureGate feature="caddie.advancedHints">
            <div className="space-y-1 text-xs text-slate-300">
              {typeof activeTip.playsLike_m === 'number' ? (
                <div>
                  Plays-like <strong>{Math.round(activeTip.playsLike_m)} m</strong>
                </div>
              ) : null}
              {activeTip.reasoning.length > 0 ? (
                <ul className="list-disc pl-5">
                  {activeTip.reasoning.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </FeatureGate>
        </div>
      ) : null}
      {tip && tip.silent ? (
        <div className="mt-3 rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
          {silentMessage}
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
