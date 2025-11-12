import { useEffect, useMemo, useState } from 'react';

import { API, getApiKey } from '@web/api';

import DevWatchSimulator from './DevWatchSimulator';

type PairWatchDialogProps = {
  open: boolean;
  onClose: () => void;
  memberId?: string | null;
};

type JoinCodeResponse = {
  code: string;
  expTs: number;
};

type FetchState = 'idle' | 'loading' | 'error';

const WATCH_FEATURE_ENABLED = import.meta.env.VITE_FEATURE_WATCH === '1' || import.meta.env.DEV;

function buildHeaders(): HeadersInit {
  const apiKey = getApiKey();
  return apiKey ? { 'x-api-key': apiKey } : {};
}

async function requestJoinCode(memberId: string): Promise<JoinCodeResponse> {
  const url = new URL(`${API}/api/watch/pair/code`);
  url.searchParams.set('memberId', memberId);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: buildHeaders(),
  });
  if (!response.ok) {
    throw new Error(`pair code ${response.status}`);
  }
  return response.json() as Promise<JoinCodeResponse>;
}

function computeRemaining(expTs: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, expTs - now);
}

export default function PairWatchDialog({ open, onClose, memberId }: PairWatchDialogProps): JSX.Element | null {
  const [joinCode, setJoinCode] = useState<JoinCodeResponse | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [status, setStatus] = useState<FetchState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    if (!open || !memberId || !WATCH_FEATURE_ENABLED) {
      setJoinCode(null);
      setRemaining(0);
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    requestJoinCode(memberId)
      .then((payload) => {
        if (!cancelled) {
          setJoinCode(payload);
          setRemaining(computeRemaining(payload.expTs));
          setStatus('idle');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Unable to generate join code');
          setJoinCode(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, memberId, refreshIndex]);

  useEffect(() => {
    if (!open || !joinCode) {
      return;
    }
    const tick = () => setRemaining(computeRemaining(joinCode.expTs));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [open, joinCode]);

  const bindUrl = useMemo(() => {
    if (!joinCode) {
      return undefined;
    }
    const url = new URL(`${API}/watch/bind`);
    url.searchParams.set('code', joinCode.code);
    return url.toString();
  }, [joinCode]);

  if (!open || !WATCH_FEATURE_ENABLED) {
    return null;
  }

  const disabled = !memberId || status === 'loading';

  const requestNewCode = () => {
    if (status === 'loading') {
      return;
    }
    setRefreshIndex((value) => value + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900/95 p-5 text-slate-100 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Pair Watch</h2>
            <p className="text-xs text-slate-400">Generate a short-lived code and bind your watch via phone bridge.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {!memberId ? (
          <div className="mt-4 rounded border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
            Assign a member ID to your session to enable watch pairing.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Join code</div>
                  <div className="mt-1 text-3xl font-mono tracking-widest text-emerald-300">
                    {joinCode ? joinCode.code : status === 'loading' ? '••••••' : '------'}
                  </div>
                </div>
                {joinCode && bindUrl ? <QrPlaceholder code={joinCode.code} url={bindUrl} /> : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <div>
                  Expires in <span className="font-semibold text-slate-200">{remaining}s</span>
                </div>
                <button
                  type="button"
                  onClick={requestNewCode}
                  className="rounded border border-slate-700 px-2 py-1 text-xs font-semibold text-emerald-300 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={disabled}
                >
                  Generate new code
                </button>
              </div>
              {bindUrl ? (
                <div className="mt-3 text-xs text-slate-400">
                  QR fallback URL:{' '}
                  <a href={bindUrl} className="text-emerald-300 underline" target="_blank" rel="noreferrer">
                    {bindUrl}
                  </a>
                </div>
              ) : null}
              {error ? <div className="mt-2 text-xs text-rose-400">Error: {error}</div> : null}
            </div>

            {import.meta.env.DEV ? (
              <DevWatchSimulator joinCode={joinCode?.code} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

type QrPlaceholderProps = {
  code: string;
  url: string;
};

function QrPlaceholder({ code, url }: QrPlaceholderProps): JSX.Element {
  const size = 9;
  const pattern = buildPattern(code, size * size);
  return (
    <div className="flex flex-col items-center gap-2 text-xs text-slate-400">
      <div className="grid grid-cols-9 gap-0.5 rounded bg-white p-2 shadow-inner" aria-hidden>
        {pattern.map((filled, index) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={`h-2 w-2 ${filled ? 'bg-slate-900' : 'bg-white'}`}
          />
        ))}
      </div>
      <span className="text-[10px] uppercase tracking-wide text-slate-500">QR placeholder</span>
      <a href={url} className="text-emerald-300 underline" target="_blank" rel="noreferrer">
        {new URL(url).pathname}?code={code}
      </a>
    </div>
  );
}

function buildPattern(code: string, total: number): boolean[] {
  if (!code) {
    return Array.from({ length: total }, (_, index) => index % 2 === 0);
  }
  const digits = Array.from(code).map((ch) => ch.charCodeAt(0));
  return Array.from({ length: total }, (_, index) => {
    const value = digits[index % digits.length] + index * 7;
    return (value & 1) === 0;
  });
}

export type { PairWatchDialogProps };
