declare module 'expo-device' {
  const mod: any;
  export = mod;
}

declare module 'expo-application' {
  const mod: any;
  export = mod;
}

declare module 'expo-battery' {
  const mod: any;
  export = mod;
}

declare module 'expo-file-system' {
  const mod: any;
  export = mod;
}

declare module 'expo-location' {
  const mod: any;
  export = mod;
}

declare module 'expo-network' {
  const mod: any;
  export = mod;
}

declare module '@react-native-async-storage/async-storage' {
  const mod: any;
  export = mod;
}

declare module 'expo-camera' {
  export const Camera: any;
  export function useCameraPermissions(): [permission: any, request: () => Promise<any>];
}
