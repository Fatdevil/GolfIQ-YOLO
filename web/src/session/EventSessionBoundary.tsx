import { type ReactNode } from 'react';
import { useParams } from 'react-router-dom';

import { EventSessionProvider } from './eventSession';

type EventRouteParams = { id?: string };

type EventSessionBoundaryProps = { children: ReactNode };

export function EventSessionBoundary({ children }: EventSessionBoundaryProps): JSX.Element {
  const params = useParams<EventRouteParams>();
  const eventId = params.id ?? null;

  return <EventSessionProvider eventId={eventId}>{children}</EventSessionProvider>;
}

export default EventSessionBoundary;
