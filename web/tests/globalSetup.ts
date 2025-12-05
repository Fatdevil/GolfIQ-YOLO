export default async function globalSetup() {
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
