import { Platform } from 'react-native';

type ScanListener = (session: ScanSession) => void;

export type ScanSession = {
  id: number;
  onResult(value: string): void;
  onCancel(): void;
};

const listeners = new Set<ScanListener>();
let current: { id: number; resolve: (value: string | null) => void } | null = null;
let nextId = 1;

export function subscribeToScanRequests(listener: ScanListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(session: ScanSession): void {
  for (const listener of listeners) {
    try {
      listener(session);
    } catch {
      // ignore listener errors
    }
  }
}

export async function scanCode(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return Promise.resolve(prompt('Paste SharedRound JSON here') ?? null);
  }
  const { BarCodeScanner } = await import('expo-barcode-scanner');
  const permission = await BarCodeScanner.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Camera permission denied');
  }
  if (current) {
    current.resolve(null);
    current = null;
  }
  return new Promise<string | null>((resolve) => {
    const id = nextId++;
    current = { id, resolve };
    notify({
      id,
      onResult(value: string) {
        if (current && current.id === id) {
          const { resolve: resolver } = current;
          current = null;
          resolver(value);
        }
      },
      onCancel() {
        if (current && current.id === id) {
          const { resolve: resolver } = current;
          current = null;
          resolver(null);
        }
      },
    });
  });
}

