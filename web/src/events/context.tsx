import * as React from 'react';
import type { ReactNode } from 'react';

type EventMember = {
  id: string;
  name: string;
};

type EventRun = {
  memberId: string;
  runId: string;
};

type EventContextValue = {
  eventId: string;
  members: EventMember[];
  runs: EventRun[];
  isClipVisible?: (clipId: string) => boolean;
};

const DEFAULT_CONTEXT: EventContextValue = {
  eventId: '',
  members: [],
  runs: [],
  isClipVisible: undefined,
};

const EventContext = React.createContext<EventContextValue>(DEFAULT_CONTEXT);

export type { EventContextValue, EventMember, EventRun };

type EventContextProviderProps = {
  value: EventContextValue;
  children: ReactNode;
};

export function EventContextProvider({ value, children }: EventContextProviderProps): JSX.Element {
  const memoized = React.useMemo<EventContextValue>(
    () => ({
      eventId: value.eventId,
      members: value.members,
      runs: value.runs,
      isClipVisible: value.isClipVisible,
    }),
    [value.eventId, value.members, value.runs, value.isClipVisible],
  );

  return <EventContext.Provider value={memoized}>{children}</EventContext.Provider>;
}

export function useEventContext(): EventContextValue {
  return React.useContext(EventContext);
}
