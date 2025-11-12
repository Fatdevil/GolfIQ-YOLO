import * as React from 'react';

type TipConsoleProps = { memberId: string };

type TipEvent = {
  title: string;
  body: string;
};

export function TipConsole({ memberId }: TipConsoleProps) {
  const [items, setItems] = React.useState<TipEvent[]>([]);

  React.useEffect(() => {
    if (!memberId) {
      setItems([]);
      return () => undefined;
    }

    const source = new EventSource(`/api/watch/${memberId}/tips/stream`, {
      withCredentials: false,
    } as EventSourceInit);

    const handleTip = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as TipEvent;
        setItems((prev) => [payload, ...prev].slice(0, 50));
      } catch (error) {
        console.warn('Failed to parse tip event', error);
      }
    };

    source.addEventListener('tip', handleTip as EventListener);

    return () => {
      if (source.removeEventListener) {
        source.removeEventListener('tip', handleTip as EventListener);
      }
      source.close();
    };
  }, [memberId]);

  if (!memberId) {
    return null;
  }

  return (
    <div className="mt-2 border border-slate-800/60 bg-slate-900/40 p-2 text-slate-100">
      <div className="font-semibold">Watch Tips</div>
      <ul className="text-xs">
        {items.map((item, index) => (
          <li key={index}>
            {item.title} — {item.body}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TipConsole;
