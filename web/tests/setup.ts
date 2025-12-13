import React from 'react';
import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import '../src/i18n';

const routerFutureFlags = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();

  const withFutureComponent = <P extends { future?: Record<string, unknown> }>(
    Component: React.ComponentType<P>,
  ) =>
    function RouterWithFuture(props: P) {
      const future = { ...routerFutureFlags, ...(props.future ?? {}) };
      return React.createElement(Component, { ...props, future });
    };

  const withFutureFactory = <Factory extends (routes: any, opts?: any) => any>(factory: Factory) =>
    function routerFactory(routes: Parameters<Factory>[0], opts: Parameters<Factory>[1] = {}) {
      return factory(routes, {
        ...opts,
        future: { ...routerFutureFlags, ...(opts?.future ?? {}) },
      });
    };

  return {
    ...actual,
    BrowserRouter: withFutureComponent(actual.BrowserRouter),
    MemoryRouter: withFutureComponent(actual.MemoryRouter),
    HashRouter: actual.HashRouter ? withFutureComponent(actual.HashRouter) : actual.HashRouter,
    createMemoryRouter: withFutureFactory(actual.createMemoryRouter),
    createBrowserRouter: actual.createBrowserRouter
      ? withFutureFactory(actual.createBrowserRouter)
      : actual.createBrowserRouter,
    createHashRouter: actual.createHashRouter ? withFutureFactory(actual.createHashRouter) : actual.createHashRouter,
  };
});

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
