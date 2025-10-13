import { now } from "./clock";

declare const require: undefined | ((name: string) => unknown);

type PermissionStatus = { status?: string };

type CameraModule = {
  Camera?: {
    getCameraPermissionsAsync?: () => Promise<PermissionStatus>;
    requestCameraPermissionsAsync?: () => Promise<PermissionStatus>;
  };
};

async function ensureCameraPermission(): Promise<boolean> {
  if (typeof require === "undefined") {
    return true;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cameraModule = require("expo-camera") as CameraModule;
    const Camera = cameraModule?.Camera;
    if (!Camera) {
      return true;
    }
    if (Camera.getCameraPermissionsAsync) {
      const existing = await Camera.getCameraPermissionsAsync();
      if (existing?.status === "granted") {
        return true;
      }
    }
    if (Camera.requestCameraPermissionsAsync) {
      const request = await Camera.requestCameraPermissionsAsync();
      return request?.status === "granted";
    }
  } catch (err) {
    return true;
  }
  return true;
}

export interface CameraFrame {
  captureTs: number;
  latencyMs: number;
}

export interface CameraStubController {
  start: (onFrame: (frame: CameraFrame) => void) => Promise<void>;
  stop: () => void;
  isRunning: () => boolean;
  requestRecenter: () => Promise<number>;
}

export interface CameraStubOptions {
  fps?: number;
  latencyMs?: number;
  jitterMs?: number;
  recenterDurationMs?: number;
}

export function createCameraStub(options: CameraStubOptions = {}): CameraStubController {
  const fps = Math.max(1, options.fps ?? 30);
  const intervalMs = 1000 / fps;
  const baseLatency = options.latencyMs ?? 48;
  const jitter = Math.max(0, options.jitterMs ?? 10);
  const recenterDurationMs = Math.max(200, options.recenterDurationMs ?? 650);

  let running = false;
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  let recenterTimer: ReturnType<typeof setTimeout> | null = null;
  let onFrame: ((frame: CameraFrame) => void) | null = null;

  const emitFrame = () => {
    if (!running || !onFrame) {
      return;
    }
    const captureTs = now();
    const latencyNoise = (Math.random() - 0.5) * jitter * 2;
    const latencyMs = Math.max(0, baseLatency + latencyNoise);
    onFrame({ captureTs, latencyMs });
  };

  const start = async (callback: (frame: CameraFrame) => void) => {
    onFrame = callback;
    const permitted = await ensureCameraPermission();
    if (!permitted) {
      throw new Error("Camera permission denied");
    }
    if (running) {
      return;
    }
    running = true;
    emitFrame();
    frameTimer = setInterval(emitFrame, intervalMs);
  };

  const stop = () => {
    running = false;
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
    if (recenterTimer) {
      clearTimeout(recenterTimer);
      recenterTimer = null;
    }
  };

  const isRunning = () => running;

  const requestRecenter = async () => {
    if (!running) {
      return 0;
    }
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
    if (recenterTimer) {
      clearTimeout(recenterTimer);
    }
    const startTs = now();
    await new Promise<void>((resolve) => {
      recenterTimer = setTimeout(() => {
        recenterTimer = null;
        resolve();
      }, recenterDurationMs);
    });
    if (running && !frameTimer) {
      frameTimer = setInterval(emitFrame, intervalMs);
    }
    return now() - startTs;
  };

  return {
    start,
    stop,
    isRunning,
    requestRecenter,
  };
}
