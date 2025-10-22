import assert from 'node:assert/strict';
import test from 'node:test';

import { getVoices, speak, stop } from '../../../shared/tts/speak';

type ExpoSpeakCall = { text: string; options?: Record<string, unknown> };

type MutableGlobal = typeof globalThis & {
  __EXPO_SPEECH__?: {
    speak(text: string, options?: Record<string, unknown>): void;
    stop(): void;
    getAvailableVoicesAsync?: () => Promise<ReadonlyArray<{ name?: string; language?: string }>>;
  };
  navigator?: { product?: string };
  window?: unknown;
};

const expoState = {
  speakCalls: [] as ExpoSpeakCall[],
  stopCalls: 0,
};

const expoModule = {
  speak(text: string, options?: Record<string, unknown>) {
    expoState.speakCalls.push({ text, options });
    if (options && typeof options === 'object') {
      const handler = options.onDone ?? options.onStopped;
      if (typeof handler === 'function') {
        handler();
      }
    }
  },
  stop() {
    expoState.stopCalls += 1;
  },
  async getAvailableVoicesAsync() {
    return [
      { name: 'Svenska', language: 'sv-SE' },
      { name: 'English', language: 'en-US' },
    ];
  },
};

test.afterEach(() => {
  const mutable = globalThis as MutableGlobal;
  delete mutable.__EXPO_SPEECH__;
  delete mutable.navigator;
  delete mutable.window;
  expoState.speakCalls.length = 0;
  expoState.stopCalls = 0;
});

test('expo speech uses defaults for Swedish', async () => {
  const mutable = globalThis as MutableGlobal;
  mutable.__EXPO_SPEECH__ = expoModule;
  mutable.navigator = { product: 'ReactNative' };

  await speak({ text: 'Hej', lang: 'sv-SE' });

  assert.equal(expoState.stopCalls, 1, 'stop should be invoked before speaking when not queued');
  assert.equal(expoState.speakCalls.length, 1);
  const call = expoState.speakCalls[0];
  assert.equal(call.text, 'Hej');
  assert.equal(call.options?.language, 'sv-SE');
  assert.equal(call.options?.rate, 0.95);
  assert.equal(call.options?.pitch, 1);

  const voices = await getVoices();
  assert.deepEqual(voices, [
    { name: 'Svenska', lang: 'sv-SE' },
    { name: 'English', lang: 'en-US' },
  ]);
});

test('expo speech respects queue option', async () => {
  const mutable = globalThis as MutableGlobal;
  mutable.__EXPO_SPEECH__ = expoModule;
  mutable.navigator = { product: 'ReactNative' };

  await speak({ text: 'Hello', lang: 'en-US', queue: true });

  assert.equal(expoState.stopCalls, 0, 'stop should not be called when queue=true');
  assert.equal(expoState.speakCalls.length, 1);
  const call = expoState.speakCalls[0];
  assert.equal(call.options?.language, 'en-US');
  assert.equal(call.options?.rate, 1);
});

test('web speech synthesis is invoked with sensible defaults', async () => {
  const mutable = globalThis as MutableGlobal;
  const utterances: any[] = [];
  let cancelCount = 0;
  const synth = {
    speak(utterance: any) {
      utterances.push(utterance);
      if (typeof utterance.onend === 'function') {
        utterance.onend({});
      }
    },
    cancel() {
      cancelCount += 1;
    },
    getVoices() {
      return [{ name: 'WebVoice', lang: 'en-US' }];
    },
    addEventListener() {
      /* no-op */
    },
    removeEventListener() {
      /* no-op */
    },
  };
  mutable.window = {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: function SpeechSynthesisUtterance(this: any, text: string) {
      this.text = text;
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.onend = null;
      this.onerror = null;
    },
  };

  await speak({ text: 'Play tip', lang: 'en-US' });

  assert.equal(cancelCount, 1, 'initial speak should cancel existing utterances');
  assert.equal(utterances.length, 1);
  const utterance = utterances[0];
  assert.equal(utterance.text, 'Play tip');
  assert.equal(utterance.lang, 'en-US');
  assert.equal(Number(utterance.rate.toFixed(2)), 1);
  assert.equal(Number(utterance.pitch.toFixed(2)), 1);

  const voices = await getVoices('en-US');
  assert.equal(voices.length, 1);
  assert.equal(voices[0].name, 'WebVoice');

  stop();
  assert.ok(cancelCount >= 2, 'stop() should cancel active speech');
});

test('node fallback resolves without speech APIs', async () => {
  await speak({ text: 'Silent', lang: 'en-US' });
  const voices = await getVoices();
  assert.deepEqual(voices, []);
});
