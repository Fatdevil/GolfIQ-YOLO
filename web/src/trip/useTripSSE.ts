import { useEffect, useState } from "react";
import type { TripRound } from "./types";

export function useTripSSE(url: string | null) {
  const [data, setData] = useState<TripRound | null>(null);

  useEffect(() => {
    if (!url) {
      return undefined;
    }

    const source = new EventSource(url);

    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as TripRound;
        setData(parsed);
      } catch (error) {
        console.warn("Failed to parse trip SSE payload", error);
      }
    };

    source.onerror = () => {
      // keep component mounted even if stream errors
    };

    return () => {
      source.close();
    };
  }, [url]);

  return data;
}
