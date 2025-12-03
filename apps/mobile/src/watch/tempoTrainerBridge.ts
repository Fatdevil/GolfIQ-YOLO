import type { TempoTarget } from '@app/range/tempoTrainerEngine';

export interface TempoTrainerActivationMessage extends TempoTarget {
  type: 'tempoTrainer.activate';
}

export interface TempoTrainerDeactivateMessage {
  type: 'tempoTrainer.deactivate';
}

export interface TempoTrainerResultMessage {
  type: 'tempoTrainer.result';
  backswingMs?: number;
  downswingMs?: number;
  ratio?: number;
  withinBand?: boolean;
  shotId?: string;
}

type ResultListener = (message: TempoTrainerResultMessage) => void;

let outboundHandler: ((message: TempoTrainerActivationMessage | TempoTrainerDeactivateMessage) => void) | null = null;
const listeners: ResultListener[] = [];

export function registerTempoTrainerSender(
  handler: (message: TempoTrainerActivationMessage | TempoTrainerDeactivateMessage) => void,
): void {
  outboundHandler = handler;
}

export function isTempoTrainerAvailable(): boolean {
  return outboundHandler !== null;
}

function send(message: TempoTrainerActivationMessage | TempoTrainerDeactivateMessage): void {
  if (!outboundHandler) {
    console.debug('TempoTrainer: outbound handler not registered', message);
    return;
  }
  outboundHandler(message);
}

export function sendTempoTrainerActivation(target: TempoTarget): void {
  send({ type: 'tempoTrainer.activate', ...target });
}

export function sendTempoTrainerDeactivation(): void {
  send({ type: 'tempoTrainer.deactivate' });
}

export function subscribeToTempoTrainerResults(listener: ResultListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

export function emitTempoTrainerResult(message: TempoTrainerResultMessage): void {
  listeners.forEach((listener) => listener(message));
}

