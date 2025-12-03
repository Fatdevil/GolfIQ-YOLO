import { NativeModules } from 'react-native';

import { registerCaddieHudSender } from './caddieHudBridge';
import { registerTempoTrainerSender } from './tempoTrainerBridge';

type WatchTransport = {
  sendMessage?: (payload: unknown) => void;
} | null;

function resolveWatchTransport(): WatchTransport {
  const modules = NativeModules as Record<string, any>;
  return modules.WatchBridge ?? modules.WatchTransport ?? null;
}

export function registerWatchTempoTrainerBridge(): void {
  const transport = resolveWatchTransport();
  if (transport?.sendMessage) {
    registerTempoTrainerSender((message) => {
      transport.sendMessage?.({ type: 'tempoTrainer', payload: message });
    });
    registerCaddieHudSender((msg) => {
      transport.sendMessage?.({ type: 'caddieHud', payload: msg });
    });
  }
}
