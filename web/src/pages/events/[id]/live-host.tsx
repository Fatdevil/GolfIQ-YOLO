import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import HostLiveWizard from '@web/features/live/HostLiveWizard';
import { useLiveStatus } from '@web/features/live/useLiveStatus';
import { useEventSession } from '@web/session/eventSession';

export default function EventLiveHostPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const eventId = params.id ?? '';
  const session = useEventSession();
  const liveStatus = useLiveStatus(eventId, { pollMs: 5000 });

  const viewerCount = liveStatus.viewers ?? 0;
  const running = liveStatus.running === true;
  const startedAt = liveStatus.startedAt ? new Date(liveStatus.startedAt) : null;

  const statusLabel = useMemo(() => {
    if (!running) {
      return 'Live stream is stopped';
    }
    if (startedAt) {
      return `Live since ${startedAt.toLocaleTimeString()} · ${viewerCount} watching`;
    }
    return `Live stream running · ${viewerCount} watching`;
  }, [running, startedAt, viewerCount]);

  if (session.role !== 'admin') {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-3xl font-bold">Live Host</h1>
        <p className="text-sm text-slate-300">Admin access required to manage live streams.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Live Host Controls</h1>
        <p className="text-sm text-slate-300">{statusLabel}</p>
        {session.safe && (
          <p className="text-xs text-amber-300">Live controls are disabled in tournament safe mode.</p>
        )}
      </header>
      <HostLiveWizard eventId={eventId} />
    </div>
  );
}
