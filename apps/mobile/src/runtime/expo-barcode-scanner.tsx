import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

type ScanEvent = { data: string };

type BarCodeScannerProps = React.ComponentProps<typeof View> & {
  onBarCodeScanned?: (event: ScanEvent) => void;
  barCodeTypes?: string | string[];
};

const listeners = new WeakMap<Element, (event: ScanEvent) => void>();

const InnerBarCodeScanner: React.FC<BarCodeScannerProps> = ({ children, onBarCodeScanned, ...rest }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return () => {};
    }
    if (typeof onBarCodeScanned === 'function') {
      listeners.set(node, onBarCodeScanned);
    } else {
      listeners.delete(node);
    }
    return () => {
      listeners.delete(node);
    };
  }, [onBarCodeScanned]);

  return (
    <View {...rest} ref={ref}>
      {children}
    </View>
  );
};

export const BarCodeScanner = Object.assign(InnerBarCodeScanner, {
  Constants: {
    BarCodeType: {
      qr: 'qr' as const,
    },
  },
});

export type PermissionStatus = 'granted' | 'denied';

export async function requestPermissionsAsync(): Promise<{ status: PermissionStatus; granted: boolean }> {
  return { status: 'granted', granted: true };
}

export const __private__ = {
  emitScan(target: Element, event: ScanEvent): void {
    const handler = listeners.get(target);
    handler?.(event);
  },
};
