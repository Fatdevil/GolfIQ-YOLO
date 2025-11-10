import { createContext, useContext, type ReactNode } from 'react';

export type EventRole = 'admin' | 'host' | 'player' | 'spectator';

export type EventSession = {
  role: EventRole;
  memberId?: string | null;
  tournamentSafe?: boolean;
  coachMode?: boolean;
};

const defaultSession: EventSession = {
  role: 'spectator',
  memberId: null,
  tournamentSafe: false,
  coachMode: false,
};

const EventSessionContext = createContext<EventSession>(defaultSession);

export type EventSessionProviderProps = {
  value?: EventSession;
  children: ReactNode;
};

export function EventSessionProvider({ value, children }: EventSessionProviderProps): JSX.Element {
  return <EventSessionContext.Provider value={value ?? defaultSession}>{children}</EventSessionContext.Provider>;
}

export function useEventSession(): EventSession {
  return useContext(EventSessionContext);
}
