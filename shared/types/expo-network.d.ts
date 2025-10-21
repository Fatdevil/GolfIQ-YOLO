declare module "expo-network" {
  export type NetworkState = {
    type?: string | null;
    isConnected: boolean | null;
    isInternetReachable?: boolean | null;
    details?: Record<string, unknown> | null;
  } | null;

  export type NetworkStateListener = (state: NetworkState) => void;

  export function getNetworkStateAsync(): Promise<NetworkState>;

  export function addNetworkStateListener(
    listener: NetworkStateListener,
  ): (() => void) | { remove?: () => void } | void;
}
