export interface SpeakOpts {
  text: string;
  lang: 'sv-SE' | 'en-US';
  rate?: number;
  pitch?: number;
  queue?: boolean;
}

export type SpeakVoiceInfo = { name: string; lang: string };

const DEFAULT_RATE: Record<SpeakOpts['lang'], number> = {
  'sv-SE': 0.95,
  'en-US': 1.0,
};
const DEFAULT_PITCH = 1.0;
const RATE_MIN = 0.2;
const RATE_MAX = 2.0;
const PITCH_MIN = 0.5;
const PITCH_MAX = 2.0;

const VOICE_EVENT_TIMEOUT_MS = 500;

const EXPO_SPEECH_GLOBAL_KEY = '__EXPO_SPEECH__';

type SpeechSynthesisVoiceLike = { name: string; lang: string };

type SpeechEventListener = (event: unknown) => void;

type SpeechSynthesisUtteranceLike = {
  lang: string;
  rate: number;
  pitch: number;
  text: string;
  onend: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
};

type SpeechSynthesisLike = {
  speak(utterance: SpeechSynthesisUtteranceLike): void;
  cancel(): void;
  getVoices?: () => SpeechSynthesisVoiceLike[];
  addEventListener?: (type: 'voiceschanged', listener: SpeechEventListener) => void;
  removeEventListener?: (type: 'voiceschanged', listener: SpeechEventListener) => void;
  onvoiceschanged?: (() => void) | null;
};

type ExpoSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (error: unknown) => void;
};

type ExpoSpeechModule = {
  speak(text: string, options?: ExpoSpeechOptions): void;
  stop?: () => void;
  getAvailableVoicesAsync?: () => Promise<ReadonlyArray<{ name?: string; identifier?: string; language?: string }>>;
};

let expoSpeechPromise: Promise<ExpoSpeechModule | null> | null = null;

let currentWebUtterance: SpeechSynthesisUtteranceLike | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveRate(opts: SpeakOpts): number {
  const base = DEFAULT_RATE[opts.lang] ?? DEFAULT_RATE['en-US'];
  if (typeof opts.rate === 'number' && Number.isFinite(opts.rate)) {
    return clamp(opts.rate, RATE_MIN, RATE_MAX);
  }
  return base;
}

function resolvePitch(opts: SpeakOpts): number {
  if (typeof opts.pitch === 'number' && Number.isFinite(opts.pitch)) {
    return clamp(opts.pitch, PITCH_MIN, PITCH_MAX);
  }
  return DEFAULT_PITCH;
}

function isReactNative(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

function isWebSpeechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { speechSynthesis?: unknown }).speechSynthesis !== 'undefined'
  );
}

async function loadExpoSpeech(): Promise<ExpoSpeechModule | null> {
  if (expoSpeechPromise) {
    return expoSpeechPromise;
  }
  expoSpeechPromise = (async () => {
    try {
      const globalCandidate = (globalThis as Record<string, unknown>)[EXPO_SPEECH_GLOBAL_KEY];
      if (globalCandidate && typeof globalCandidate === 'object') {
        return globalCandidate as ExpoSpeechModule;
      }
      const mod = await import('expo-speech');
      const resolved =
        mod && typeof mod === 'object' && 'default' in mod ? (mod.default as ExpoSpeechModule) : (mod as ExpoSpeechModule);
      if (resolved && typeof resolved.speak === 'function') {
        return resolved;
      }
    } catch (error) {
      // ignore module resolution issues
    }
    return null;
  })();
  return expoSpeechPromise;
}

