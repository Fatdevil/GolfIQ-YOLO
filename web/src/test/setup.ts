import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// -------- Observers --------
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const globalAny = globalThis as any;
if (!globalAny.IntersectionObserver) {
  globalAny.IntersectionObserver = NoopObserver;
}
if (!globalAny.ResizeObserver) {
  globalAny.ResizeObserver = NoopObserver;
}

// -------- matchMedia --------
if (!globalAny.matchMedia) {
  globalAny.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

// -------- URL / MediaSource --------
if (typeof URL !== 'undefined' && !(URL as any).createObjectURL) {
  (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
}
if (!globalAny.MediaSource) {
  globalAny.MediaSource = class {
    addSourceBuffer() {
      return {};
    }
    endOfStream() {}
  };
}

// -------- HTMLMediaElement (video/audio) --------
const HTMLMediaProto = globalAny.HTMLMediaElement?.prototype;
if (HTMLMediaProto) {
  if (!HTMLMediaProto.play) {
    Object.defineProperty(HTMLMediaProto, 'play', {
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  }
  if (!HTMLMediaProto.pause) {
    Object.defineProperty(HTMLMediaProto, 'pause', {
      writable: true,
      value: vi.fn(),
    });
  }
  if (!HTMLMediaProto.load) {
    Object.defineProperty(HTMLMediaProto, 'load', {
      writable: true,
      value: vi.fn(),
    });
  }
  try {
    Object.defineProperty(HTMLMediaProto, 'muted', {
      configurable: true,
      writable: true,
      value: true,
    });
  } catch {}
  try {
    Object.defineProperty(HTMLMediaProto, 'currentTime', {
      configurable: true,
      writable: true,
      value: 0,
    });
  } catch {
    // ignore when jsdom defines a setter already
  }
}

// -------- Navigator bits used in tests --------
const navigatorAny = globalAny.navigator;
if (navigatorAny) {
  if (!navigatorAny.mediaSession) {
    navigatorAny.mediaSession = {
      setActionHandler: vi.fn(),
      metadata: null,
      playbackState: 'none',
    };
  }
  if (!navigatorAny.geolocation) {
    const mockGeolocation = {
      getCurrentPosition: vi.fn((ok: any) =>
        ok({ coords: { latitude: 0, longitude: 0, accuracy: 0 } }),
      ),
      watchPosition: vi.fn(() => 1),
      clearWatch: vi.fn(),
    };
    try {
      navigatorAny.geolocation = mockGeolocation;
    } catch {
      Object.defineProperty(navigatorAny, 'geolocation', {
        configurable: true,
        value: mockGeolocation,
      });
    }
  }
}

// -------- startViewTransition (some UIs call it) --------
if (typeof document !== 'undefined' && !(document as any).startViewTransition) {
  (document as any).startViewTransition = (fn?: () => void) => {
    fn?.();
    return { finished: Promise.resolve() };
  };
}

class MockEventSource {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    (globalAny as any).__es = this;
  }

  addEventListener(_event: string, handler: EventListener) {
    this.onmessage = handler as (event: MessageEvent) => void;
  }

  removeEventListener(_event: string, _handler: EventListener) {}

  close() {}
}

if (!globalAny.EventSource) {
  globalAny.EventSource = MockEventSource as unknown as typeof EventSource;
}
