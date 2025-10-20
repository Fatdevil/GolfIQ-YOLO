declare module 'expo-location' {
  export type PermissionStatus = 'undetermined' | 'denied' | 'granted' | 'restricted';

  export type PermissionResponse = {
    status: PermissionStatus;
    granted?: boolean;
    expires?: number | 'never';
    canAskAgain?: boolean;
  };

  export enum Accuracy {
    Lowest = 1,
    Low = 2,
    Balanced = 3,
    High = 4,
    Highest = 5,
    BestForNavigation = 6,
  }

  export type LocationOptions = {
    accuracy?: Accuracy;
    maximumAge?: number;
    timeout?: number;
  };

  export type LocationObject = {
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      altitude?: number | null;
      heading?: number | null;
      speed?: number | null;
    };
    timestamp: number;
  };

  export function requestForegroundPermissionsAsync(): Promise<PermissionResponse>;

  export function getCurrentPositionAsync(options?: LocationOptions): Promise<LocationObject>;
}
