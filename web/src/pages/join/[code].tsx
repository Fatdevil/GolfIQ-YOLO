import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { postJoinEvent } from '@web/api';
import { emitEventsJoin } from '@shared/events/telemetry';
import { normalizeCode, validateCode } from '@shared/events/code';
import type { UUID } from '@shared/events/types';
import { session } from '@web/features/events/session';

export default function JoinEventPage(): JSX.Element {
  const params = useParams<{ code?: string }>();
  const [inputCode, setInputCode] = useState(params.code ?? '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info');
  const [eventId, setEventId] = useState<string | null>(null);
  const memberRef = useRef<string>(session.generateMemberId());

  useEffect(() => {
    if (params.code) {
      setInputCode(params.code.toUpperCase());
    }
  }, [params.code]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    const trimmed = inputCode.trim().toUpperCase();
    if (!validateCode(trimmed)) {
      setMessage('Invalid join code');
      setMessageTone('error');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const normalized = normalizeCode(trimmed);
      const memberId = memberRef.current;
      const response = await postJoinEvent(normalized, { memberId });
      setEventId(response.eventId);
      setMessage('Joined as spectator – open the live leaderboard.');
      setMessageTone('info');
      session.setEventSession(response.eventId, { memberId, role: 'spectator' });
      emitEventsJoin({ eventId: response.eventId as UUID });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Unable to join event';
      setMessage(messageText);
      setMessageTone('error');
      setEventId(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Join Event</h1>
        <p className="mt-2 text-sm text-slate-300">
          Enter the 7-character event code to join as a spectator.
        </p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg bg-slate-900 p-6 shadow">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Event code
          <input
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-100 uppercase focus:border-teal-400 focus:outline-none"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            placeholder="ABC1234"
            maxLength={7}
          />
        </label>
        {message && (
          <p
            className={`text-sm ${messageTone === 'error' ? 'text-rose-300' : 'text-teal-300'}`}
          >
            {message}
          </p>
        )}
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded bg-teal-500 px-4 py-2 text-base font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
        >
          {loading ? 'Joining…' : 'Join event'}
        </button>
      </form>
      {eventId && (
        <div className="rounded-lg bg-slate-900 p-6 text-center shadow">
          <p className="text-sm text-slate-200">You're in!</p>
          <Link
            className="mt-4 inline-flex items-center justify-center rounded border border-teal-400 px-4 py-2 text-sm font-semibold text-teal-200 transition hover:bg-teal-400 hover:text-slate-950"
            to={`/events/${eventId}/live`}
          >
            Open live leaderboard
          </Link>
        </div>
      )}
    </div>
  );
}
