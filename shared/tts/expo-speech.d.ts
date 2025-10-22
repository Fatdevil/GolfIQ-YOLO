declare module 'expo-speech' {
  export interface ExpoSpeechOptions {
    language?: string;
    rate?: number;
    pitch?: number;
    onDone?: () => void;
    onStopped?: () => void;
    onError?: (error: unknown) => void;
  }

  export interface ExpoSpeechVoice {
    identifier?: string;
    name?: string;
    language?: string;
  }

  export function speak(text: string, options?: ExpoSpeechOptions): void;
  export function stop(): void;
  export function getAvailableVoicesAsync(): Promise<ReadonlyArray<ExpoSpeechVoice>>;

  const ExpoSpeech: {
    speak: typeof speak;
    stop: typeof stop;
    getAvailableVoicesAsync: typeof getAvailableVoicesAsync;
  };

  export default ExpoSpeech;
}
