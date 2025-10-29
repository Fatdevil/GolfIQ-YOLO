declare module 'expo-notifications' {
  export function requestPermissionsAsync(): Promise<unknown>;
  export function scheduleNotificationAsync(options: unknown): Promise<string>;
  export function cancelAllScheduledNotificationsAsync(): Promise<void>;
}
