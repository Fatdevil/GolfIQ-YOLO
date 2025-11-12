declare module 'hls.js' {
  export type ErrorData = {
    type: string;
    details?: string;
    fatal: boolean;
    response?: {
      code?: number;
    };
  };

  export default class Hls {
    static instances: Hls[];
    static isSupported(): boolean;
    constructor(config?: Record<string, unknown>);
    loadSource(source: string): void;
    attachMedia(element: HTMLVideoElement): void;
    destroy(): void;
    recoverMediaError(): void;
    on(event: string, handler: (event: string, data: ErrorData) => void): void;
    off(event: string, handler: (event: string, data: ErrorData) => void): void;
    emit(event: string, data: ErrorData): void;
  }

  export const Events: Record<string, string>;
  export const ErrorTypes: Record<string, string>;
  export const ErrorDetails: Record<string, string>;
}
