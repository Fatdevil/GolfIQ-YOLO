declare module "hls.js" {
  export default class Hls {
    static isSupported(): boolean;
    constructor(options?: Record<string, unknown>);
    loadSource(source: string): void;
    attachMedia(media: HTMLMediaElement): void;
    destroy(): void;
  }
}
