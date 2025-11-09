import React, { useEffect, useMemo, useRef } from 'react';

type CommonProps = {
  children?: React.ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  style?: Record<string, unknown> | Record<string, unknown>[];
};

type TextProps = CommonProps & {
  numberOfLines?: number;
};

export const Text: React.FC<TextProps> = ({ children, accessibilityLabel, testID }) => (
  <span data-testid={testID} aria-label={accessibilityLabel ?? undefined}>
    {children}
  </span>
);

type ViewProps = CommonProps & {
  onLayout?: () => void;
};

export const View: React.FC<ViewProps> = ({ children, testID }) => (
  <div data-testid={testID}>{children}</div>
);

type ScrollViewProps = CommonProps & {
  contentContainerStyle?: Record<string, unknown>;
};

export const ScrollView: React.FC<ScrollViewProps> = ({ children, testID }) => (
  <div data-testid={testID}>{children}</div>
);

type TouchableOpacityProps = CommonProps & {
  onPress?: () => void;
  disabled?: boolean;
};

export const TouchableOpacity: React.FC<TouchableOpacityProps> = ({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  testID,
}) => (
  <button
    type="button"
    data-testid={testID}
    onClick={() => {
      if (!disabled) {
        onPress?.();
      }
    }}
    aria-label={accessibilityLabel ?? undefined}
    disabled={disabled}
  >
    {children}
  </button>
);

type TextInputProps = CommonProps & {
  value?: string;
  placeholder?: string;
  onChangeText?: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: string;
  autoCorrect?: boolean;
  autoCapitalize?: 'none' | 'characters';
};

export const TextInput: React.FC<TextInputProps> = ({
  value,
  placeholder,
  onChangeText,
  accessibilityLabel,
  testID,
}) => (
  <input
    data-testid={testID}
    aria-label={accessibilityLabel ?? placeholder ?? undefined}
    value={value ?? ''}
    placeholder={placeholder ?? undefined}
    onChange={(event) => onChangeText?.(event.currentTarget.value)}
  />
);

type ActivityIndicatorProps = CommonProps & {
  size?: 'small' | 'large';
};

export const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({ testID }) => (
  <div data-testid={testID}>Loading…</div>
);

export const StyleSheet = {
  create<T extends Record<string, Record<string, unknown>>>(styles: T): T {
    return styles;
  },
};

type UrlListener = (payload: { url: string }) => void;

const urlListeners = new Set<UrlListener>();
let initialUrl: string | null = null;

function normalizeUrl(url: string): string {
  if (url.startsWith('http') || url.includes('://')) {
    return url;
  }
  return `golfiq://${url.replace(/^\//, '')}`;
}

export const Linking = {
  async getInitialURL(): Promise<string | null> {
    return initialUrl;
  },
  addEventListener(_type: 'url', listener: UrlListener) {
    urlListeners.add(listener);
    return {
      remove() {
        urlListeners.delete(listener);
      },
    };
  },
  __setInitialURL(url: string | null) {
    initialUrl = url;
  },
  __emit(url: string) {
    const normalized = normalizeUrl(url);
    for (const listener of urlListeners) {
      listener({ url: normalized });
    }
  },
};

export const useEffectOnce = (effect: () => void | (() => void)) => {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return effect();
    }
    return () => {};
  }, [effect]);
};

export const useMemoValue = <T,>(factory: () => T, deps: React.DependencyList): T => {
  // Thin wrapper around useMemo to keep runtime surface similar to RN.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps);
};

export const Platform = { OS: 'web' } as const;
