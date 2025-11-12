import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';

import { measureStart } from '@web/metrics/playerTiming';
import {
  emitLiveViewEnd,
  emitLiveViewError,
  emitLiveViewReconnect,
  emitLiveViewStart,
} from '@web/metrics/liveTelemetry';
import { buildHlsConfig } from '@web/player/hlsConfig';

import { getLiveState, type LiveStateResponse } from './api';

export type LiveViewerOpts = {
  pollMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  stallThresholdMs?: number;
};
export type LiveStatus = 'connecting' | 'playing' | 'reconnecting' | 'offline' | 'error';

const HLS_MIME = 'application/vnd.apple.mpegurl';
const DEFAULT_STALL_THRESHOLD_MS = 3000;
const MAX_BACKOFF_MS = 8000;

const INITIAL_STATE: LiveViewerState = {
  status: 'connecting',
  error: null,
  viewerUrl: null,
  attempts: 0,
  playStartMs: null,
  streamId: null,
  latencyMode: null,
};

type LiveViewerState = {
  status: LiveStatus;
  error: string | null;
  viewerUrl: string | null;
  attempts: number;
  playStartMs: number | null;
  streamId: string | null;
  latencyMode: string | null;
};

type UseLiveViewerResult = LiveViewerState & {
  start: (video: HTMLVideoElement | null) => void;
  stop: () => void;
};

type HlsInstance = import('hls.js').default;
type HlsErrorData = import('hls.js').ErrorData;

