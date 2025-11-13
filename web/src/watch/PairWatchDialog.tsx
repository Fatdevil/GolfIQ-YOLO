import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const WATCH_FEATURE_ENABLED = import.meta.env.VITE_FEATURE_WATCH === '1' || import.meta.env.DEV;
type FetchState = 'idle' | 'loading' | 'error';

function computeRemaining(expTs: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, expTs - now);
}

export default function PairWatchDialog({ open, onClose, memberId }: PairWatchDialogProps): JSX.Element | null {
  const [code, setCode] = useState<string | null>(null);
  const [expTs, setExpTs] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [status, setStatus] = useState<FetchState>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadCode = useCallback(async () => {
    if (!memberId) {
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus('loading');
    setError(null);

    try {
      const url = new URL(`${API}/api/watch/pair/code`);
      url.searchParams.set('memberId', memberId);
      const apiKey = getApiKey();
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: apiKey
          ? { 'x-api-key': apiKey, 'content-type': 'application/json' }
          : { 'content-type': 'application/json' },
        signal: ctrl.signal,
      });
      if (!response.ok) {
        throw new Error(`pair code ${response.status}`);
      }
      const payload = (await response.json()) as JoinCodeResponse;
      setCode(payload.code);
      setExpTs(payload.expTs);
      setRemaining(computeRemaining(payload.expTs));
      setStatus('idle');
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to generate join code');
      setCode(null);
      setExpTs(null);
      setRemaining(0);
    }
  }, [memberId]);

  useEffect(() => {
    if (!open || !memberId || !WATCH_FEATURE_ENABLED) {
      setCode(null);
      setExpTs(null);
      setRemaining(0);
      setStatus('idle');
      setError(null);
      abortRef.current?.abort();
      return;
    }

    loadCode().catch(() => {});

    return () => {
      abortRef.current?.abort();
    };
  }, [open, memberId, loadCode]);

  useEffect(() => {
    if (!expTs) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemaining(computeRemaining(expTs));
    }, 1_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [expTs]);

  const bindUrl = useMemo(() => {
    if (!code) {
      return undefined;
    }
    const url = new URL(`${API}/watch/bind`);
    url.searchParams.set('code', code);
    return url.toString();
  }, [code]);

  if (!open || !WATCH_FEATURE_ENABLED) {
    return null;
  }

  const disabled = !memberId || status === 'loading';

  const handleRegenerate = () => {
    if (disabled) {
      return;
    }
    loadCode().catch(() => {});
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
                  <div
                    className="mt-1 text-3xl font-mono tracking-widest text-emerald-300"
                    data-testid="join-code"
                  >
                    {code ? code : status === 'loading' ? '••••••' : '------'}
                  </div>
                </div>
                {code && bindUrl ? <QrPlaceholder code={code} url={bindUrl} /> : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <div>
                  Expires in <span className="font-semibold text-slate-200">{remaining}s</span>
                </div>
                <button
                  type="button"
                  aria-label="Generate new code"
                  onClick={handleRegenerate}
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
              <DevWatchSimulator joinCode={code ?? undefined} />
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
