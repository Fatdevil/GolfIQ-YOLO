import axios from 'axios';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { API } from '../api';

export type EventRole = 'spectator' | 'admin';
export type EventSession = { role: EventRole; memberId: string | null; safe: boolean };

type EventSessionResponse = { role: EventRole; memberId?: string | null; safe?: boolean; ts: string };

const DEFAULT_SESSION: EventSession = { role: 'spectator', memberId: null, safe: false };

const API_KEY = import.meta.env.VITE_API_KEY || '';
const DEV_SESSION_FALLBACK_ENABLED = import.meta.env.VITE_DEV_SESSION_FALLBACK === 'true';

const buildHeaders = () => (API_KEY ? { 'x-api-key': API_KEY } : {});

export const EventSessionContext = createContext<EventSession>(DEFAULT_SESSION);
export const useEventSession = () => useContext(EventSessionContext);

function readMemberId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem('event.memberId');
  } catch (err) {
    console.warn('Unable to read event.memberId from storage', err);
    return null;
  }
}

function readDevAdminFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem('event.admin') === '1';
  } catch (err) {
    console.warn('Unable to read event.admin from storage', err);
    return false;
  }
}

export function bootstrapEventSession(): EventSession {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const admin = params.get('admin') === '1' || readDevAdminFlag();
  const memberId = readMemberId();
  return { role: admin ? 'admin' : 'spectator', memberId, safe: false };
}

export const fetchEventSession = async (
  eventId: string,
  memberId?: string | null,
): Promise<EventSession> => {
  const { data } = await axios.get<EventSessionResponse>(`${API}/events/${eventId}/session`, {
    headers: buildHeaders(),
    params: memberId ? { memberId } : undefined,
  });
  return {
    role: data.role,
    memberId: data.memberId ?? memberId ?? null,
    safe: Boolean(data.safe),
  };
};

type EventSessionProviderProps = { eventId?: string | null; children: ReactNode };

export function EventSessionProvider({ eventId, children }: EventSessionProviderProps): JSX.Element {
  const [session, setSession] = useState<EventSession>(() => {
    if (DEV_SESSION_FALLBACK_ENABLED) {
      return bootstrapEventSession();
    }
    return { ...DEFAULT_SESSION, memberId: readMemberId() };
  });

  useEffect(() => {
    let cancelled = false;
    const storedMemberId = readMemberId();

    if (!eventId) {
      if (DEV_SESSION_FALLBACK_ENABLED) {
        setSession(bootstrapEventSession());
      } else {
        setSession({ ...DEFAULT_SESSION, memberId: storedMemberId });
      }
      return () => {
        cancelled = true;
      };
    }

    fetchEventSession(eventId, storedMemberId)
      .then((next) => {
        if (!cancelled) {
          setSession(next);
        }
      })
      .catch((err) => {
        console.warn('Failed to load event session', err);
        if (cancelled) {
          return;
        }
        if (DEV_SESSION_FALLBACK_ENABLED) {
          setSession(bootstrapEventSession());
        } else {
          setSession({ ...DEFAULT_SESSION, memberId: storedMemberId });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return <EventSessionContext.Provider value={session}>{children}</EventSessionContext.Provider>;
}
