import { useEffect, useMemo, useRef, useState } from 'react';

import { API, getApiKey } from '@web/api';

type DevWatchSimulatorProps = {
  joinCode?: string | null;
};

type RegisterResponse = {
  deviceId: string;
  deviceSecret: string;
};

type BindResponse = {
  token: string;
  expTs: number;
};

type StreamTip = {
  tipId: string;
  title?: string;
  body?: string;
  club?: string | null;
  playsLike_m?: number | null;
  ts?: number | null;
};

type StreamEvent = { type: 'ping' | 'tip'; payload: unknown };

type AckState = { status: 'idle' | 'sending' | 'done' | 'error'; message?: string };

function buildHeaders(includeJson = false): HeadersInit {
  const headers: Record<string, string> = {};
  const apiKey = getApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export default function DevWatchSimulator({ joinCode }: DevWatchSimulatorProps): JSX.Element | null {
  const [device, setDevice] = useState<RegisterResponse | null>(null);
  const [codeInput, setCodeInput] = useState<string>('');
  const [token, setToken] = useState<string | null>(null);
  const [tokenExp, setTokenExp] = useState<number | null>(null);
  const [registering, setRegistering] = useState(false);
  const [binding, setBinding] = useState(false);
  const [ackState, setAckState] = useState<AckState>({ status: 'idle' });
  const [streamStatus, setStreamStatus] = useState<string>('idle');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [tips, setTips] = useState<StreamTip[]>([]);
  const sourceRef = useRef<EventSource | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const bindDisabled = !device || !codeInput.trim() || binding;

  useEffect(() => {
    if (!codeInput && joinCode) {
      setCodeInput(joinCode);
    }
  }, [joinCode, codeInput]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      sourceRef.current = null;
    };
  }, []);

  const tokenRemaining = useMemo(() => {
    if (!tokenExp) {
      return null;
    }
    return Math.max(0, tokenExp - Math.floor(Date.now() / 1000));
  }, [tokenExp]);

  const registerDevice = async () => {
    setRegistering(true);
    setToken(null);
    setTokenExp(null);
    setStreamStatus('idle');
    setEvents([]);
    setTips([]);
    cleanupRef.current?.();
    cleanupRef.current = null;
    sourceRef.current = null;

    try {
      const response = await fetch(`${API}/api/watch/devices/register`, {
        method: 'POST',
        headers: buildHeaders(),
      });
      if (!response.ok) {
        throw new Error(`register ${response.status}`);
      }
      const payload = (await response.json()) as RegisterResponse;
      setDevice(payload);
    } catch (error) {
      console.warn('[dev-watch] register failed', error);
      setDevice(null);
    } finally {
      setRegistering(false);
    }
  };

  const openStream = (newToken: string) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    const url = new URL(`${API}/api/watch/devices/stream`);
    url.searchParams.set('token', newToken);
    const source = new EventSource(url.toString());
    sourceRef.current = source;

    source.onopen = () => {
      setStreamStatus('connected');
    };
    source.onerror = () => {
      setStreamStatus('error');
    };

    const pingHandler = (event: MessageEvent) => {
      const entry: StreamEvent = { type: 'ping', payload: event.data };
      setEvents((prev) => [entry, ...prev].slice(0, 20));
    };
    const tipHandler = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as StreamTip;
        setTips((prev) => [payload, ...prev].slice(0, 5));
        const entry: StreamEvent = { type: 'tip', payload };
        setEvents((prev) => [entry, ...prev].slice(0, 20));
      } catch (err) {
        console.warn('[dev-watch] failed to parse tip event', err);
      }
    };

    source.addEventListener('ping', pingHandler);
    source.addEventListener('tip', tipHandler);
    cleanupRef.current = () => {
      source.removeEventListener('ping', pingHandler);
      source.removeEventListener('tip', tipHandler);
      source.close();
    };
  };

  const bindDevice = async () => {
    if (!device) {
      return;
    }
    setBinding(true);
    setAckState({ status: 'idle' });
    try {
      const response = await fetch(`${API}/api/watch/devices/bind`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({ deviceId: device.deviceId, code: codeInput.trim() }),
      });
      if (!response.ok) {
        throw new Error(`bind ${response.status}`);
      }
      const payload = (await response.json()) as BindResponse;
      setToken(payload.token);
      setTokenExp(payload.expTs);
      setStreamStatus('connecting');
      openStream(payload.token);
    } catch (error) {
      console.warn('[dev-watch] bind failed', error);
      setStreamStatus('error');
    } finally {
      setBinding(false);
    }
  };

  const acknowledgeTip = async (tipId: string) => {
    if (!token) {
      return;
    }
    setAckState({ status: 'sending' });
    try {
      const response = await fetch(`${API}/api/watch/devices/ack`, {
        method: 'POST',
        headers: { ...buildHeaders(true), Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipId }),
      });
      if (!response.ok) {
        throw new Error(`ack ${response.status}`);
      }
      setAckState({ status: 'done', message: `Acked ${tipId}` });
    } catch (error) {
      console.warn('[dev-watch] ack failed', error);
      setAckState({ status: 'error', message: 'Ack failed' });
    }
  };

  return (
    <div className="rounded border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-200">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-slate-100">Dev Watch Simulator</div>
        <button
          type="button"
          className="rounded border border-slate-700 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:border-emerald-400"
          onClick={registerDevice}
          disabled={registering}
        >
          {registering ? 'Registering…' : 'Register device'}
        </button>
      </div>

      {device ? (
        <div className="mt-3 grid gap-1 text-[11px] text-slate-400">
          <div>
            Device ID:{' '}
            <span className="font-mono text-slate-200">{device.deviceId}</span>
          </div>
          <div>
            Device secret:{' '}
            <span className="font-mono text-slate-200">{device.deviceSecret}</span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-slate-400">Register to obtain a deviceId + secret pair.</p>
      )}

      <div className="mt-4 space-y-2">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Join code
          <input
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
            placeholder="000000"
          />
        </label>
        <button
          type="button"
          className="w-full rounded border border-slate-700 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={bindDevice}
          disabled={bindDisabled}
        >
          {binding ? 'Binding…' : 'Bind with code'}
        </button>
      </div>

      {token ? (
        <div className="mt-4 grid gap-1 text-[11px] text-slate-400">
          <div>
            Token:{' '}
            <span className="break-all font-mono text-slate-100">{token}</span>
          </div>
          <div>Token expires in ~{tokenRemaining ?? '?'}s</div>
          <div>Stream status: {streamStatus}</div>
        </div>
      ) : null}

      {tips.length > 0 ? (
        <div className="mt-4 space-y-2">
          {tips.map((tip) => (
            <div key={tip.tipId} className="rounded border border-slate-800 bg-slate-900/80 p-2">
              <div className="text-[11px] font-semibold text-emerald-300">{tip.title ?? tip.tipId}</div>
              {tip.body ? <div className="mt-1 text-[11px] text-slate-200">{tip.body}</div> : null}
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Tip ID: {tip.tipId}</span>
                <button
                  type="button"
                  className="rounded border border-slate-700 px-2 py-1 text-[11px] font-semibold text-sky-300 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => acknowledgeTip(tip.tipId)}
                  disabled={ackState.status === 'sending'}
                >
                  {ackState.status === 'sending' ? 'Ack…' : 'Ack tip'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[11px] text-slate-500">Tips will appear here when published to the member.</p>
      )}

      <div className="mt-4 space-y-1 text-[11px] text-slate-500">
        <div className="font-semibold text-slate-400">Events</div>
        {events.length === 0 ? (
          <div>No events yet.</div>
        ) : (
          <ul className="space-y-1">
            {events.map((event, index) => (
              <li key={`${event.type}-${index}`} className="rounded bg-slate-900/70 px-2 py-1">
                <span className="font-semibold text-slate-300">{event.type}</span>: {JSON.stringify(event.payload)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {ackState.status !== 'idle' ? (
        <div
          className={`mt-3 text-[11px] ${
            ackState.status === 'error' ? 'text-rose-400' : 'text-emerald-300'
          }`}
        >
          {ackState.message}
        </div>
      ) : null}
    </div>
  );
}
