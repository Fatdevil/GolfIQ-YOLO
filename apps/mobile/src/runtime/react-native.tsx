import React, { useEffect, useMemo, useRef } from 'react';

type CommonProps = {
  children?: React.ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  style?:
    | Record<string, unknown>
    | Array<Record<string, unknown> | false | null>
    | false
    | null;
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

export const View = React.forwardRef<HTMLDivElement, ViewProps>(({ children, testID }, ref) => (
  <div data-testid={testID} ref={ref}>
    {children}
  </div>
));

View.displayName = 'View';

type ScrollViewProps = CommonProps & {
  contentContainerStyle?: Record<string, unknown>;
};

export const ScrollView: React.FC<ScrollViewProps> = ({ children, testID }) => (
  <div data-testid={testID}>{children}</div>
);

type FlatListProps<Item> = CommonProps & {
  data: Item[];
  renderItem: (params: { item: Item; index: number }) => React.ReactElement | null;
  keyExtractor?: (item: Item, index: number) => string;
  contentContainerStyle?: Record<string, unknown>;
};

export function FlatList<Item>({ data, renderItem, keyExtractor, testID }: FlatListProps<Item>): JSX.Element {
  return (
    <div data-testid={testID}>
      {data.map((item, index) => (
        <div key={keyExtractor ? keyExtractor(item, index) : index}>{renderItem({ item, index })}</div>
      ))}
    </div>
  );
}

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

type PressableProps = TouchableOpacityProps & { accessibilityRole?: string };

export const Pressable: React.FC<PressableProps> = ({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityRole,
  testID,
}) => (
  <button
    type="button"
    data-testid={testID}
    aria-label={accessibilityLabel ?? undefined}
    aria-disabled={disabled}
    role={accessibilityRole}
    onClick={() => {
      if (!disabled) {
        onPress?.();
      }
    }}
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
  multiline?: boolean;
  maxLength?: number;
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
};

export const TextInput: React.FC<TextInputProps> = ({
  value,
  placeholder,
  onChangeText,
  accessibilityLabel,
  testID,
  maxLength,
  inputMode,
}) => (
  <input
    data-testid={testID}
    aria-label={accessibilityLabel ?? placeholder ?? undefined}
    value={value ?? ''}
    placeholder={placeholder ?? undefined}
    maxLength={maxLength}
    inputMode={inputMode}
    onChange={(event) => onChangeText?.(event.currentTarget.value)}
  />
);

type SwitchProps = CommonProps & {
  value?: boolean;
  onValueChange?: (value: boolean) => void;
};

export const Switch: React.FC<SwitchProps> = ({ value = false, onValueChange, testID }) => (
  <input
    data-testid={testID}
    type="checkbox"
    checked={value}
    onChange={(event) => onValueChange?.(event.currentTarget.checked)}
  />
);

type ActivityIndicatorProps = CommonProps & {
  size?: 'small' | 'large';
  color?: string;
};

export const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({ testID }) => (
  <div data-testid={testID}>Loading…</div>
);

type ModalProps = CommonProps & { visible: boolean; transparent?: boolean; animationType?: string };

export const Modal: React.FC<ModalProps> = ({ visible, children, testID }) => {
  if (!visible) return null;
  return <div data-testid={testID}>{children}</div>;
};

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

export const Vibration = {
  vibrate(_pattern?: number | number[]): void {
    // no-op for web runtime
  },
};

type ShareContent = { message: string };

export const Share = {
  async share(content: ShareContent): Promise<{ action: string }> {
    return { action: content.message ? 'sharedAction' : 'dismissedAction' };
  },
};

type AlertButton = { text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };

export const Alert = {
  alert(_title: string, message?: string, buttons?: AlertButton[]) {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${_title}\n\n${message}` : _title);
    }

    // For web/runtime tests, default to no-op to avoid auto-confirming destructive actions.
    // Callers can still handle button presses manually in unit tests if needed.
    if (!buttons || buttons.length === 0) return;
  },
};
