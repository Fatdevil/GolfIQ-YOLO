import { renderHook } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGeolocation } from "../src/hooks/useGeolocation";

describe("useGeolocation", () => {
  const originalNavigator = (globalThis as { navigator?: Navigator }).navigator;
  let navigatorBeforeEach: Navigator | undefined;
  let watchPositionMock: ReturnType<typeof vi.fn>;
  let clearWatchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigatorBeforeEach = (globalThis as { navigator?: Navigator }).navigator;
    watchPositionMock = vi.fn().mockImplementation((success: PositionCallback) => {
      success({
        coords: { latitude: 10, longitude: 20 },
      } as unknown as GeolocationPosition);
      return 42;
    });
    clearWatchMock = vi.fn();

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        ...(navigatorBeforeEach ?? {}),
        geolocation: {
          watchPosition: watchPositionMock,
          clearWatch: clearWatchMock,
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: navigatorBeforeEach ?? originalNavigator,
    });
    vi.restoreAllMocks();
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  });

  it("watches position when enabled", () => {
    const { result, unmount } = renderHook(() => useGeolocation(true));

    expect(watchPositionMock).toHaveBeenCalledTimes(1);
    expect(result.current.position).toEqual({ lat: 10, lon: 20 });
    expect(result.current.supported).toBe(true);

    unmount();

    expect(clearWatchMock).toHaveBeenCalledWith(42);
  });

  it("does not register watcher when disabled", () => {
    const { result } = renderHook(() => useGeolocation(false));

    expect(watchPositionMock).not.toHaveBeenCalled();
    expect(clearWatchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ position: null, error: null, supported: true });
  });
});
