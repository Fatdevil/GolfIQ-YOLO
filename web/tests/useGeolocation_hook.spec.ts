import { renderHook } from "@testing-library/react";
import { JSDOM } from "jsdom";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { useGeolocation } from "../src/hooks/useGeolocation";

describe("useGeolocation", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const originalWindow = (globalThis as { window?: Window }).window;
  const originalDocument = (globalThis as { document?: Document }).document;
  const originalNavigator = (globalThis as { navigator?: Navigator }).navigator;

  beforeAll(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: dom.window as unknown as Window,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: dom.window.document,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: dom.window.navigator,
    });
  });

  afterAll(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      delete (globalThis as { window?: Window }).window;
    }

    if (originalDocument) {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    } else {
      delete (globalThis as { document?: Document }).document;
    }

    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
    } else {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
  });

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
    if (navigatorBeforeEach) {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: navigatorBeforeEach,
      });
    } else {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
    vi.restoreAllMocks();
  });

  it("watches position when enabled", () => {
    const { result, unmount } = renderHook(() => useGeolocation(true));

    expect(watchPositionMock).toHaveBeenCalledTimes(1);
    expect(result.current.position).toEqual({ lat: 10, lon: 20 });

    unmount();

    expect(clearWatchMock).toHaveBeenCalledWith(42);
  });

  it("does not register watcher when disabled", () => {
    renderHook(() => useGeolocation(false));

    expect(watchPositionMock).not.toHaveBeenCalled();
    expect(clearWatchMock).not.toHaveBeenCalled();
  });
});
