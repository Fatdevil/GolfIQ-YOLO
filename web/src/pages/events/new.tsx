import { FormEvent, useState } from 'react';

import { postCreateEvent, type CreateEventBody, type CreateEventResponse } from '@web/api';
import { emitEventsCreate } from '@shared/events/telemetry';
import type { UUID } from '@shared/events/types';

export default function CreateEventPage(): JSX.Element {
  const [form, setForm] = useState<CreateEventBody>({ name: '', emoji: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateEventResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    const payload: CreateEventBody = {
      name: form.name.trim(),
      emoji: form.emoji?.trim() ? form.emoji.trim() : undefined,
    };
    if (!payload.name) {
      setError('Event name is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await postCreateEvent(payload);
      setResult(response);
      emitEventsCreate({ eventId: response.id as UUID, code: response.code });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create event';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!result?.joinUrl) return;
    try {
      await navigator.clipboard.writeText(result.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Copy failed';
      setError(message);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Create Event</h1>
        <p className="mt-2 text-sm text-slate-300">
          Name your event and optionally choose an emoji. Share the QR code or join link with
          players.
        </p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg bg-slate-900 p-6 shadow">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Event name
          <input
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-100 focus:border-teal-400 focus:outline-none"
            value={form.name}
            onChange={(e) => setForm((prev: CreateEventBody) => ({ ...prev, name: e.target.value }))}
            placeholder="Club Championship"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Emoji (optional)
          <input
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-100 focus:border-teal-400 focus:outline-none"
            value={form.emoji ?? ''}
            maxLength={4}
            onChange={(e) => setForm((prev: CreateEventBody) => ({ ...prev, emoji: e.target.value }))}
            placeholder="🏆"
          />
        </label>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded bg-teal-500 px-4 py-2 text-base font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
        >
          {loading ? 'Creating…' : 'Create event'}
        </button>
      </form>
      {result && (
        <section className="rounded-lg bg-slate-900 p-6 shadow">
          <h2 className="text-2xl font-semibold">Share with players</h2>
          <div className="mt-4 flex flex-col items-center gap-4">
            <div
              className="rounded-lg bg-white p-4 text-slate-900"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: result.qrSvg }}
            />
            <p className="text-sm text-slate-300">Join code: {result.code}</p>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center justify-center rounded border border-teal-400 px-3 py-2 text-sm font-semibold text-teal-300 transition hover:bg-teal-400 hover:text-slate-950"
            >
              {copied ? 'Link copied!' : 'Copy join link'}
            </button>
            <p className="break-all text-center text-xs text-slate-400">{result.joinUrl}</p>
          </div>
        </section>
      )}
    </div>
  );
}
