declare module "expo-device" {
  const device: Record<string, unknown>;
  export default device;
}

declare module "expo-constants" {
  const constants: Record<string, unknown>;
  export default constants;
}

declare module "expo-application" {
  const application: Record<string, unknown>;
  export default application;
}

declare module "react-native" {
  export const Platform: Record<string, unknown> | undefined;
}
