import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import '../src/i18n';

vi.mock('hls.js', () => import('../src/test/mocks/hls'));

// Only in Node/Vitest
defineBlobArrayBufferPolyfill();
defineResizableArrayBufferPolyfill();

function defineBlobArrayBufferPolyfill(): void {
  if (typeof Blob === 'undefined') {
    return;
  }
  if (typeof Blob.prototype.arrayBuffer === 'function') {
    return;
  }
  Blob.prototype.arrayBuffer = async function arrayBuffer() {
    const buffer = Buffer.from(await this.text());
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  };
}

function defineResizableArrayBufferPolyfill(): void {
  const abDescriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable');
  if (!abDescriptor) {
    Object.defineProperty(ArrayBuffer.prototype, 'resizable', { get() { return false; } });
  }

  if (typeof SharedArrayBuffer !== 'undefined') {
    const sabDescriptor = Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable');
    if (!sabDescriptor) {
      Object.defineProperty(SharedArrayBuffer.prototype, 'growable', { get() { return false; } });
    }
  }
}
