import 'fake-indexeddb/auto';
import { vi } from 'vitest';

vi.mock('hls.js', () => ({
  default: class MockHls {
    static isSupported() {
      return false;
    }
    loadSource() {}
    attachMedia() {}
    destroy() {}
  },
}));

// Only in Node/Vitest
defineBlobArrayBufferPolyfill();

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
