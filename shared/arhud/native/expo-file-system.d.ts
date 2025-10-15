declare module 'expo-file-system' {
  export const documentDirectory: string | null | undefined;
  export function getInfoAsync(
    path: string,
  ): Promise<{ exists: boolean; isFile: boolean }>;
  export function readAsStringAsync(path: string): Promise<string>;
  export function writeAsStringAsync(path: string, contents: string): Promise<void>;
}
