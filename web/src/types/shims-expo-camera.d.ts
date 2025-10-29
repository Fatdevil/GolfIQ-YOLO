declare module 'expo-camera' {
  export const Camera: {
    lockExposureAsync?: () => Promise<void>;
    unlockExposureAsync?: () => Promise<void>;
    lockWhiteBalanceAsync?: () => Promise<void>;
    unlockWhiteBalanceAsync?: () => Promise<void>;
    setExposureModeAsync?: (mode: string) => Promise<void>;
    setWhiteBalanceAsync?: (mode: string) => Promise<void>;
    isExposureModeSupportedAsync?: (mode: string) => Promise<boolean>;
    isWhiteBalanceModeSupportedAsync?: (mode: string) => Promise<boolean>;
  };
  export function requestCameraPermissionsAsync(): Promise<{ status: string }>;
}