export async function speak(opts: SpeakOpts): Promise<void> {
  const text = typeof opts.text === 'string' ? opts.text.trim() : '';
  if (!text) {
    return;
  }
  const rate = resolveRate(opts);
  const pitch = resolvePitch(opts);
  const queue = opts.queue === true;

  if (isReactNative()) {
    const speech = await loadExpoSpeech();
    if (!speech) {
      return;
    }
    if (!queue) {
      try {
        speech.stop?.();
      } catch (error) {
        // ignore stop failures
      }
    }
    await new Promise<void>((resolve) => {
      try {
        speech.speak(text, {
          language: opts.lang,
          rate,
          pitch,
          onDone: resolve,
          onStopped: resolve,
          onError: () => resolve(),
        });
      } catch (error) {
        resolve();
      }
    });
    return;
  }

  if (isWebSpeechAvailable()) {
    const synth = window.speechSynthesis as unknown as SpeechSynthesisLike;
    if (!queue) {
      try {
        synth.cancel();
      } catch (error) {
        // ignore cancel issues
      }
    }
    const UtteranceCtor = (window as unknown as {
      SpeechSynthesisUtterance?: new (text: string) => SpeechSynthesisUtteranceLike;
    }).SpeechSynthesisUtterance;
    if (typeof UtteranceCtor !== 'function') {
      return;
    }
    const utterance = new UtteranceCtor(text);
    utterance.lang = opts.lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    currentWebUtterance = utterance;
    await new Promise<void>((resolve) => {
      utterance.onend = () => {
        currentWebUtterance = null;
        resolve();
      };
      utterance.onerror = () => {
        currentWebUtterance = null;
        resolve();
      };
      try {
        synth.speak(utterance);
      } catch (error) {
        currentWebUtterance = null;
        resolve();
      }
    });
    return;
  }
}

export function stop(): void {
  if (isReactNative()) {
    void loadExpoSpeech().then((speech) => {
      try {
        speech?.stop?.();
      } catch (error) {
        // ignore stop failures
      }
    });
    return;
  }
  if (isWebSpeechAvailable()) {
    try {
      (window.speechSynthesis as unknown as SpeechSynthesisLike).cancel();
    } catch (error) {
      // ignore cancel issues
    }
    currentWebUtterance = null;
  }
}

export async function getVoices(lang?: string): Promise<SpeakVoiceInfo[]> {
  if (isReactNative()) {
    const speech = await loadExpoSpeech();
    if (!speech || typeof speech.getAvailableVoicesAsync !== 'function') {
      return [];
    }
    try {
      const voices = await speech.getAvailableVoicesAsync();
      const normalized = (voices ?? [])
        .map((voice) => ({
          name: voice.name ?? voice.identifier ?? 'Unknown',
          lang: voice.language ?? '',
        }))
        .filter((voice) => voice.lang);
      return lang ? normalized.filter((voice) => voice.lang === lang) : normalized;
    } catch (error) {
      return [];
    }
  }

  if (isWebSpeechAvailable()) {
    return await new Promise<SpeakVoiceInfo[]>((resolve) => {
      const synth = window.speechSynthesis as unknown as SpeechSynthesisLike;
      const finish = () => {
        try {
          const list = synth.getVoices?.() ?? [];
          const normalized = list.map((voice) => ({ name: voice.name, lang: voice.lang })).filter((voice) => voice.lang);
          resolve(lang ? normalized.filter((voice) => voice.lang === lang) : normalized);
        } catch (error) {
          resolve([]);
        }
      };
      const existing = synth.getVoices?.() ?? [];
      if (existing.length > 0) {
        finish();
        return;
      }
      let settled = false;
      const handler = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        finish();
      };
      const cleanup = () => {
        if (typeof synth.removeEventListener === 'function') {
          synth.removeEventListener('voiceschanged', handler as SpeechEventListener);
        } else if ('onvoiceschanged' in synth) {
          synth.onvoiceschanged = null;
        }
      };
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', handler as SpeechEventListener);
      } else if ('onvoiceschanged' in synth) {
        synth.onvoiceschanged = handler;
      }
      setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        finish();
      }, VOICE_EVENT_TIMEOUT_MS);
    });
  }

  return [];
}
