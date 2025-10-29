export type CameraModule = {
  Camera?: {
    lockExposureAsync?: () => Promise<void>;
    unlockExposureAsync?: () => Promise<void>;
    lockWhiteBalanceAsync?: () => Promise<void>;
    unlockWhiteBalanceAsync?: () => Promise<void>;
    setExposureModeAsync?: (mode: string) => Promise<void>;
    setWhiteBalanceAsync?: (mode: string) => Promise<void>;
    isExposureModeSupportedAsync?: (mode: string) => Promise<boolean>;
    isWhiteBalanceModeSupportedAsync?: (mode: string) => Promise<boolean>;
  };
};

type CameraModuleLike = CameraModule | null | undefined;

let moduleOverride: CameraModuleLike = undefined;
let modulePromise: Promise<CameraModuleLike> | null = null;

async function loadCameraModule(): Promise<CameraModuleLike> {
  if (moduleOverride !== undefined) {
    return moduleOverride;
  }
  if (modulePromise) {
    return modulePromise;
  }
  modulePromise = (async () => {
    try {
      const mod = await import('expo-camera');
      return (mod && typeof mod === 'object' ? (mod as CameraModule) : null) ?? null;
    } catch {
      return null;
    }
  })();
  return modulePromise;
}

async function withCamera<T>(
  handler: (camera: NonNullable<CameraModule['Camera']>) => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    const mod = await loadCameraModule();
    const camera = mod?.Camera;
    if (!camera) {
      return fallback;
    }
    return await handler(camera);
  } catch {
    return fallback;
  }
}

async function trySetExposureMode(camera: NonNullable<CameraModule['Camera']>, mode: string): Promise<boolean> {
  if (!camera.setExposureModeAsync) {
    return false;
  }
  if (camera.isExposureModeSupportedAsync) {
    try {
      const supported = await camera.isExposureModeSupportedAsync(mode);
      if (!supported) {
        return false;
      }
    } catch {
      // ignore feature detection failures
    }
  }
  try {
    await camera.setExposureModeAsync(mode);
    return true;
  } catch {
    return false;
  }
}

async function trySetWhiteBalance(camera: NonNullable<CameraModule['Camera']>, mode: string): Promise<boolean> {
  if (!camera.setWhiteBalanceAsync) {
    return false;
  }
  if (camera.isWhiteBalanceModeSupportedAsync) {
    try {
      const supported = await camera.isWhiteBalanceModeSupportedAsync(mode);
      if (!supported) {
        return false;
      }
    } catch {
      // ignore feature detection failures
    }
  }
  try {
    await camera.setWhiteBalanceAsync(mode);
    return true;
  } catch {
    return false;
  }
}

export async function lockExposure(): Promise<boolean> {
  return withCamera(async (camera) => {
    if (camera.lockExposureAsync) {
      try {
        await camera.lockExposureAsync();
        return true;
      } catch {
        // fall through to mode-based lock
      }
    }
    const modes = ['locked', 'custom', 'manual'];
    for (const mode of modes) {
      if (await trySetExposureMode(camera, mode)) {
        return true;
      }
    }
    return false;
  }, false);
}

export async function lockWhiteBalance(): Promise<boolean> {
  return withCamera(async (camera) => {
    if (camera.lockWhiteBalanceAsync) {
      try {
        await camera.lockWhiteBalanceAsync();
        return true;
      } catch {
        // fall back to mode-based lock
      }
    }
    const modes = ['locked', 'manual'];
    for (const mode of modes) {
      if (await trySetWhiteBalance(camera, mode)) {
        return true;
      }
    }
    return false;
  }, false);
}

export async function unlockAll(): Promise<boolean> {
  return withCamera(async (camera) => {
    let unlocked = false;
    if (camera.unlockExposureAsync) {
      try {
        await camera.unlockExposureAsync();
        unlocked = true;
      } catch {
        // ignore
      }
    }
    if (!unlocked) {
      const fallbackModes = ['continuous', 'auto'];
      for (const mode of fallbackModes) {
        if (await trySetExposureMode(camera, mode)) {
          unlocked = true;
          break;
        }
      }
    }
    let whiteBalanceUnlocked = false;
    if (camera.unlockWhiteBalanceAsync) {
      try {
        await camera.unlockWhiteBalanceAsync();
        whiteBalanceUnlocked = true;
      } catch {
        // ignore
      }
    }
    if (!whiteBalanceUnlocked) {
      const fallbackModes = ['auto'];
      for (const mode of fallbackModes) {
        if (await trySetWhiteBalance(camera, mode)) {
          whiteBalanceUnlocked = true;
          break;
        }
      }
    }
    return unlocked || whiteBalanceUnlocked;
  }, false);
}

export function __setCameraModuleForTests(module: CameraModuleLike): void {
  moduleOverride = module;
  modulePromise = module !== undefined ? Promise.resolve(module) : null;
}
