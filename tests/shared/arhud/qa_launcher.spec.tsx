import assert from 'node:assert/strict';
import test from 'node:test';
import React, { type ReactElement, type ReactNode } from '../../../golfiq/app/node_modules/react';
import Module from 'node:module';

type ReactNativeStub = {
  ActionSheetIOS: {
    showActionSheetWithOptions: (options: unknown, callback: (buttonIndex: number) => void) => void;
  };
  Alert: {
    alert: (...args: unknown[]) => void;
  };
  Modal: (props: Record<string, unknown>) => ReactElement;
  SafeAreaView: (props: Record<string, unknown>) => ReactElement;
  StyleSheet: {
    absoluteFillObject: Record<string, unknown>;
    create: <T,>(styles: T) => T;
  };
  Text: (props: Record<string, unknown>) => ReactElement;
  TouchableOpacity: (props: Record<string, unknown>) => ReactElement;
  View: (props: Record<string, unknown>) => ReactElement;
  Platform: {
    OS: string;
  };
};

function createReactNativeStub(): ReactNativeStub {
  return {
    ActionSheetIOS: {
      showActionSheetWithOptions: () => {},
    },
    Alert: {
      alert: () => {},
    },
    Modal: (props) => React.createElement('Modal', props, props.children),
    SafeAreaView: (props) => React.createElement('SafeAreaView', props, props.children),
    StyleSheet: {
      absoluteFillObject: {},
      create: <T,>(styles: T) => styles,
    },
    Text: (props) => React.createElement('Text', props, props.children),
    TouchableOpacity: (props) => React.createElement('TouchableOpacity', props, props.children),
    View: (props) => React.createElement('View', props, props.children),
    Platform: {
      OS: 'ios',
    },
  };
}

test('QALauncher toggles overlay when QA mode is enabled', async (t) => {
  const previousQaHud = process.env.QA_HUD;
  const previousQaDev = process.env.QA_DEV;
  process.env.QA_HUD = '1';
  delete process.env.QA_DEV;

  const stubReactNative = createReactNativeStub();
  const moduleLoader = Module as unknown as { _load: typeof Module._load };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = ((request: string, parent, isMain) => {
    if (request === 'react-native') {
      return stubReactNative;
    }
    return originalLoad(request, parent, isMain);
  }) as typeof Module._load;

  const { QALauncher } = await import('../../../golfiq/app/qa/QALauncher');

  const originalActionSheet = stubReactNative.ActionSheetIOS.showActionSheetWithOptions;
  stubReactNative.ActionSheetIOS.showActionSheetWithOptions = ((options, callback) => {
    callback(0);
  }) as typeof originalActionSheet;

  t.after(() => {
    if (previousQaHud === undefined) {
      delete process.env.QA_HUD;
    } else {
      process.env.QA_HUD = previousQaHud;
    }
    if (previousQaDev === undefined) {
      delete process.env.QA_DEV;
    } else {
      process.env.QA_DEV = previousQaDev;
    }
    stubReactNative.ActionSheetIOS.showActionSheetWithOptions = originalActionSheet;
    moduleLoader._load = originalLoad;
  });

  const hookValues: unknown[] = [];
  let hookCursor = 0;

  const originalUseState = React.useState;
  const originalUseMemo = React.useMemo;
  const originalUseCallback = React.useCallback;

  (React as unknown as { useState: typeof React.useState }).useState = (<T,>(initial: T | (() => T)) => {
    const index = hookCursor;
    if (hookValues.length === hookCursor) {
      hookValues.push(typeof initial === 'function' ? (initial as () => T)() : initial);
    }
    const setState = (value: T | ((prev: T) => T)) => {
      const previous = hookValues[index] as T;
      hookValues[index] = typeof value === 'function' ? (value as (prev: T) => T)(previous) : value;
    };
    const state = hookValues[index] as T;
    hookCursor += 1;
    return [state, setState] as const;
  }) as typeof React.useState;

  (React as unknown as { useMemo: typeof React.useMemo }).useMemo = (<T,>(factory: () => T) => factory()) as typeof React.useMemo;
  (React as unknown as { useCallback: typeof React.useCallback }).useCallback = (<T extends (...args: never[]) => unknown,>(
    callback: T,
  ) => callback) as typeof React.useCallback;

  t.after(() => {
    (React as unknown as { useState: typeof React.useState }).useState = originalUseState;
    (React as unknown as { useMemo: typeof React.useMemo }).useMemo = originalUseMemo;
    (React as unknown as { useCallback: typeof React.useCallback }).useCallback = originalUseCallback;
  });

  const renderLauncher = (): ReactElement => {
    hookCursor = 0;
    return QALauncher({ children: React.createElement('View', null) });
  };

  const findElement = (node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement | null => {
    if (node === null || node === undefined || typeof node === 'boolean') {
      return null;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        const match = findElement(child, predicate);
        if (match) {
          return match;
        }
      }
      return null;
    }
    if (typeof node === 'string' || typeof node === 'number') {
      return null;
    }
    const element = node as ReactElement;
    if (predicate(element)) {
      return element;
    }
    if (element.props && 'children' in element.props) {
      return findElement(element.props.children, predicate);
    }
    return null;
  };

  let tree = renderLauncher();
  const button = findElement(tree, (element) => element.props?.accessibilityLabel === 'Open QA Launcher');
  assert.ok(button);

  button.props.onPress();
  tree = renderLauncher();

  const modalOpen = findElement(tree, (element) => element.type === stubReactNative.Modal);
  assert.ok(modalOpen);

  const closeButton = findElement(tree, (element) => element.props?.accessibilityLabel === 'Close QA Overlay');
  assert.ok(closeButton);

  closeButton.props.onPress();
  tree = renderLauncher();

  const modalClosed = findElement(tree, (element) => element.type === stubReactNative.Modal);
  assert.ok(modalClosed);
  assert.equal(modalClosed.props?.visible, false);
});
