import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTripSSE } from "../src/trip/useTripSSE";
import type { TripRound } from "../src/trip/types";

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn(() => {
    this.closed = true;
  });
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe("useTripSSE", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects to stream and updates state on messages", () => {
    const trip: TripRound = {
      id: "trip_1",
      created_ts: 123,
      course_name: "Test",
      holes: 3,
      players: [],
      scores: [],
      public_token: null,
      course_id: null,
      tees_name: null,
    };

    const { result } = renderHook(
      ({ url }: { url: string | null }) => useTripSSE(url),
      {
        initialProps: { url: "http://example.com/stream" },
      }
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const source = MockEventSource.instances[0];
    expect(source.url).toBe("http://example.com/stream");

    act(() => {
      source.emit(trip);
    });

    expect(result.current).toEqual(trip);
  });

  it("closes stream when url changes to null", () => {
    const { rerender } = renderHook(
      ({ url }: { url: string | null }) => useTripSSE(url),
      {
        initialProps: { url: "http://example.com/stream" },
      }
    );

    const source = MockEventSource.instances[0];
    expect(source.close).not.toHaveBeenCalled();

    rerender({ url: null });

    expect(source.close).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
  });
});
