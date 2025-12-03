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

let outboundHandler: ((message: TempoTrainerActivationMessage | TempoTrainerDeactivateMessage) => void) | null = (
  message,
) => {
  console.debug('[tempoTrainer] outbound', message);
};
const listeners: ResultListener[] = [];

export function registerTempoTrainerSender(
  handler: (message: TempoTrainerActivationMessage | TempoTrainerDeactivateMessage) => void,
): void {
  outboundHandler = handler;
}

export function isTempoTrainerAvailable(): boolean {
  return typeof outboundHandler === 'function';
}

export function sendTempoTrainerActivation(target: TempoTarget): void {
  outboundHandler?.({ type: 'tempoTrainer.activate', ...target });
}

export function sendTempoTrainerDeactivation(): void {
  outboundHandler?.({ type: 'tempoTrainer.deactivate' });
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