export function useLiveViewer(eventId: string, opts: LiveViewerOpts = {}): UseLiveViewerResult {
  const pollMs = Math.max(1000, opts.pollMs ?? 5000);
  const maxRetries = Math.max(0, opts.maxRetries ?? 3);
  const baseBackoffMs = Math.max(100, opts.baseBackoffMs ?? 800);
  const stallThresholdMs = Math.max(0, opts.stallThresholdMs ?? DEFAULT_STALL_THRESHOLD_MS);

  const [state, setState] = useState<LiveViewerState>({ ...INITIAL_STATE });
  const stateRef = useRef<LiveViewerState>({ ...INITIAL_STATE });
  const viewerUrlRef = useRef<string | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const fetchTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const measureCleanupRef = useRef<(() => void) | null>(null);
  const loadTokenRef = useRef<symbol | null>(null);
  const attemptsRef = useRef(0);
  const viewStartedRef = useRef(false);
  const viewStartClockRef = useRef<number | null>(null);
  const hasEmittedStartRef = useRef(false);
  const stallRecoveredRef = useRef(false);
  const currentSourceRef = useRef<string | null>(null);
  const fetchStateRef = useRef<() => Promise<LiveStateResponse | null>>();
  const loadSourceRef = useRef<((src: string) => Promise<void>) | null>(null);
  const eventIdRef = useRef(eventId);

  eventIdRef.current = eventId;

  const updateState = useCallback((updater: (prev: LiveViewerState) => LiveViewerState) => {
    setState((prev) => {
      const next = updater(prev);
      stateRef.current = next;
      viewerUrlRef.current = next.viewerUrl;
      streamIdRef.current = next.streamId;
      return next;
    });
  }, []);

  const clearTimer = useCallback((ref: MutableRefObject<number | null>) => {
    if (ref.current) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const cleanupMeasurement = useCallback(() => {
    if (measureCleanupRef.current) {
      measureCleanupRef.current();
      measureCleanupRef.current = null;
    }
  }, []);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const resetVideoSource = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    try {
      video.pause();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[live/viewer] pause failed', error);
      }
    }
    video.removeAttribute('src');
    video.load();
  }, []);

  const emitEndIfNeeded = useCallback(() => {
    if (!viewStartedRef.current) {
      return;
    }
    viewStartedRef.current = false;
    const startedAt = viewStartClockRef.current;
    viewStartClockRef.current = null;
    const now = performance.now();
    const durMs = Math.max(0, Math.round(now - (startedAt ?? now)));
    void emitLiveViewEnd({ eventId: eventIdRef.current, dur_ms: durMs });
  }, []);

  const teardownPlayback = useCallback(
    (emitEnd: boolean) => {
      clearTimer(stallTimerRef);
      clearTimer(reconnectTimerRef);
      cleanupMeasurement();
      destroyHls();
      resetVideoSource();
      currentSourceRef.current = null;
      stallRecoveredRef.current = false;
      attemptsRef.current = 0;
      hasEmittedStartRef.current = false;
      if (emitEnd) {
        emitEndIfNeeded();
      } else {
        viewStartedRef.current = false;
        viewStartClockRef.current = null;
      }
    },
    [cleanupMeasurement, clearTimer, destroyHls, emitEndIfNeeded, resetVideoSource],
  );

  const handleFatalError = useCallback(
    (code: string, details: string) => {
      teardownPlayback(true);
      updateState((prev) => ({
        ...prev,
        status: 'error',
        error: details,
        viewerUrl: null,
        attempts: attemptsRef.current,
      }));
      void emitLiveViewError({ eventId: eventIdRef.current, code, details });
    },
    [teardownPlayback, updateState],
  );

  const scheduleReconnect = useCallback(
    (reason: string, refreshManifest: boolean) => {
      if (!eventIdRef.current) {
        return;
      }
      const nextAttempt = attemptsRef.current + 1;
      if (nextAttempt > maxRetries) {
        handleFatalError('retries_exhausted', reason);
        return;
      }
      attemptsRef.current = nextAttempt;
      updateState((prev) => ({
        ...prev,
        status: 'reconnecting',
        attempts: nextAttempt,
        error: null,
      }));
      void emitLiveViewReconnect({ eventId: eventIdRef.current, attempt: nextAttempt, reason });
      const delay = Math.min(MAX_BACKOFF_MS, Math.round(baseBackoffMs * 2 ** (nextAttempt - 1)));
      clearTimer(reconnectTimerRef);
      reconnectTimerRef.current = window.setTimeout(async () => {
        reconnectTimerRef.current = null;
        if (refreshManifest && fetchStateRef.current) {
          await fetchStateRef.current();
        }
        const src = viewerUrlRef.current;
        const loader = loadSourceRef.current;
        if (src && loader) {
          await loader(src);
        }
      }, delay);
    },
    [baseBackoffMs, clearTimer, handleFatalError, maxRetries, updateState],
  );

  const onVideoPlaying = useCallback(() => {
    clearTimer(stallTimerRef);
    stallRecoveredRef.current = false;
    attemptsRef.current = 0;
    updateState((prev) => ({
      ...prev,
      status: 'playing',
      error: null,
      attempts: 0,
    }));
    if (!viewStartedRef.current) {
      viewStartedRef.current = true;
      viewStartClockRef.current = performance.now();
    }
  }, [clearTimer, updateState]);

  const onVideoWaiting = useCallback(() => {
    if (stallTimerRef.current) {
      return;
    }
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = null;
      if (hlsRef.current && !stallRecoveredRef.current) {
        stallRecoveredRef.current = true;
        try {
          hlsRef.current.recoverMediaError();
          return;
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('[live/viewer] recoverMediaError failed', error);
          }
        }
      }
      scheduleReconnect('stall_timeout', false);
    }, stallThresholdMs);
  }, [scheduleReconnect, stallThresholdMs]);

  const onVideoError = useCallback(() => {
    scheduleReconnect('video_error', true);
  }, [scheduleReconnect]);

  const detachVideoListeners = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.removeEventListener('playing', onVideoPlaying);
    video.removeEventListener('waiting', onVideoWaiting);
    video.removeEventListener('stalled', onVideoWaiting);
    video.removeEventListener('error', onVideoError);
  }, [onVideoError, onVideoPlaying, onVideoWaiting]);

  const attachVideoListeners = useCallback(
    (video: HTMLVideoElement) => {
      video.addEventListener('playing', onVideoPlaying);
      video.addEventListener('waiting', onVideoWaiting);
      video.addEventListener('stalled', onVideoWaiting);
      video.addEventListener('error', onVideoError);
    },
    [onVideoError, onVideoPlaying, onVideoWaiting],
  );

  const loadSource = useCallback(
    async (src: string) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      clearTimer(stallTimerRef);
      cleanupMeasurement();
      destroyHls();
      resetVideoSource();
      stallRecoveredRef.current = false;

      updateState((prev) => ({
        ...prev,
        status: prev.status === 'reconnecting' ? 'reconnecting' : 'connecting',
        error: null,
      }));

      const token = Symbol('load');
      loadTokenRef.current = token;
      currentSourceRef.current = src;

      const measureCleanup = measureStart(video, { live: true, src }, (timing) => {
        if (hasEmittedStartRef.current) {
          updateState((prev) => ({ ...prev, playStartMs: timing.play_start_ms }));
          return;
        }
        hasEmittedStartRef.current = true;
        updateState((prev) => ({ ...prev, playStartMs: timing.play_start_ms }));
        void emitLiveViewStart({
          eventId: eventIdRef.current,
          streamId: streamIdRef.current,
          play_start_ms: timing.play_start_ms,
        });
      });
      measureCleanupRef.current = measureCleanup;

      if (video.canPlayType(HLS_MIME)) {
        video.src = src;
        video.load();
        try {
          await video.play();
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('[live/viewer] autoplay prevented', error);
          }
        }
        return;
      }

      const { default: Hls, Events, ErrorDetails, ErrorTypes } = await import('hls.js');
      if (loadTokenRef.current !== token) {
        return;
      }
      if (!Hls.isSupported()) {
        video.src = src;
        video.load();
        try {
          await video.play();
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('[live/viewer] autoplay prevented', error);
          }
        }
        return;
      }

      const hls = new Hls(buildHlsConfig({ live: true }));
      hlsRef.current = hls;

      const onError = (_: unknown, data: HlsErrorData) => {
        if (data.fatal) {
          hls.off(Events.ERROR, onError);
          destroyHls();
          const responseCode = data.response?.code ?? 0;
          if (data.type === ErrorTypes.NETWORK_ERROR && data.details === ErrorDetails.MANIFEST_LOAD_ERROR) {
            scheduleReconnect('manifest_error', true);
            return;
          }
          if (responseCode === 403 || responseCode === 410) {
            scheduleReconnect('manifest_expired', true);
            return;
          }
          handleFatalError('hls_fatal', data.details ?? 'fatal error');
        } else if (data.type === ErrorTypes.NETWORK_ERROR) {
          scheduleReconnect('network_error', true);
        }
      };

      hls.on(Events.ERROR, onError);
      hls.attachMedia(video);
      hls.loadSource(src);
    },
    [cleanupMeasurement, destroyHls, handleFatalError, resetVideoSource, scheduleReconnect, updateState],
  );

  const handleLiveState = useCallback(
    (data: LiveStateResponse) => {
      if (!data.isLive) {
        teardownPlayback(true);
        attemptsRef.current = 0;
        hasEmittedStartRef.current = false;
        updateState((prev) => ({
          ...prev,
          status: 'offline',
          error: null,
          viewerUrl: null,
          streamId: data.streamId ?? null,
          latencyMode: data.latencyMode ?? null,
          attempts: 0,
        }));
        return;
      }

      updateState((prev) => ({
        ...prev,
        status: prev.status === 'offline' || prev.status === 'error' ? 'connecting' : prev.status,
        error: prev.status === 'error' ? null : prev.error,
        viewerUrl: data.viewerUrl ?? prev.viewerUrl,
        streamId: data.streamId ?? prev.streamId,
        latencyMode: data.latencyMode ?? prev.latencyMode,
        attempts: prev.status === 'reconnecting' ? prev.attempts : 0,
      }));

      if (data.viewerUrl && currentSourceRef.current !== data.viewerUrl && videoRef.current) {
        void loadSource(data.viewerUrl);
      }
    },
    [loadSource, teardownPlayback, updateState],
  );

  const fetchState = useCallback(async (): Promise<LiveStateResponse | null> => {
    if (!eventIdRef.current) {
      updateState(() => ({ ...INITIAL_STATE, status: 'offline', error: null }));
      return null;
    }
    try {
      const payload = await getLiveState(eventIdRef.current);
      handleLiveState(payload);
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'live_state_failed';
      updateState((prev) => ({
        ...prev,
        status: prev.status === 'playing' ? 'reconnecting' : 'error',
        error: message,
      }));
      return null;
    }
  }, [handleLiveState, updateState]);

  fetchStateRef.current = fetchState;

  const pollLiveState = useCallback(() => {
    clearTimer(fetchTimerRef);
    fetchState()
      .catch(() => undefined)
      .finally(() => {
        if (!eventIdRef.current) {
          return;
        }
        fetchTimerRef.current = window.setTimeout(pollLiveState, pollMs);
      });
  }, [clearTimer, fetchState, pollMs]);

  useEffect(() => {
    if (!eventId) {
      updateState(() => ({ ...INITIAL_STATE, status: 'offline', error: null }));
      teardownPlayback(false);
      return () => undefined;
    }
    updateState((prev) => ({ ...prev, status: 'connecting', error: null }));
    pollLiveState();
    return () => {
      clearTimer(fetchTimerRef);
    };
  }, [clearTimer, eventId, pollLiveState, teardownPlayback, updateState]);

  useEffect(() => {
    loadSourceRef.current = loadSource;
  }, [loadSource]);

  useEffect(() => () => {
    fetchStateRef.current = undefined;
  }, []);

  useEffect(() => {
    return () => {
      teardownPlayback(true);
      detachVideoListeners();
    };
  }, [detachVideoListeners, teardownPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    const src = state.viewerUrl;
    if (!video || !src) {
      return;
    }
    if (currentSourceRef.current === src) {
      return;
    }
    void loadSource(src);
  }, [loadSource, state.viewerUrl]);

  const start = useCallback(
    (video: HTMLVideoElement | null) => {
      if (videoRef.current === video) {
        return;
      }
      detachVideoListeners();
      videoRef.current = video;
      if (!video) {
        teardownPlayback(false);
        return;
      }
      attachVideoListeners(video);
      if (stateRef.current.viewerUrl) {
        void loadSource(stateRef.current.viewerUrl);
      }
    },
    [attachVideoListeners, detachVideoListeners, loadSource, teardownPlayback],
  );

  const stop = useCallback(() => {
    detachVideoListeners();
    videoRef.current = null;
    teardownPlayback(true);
  }, [detachVideoListeners, teardownPlayback]);

  return useMemo(
    () => ({
      ...state,
      start,
      stop,
    }),
    [start, state, stop],
  );
}
