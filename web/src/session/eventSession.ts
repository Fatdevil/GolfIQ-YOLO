import { createContext, useContext } from 'react';

export type EventRole = 'spectator' | 'admin';
export type EventSession = { role: EventRole; memberId?: string | null };

export const EventSessionContext = createContext<EventSession>({ role: 'spectator', memberId: null });
export const useEventSession = () => useContext(EventSessionContext);

export function bootstrapEventSession(): EventSession {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const admin = params.get('admin') === '1' || localStorage.getItem('event.admin') === '1';
  const memberId = localStorage.getItem('event.memberId');
  return { role: admin ? 'admin' : 'spectator', memberId };
}
