import { vi } from 'vitest';

export type ErrorData = {
  type: string;
  details?: string;
  fatal: boolean;
  response?: { code?: number };
};

type Handler = (event: string, data: ErrorData) => void;

export const Events = {
  ERROR: 'error',
};

export const ErrorTypes = {
  NETWORK_ERROR: 'networkError',
};

export const ErrorDetails = {
  MANIFEST_LOAD_ERROR: 'manifestLoadError',
};

export default class Hls {
  static instances: Hls[] = [];

  static isSupported(): boolean {
    return true;
  }

  private media: HTMLMediaElement | null = null;
  private lastSrc: string | null = null;

  private handlers: Record<string, Handler[]> = {};

  constructor(config?: Record<string, unknown>) {
    void config;
    Hls.instances.push(this);
  }

  loadSource = vi.fn((src: string) => {
    this.lastSrc = src;
    if (this.media) {
      this.media.setAttribute('src', src);
    }
  });
  attachMedia = vi.fn((media: HTMLMediaElement) => {
    this.media = media;
    if (this.lastSrc) {
      media.setAttribute('src', this.lastSrc);
    }
  });
  destroy = vi.fn(() => {
    if (this.media) {
      this.media.removeAttribute('src');
    }
    this.media = null;
    this.lastSrc = null;
  });
  recoverMediaError = vi.fn();

  on = vi.fn((event: string, handler: Handler) => {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event]?.push(handler);
  });

  off = vi.fn((event: string, handler: Handler) => {
    const list = this.handlers[event];
    if (!list) {
      return;
    }
    this.handlers[event] = list.filter((fn) => fn !== handler);
  });

  emit(event: string, data: ErrorData): void {
    for (const handler of this.handlers[event] ?? []) {
      handler(event, data);
    }
  }
}
