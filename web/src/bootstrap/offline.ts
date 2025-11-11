import { queuePollMs, uploadRetryMaxMs, uploadPresignVersion } from "../config";
import { OfflineQueue } from "../offline/Queue";
import { createScoreWorker } from "../offline/scoreWorker";
import { createUploadWorker } from "../offline/uploadWorker";

const queue = new OfflineQueue({
  maxBackoffMs: uploadRetryMaxMs,
});

queue.setHandler("upload", createUploadWorker({
  maxRetryMs: uploadRetryMaxMs,
  presignVersion: uploadPresignVersion,
}));
queue.setHandler("score", createScoreWorker());

let bootstrapped = false;

export function bootstrapOffline(): void {
  if (bootstrapped) {
    return;
  }
  bootstrapped = true;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const controller = new AbortController();

  const attemptDrain = () => {
    if (document.hidden) {
      return;
    }
    if (navigator.onLine === false) {
      queue.setOnline(false);
      return;
    }
    queue.setOnline(true);
    void queue.drain(controller.signal).catch((error) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[offline/bootstrap] drain failed", error);
      }
    });
  };

  const handleOnline = () => {
    queue.setOnline(true);
    attemptDrain();
  };

  const handleOffline = () => {
    queue.setOnline(false);
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", attemptDrain);

  const pollMs = Number.isFinite(queuePollMs) ? Math.max(1_000, queuePollMs) : 10_000;
  const interval = window.setInterval(attemptDrain, pollMs);

  attemptDrain();

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      controller.abort();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", attemptDrain);
      window.clearInterval(interval);
    });
  }
}

export function getOfflineQueue(): OfflineQueue {
  return queue;
}

