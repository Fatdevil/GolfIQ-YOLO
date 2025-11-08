import { randomBytes } from 'node:crypto';

import type { ShortCode } from './types';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALPHABET_SIZE = ALPHABET.length;
const CHAR_TO_VALUE = new Map<string, number>(
  Array.from(ALPHABET).map((char, index) => [char, index]),
);

function randomIndexes(count: number): number[] {
  const result: number[] = [];
  if (count <= 0) {
    return result;
  }
  const maxMultiple = Math.floor(256 / ALPHABET_SIZE) * ALPHABET_SIZE;
  while (result.length < count) {
    const bytes = randomBytes(count);
    for (const byte of bytes) {
      if (byte < maxMultiple) {
        result.push(byte % ALPHABET_SIZE);
        if (result.length === count) {
          break;
        }
      }
    }
  }
  return result;
}

function computeChecksum(values: readonly number[]): number {
  let acc = 0;
  for (let i = 0; i < values.length; i += 1) {
    acc = (acc + values[i]! * (i + 1)) % ALPHABET_SIZE;
  }
  return acc;
}

function encode(values: readonly number[]): string {
  return values.map((value) => ALPHABET[value] ?? '').join('');
}

function normalizeInput(code: string): string {
  return code.trim();
}

export function generateCode(): ShortCode {
  const body = randomIndexes(6);
  const checksum = computeChecksum(body);
  const value = encode([...body, checksum]);
  return value as ShortCode;
}

export function validateCode(code: string): code is ShortCode {
  if (typeof code !== 'string') {
    return false;
  }
  const normalized = normalizeInput(code);
  if (normalized.length !== 7) {
    return false;
  }
  const digits: number[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i]!;
    const value = CHAR_TO_VALUE.get(char);
    if (value === undefined) {
      return false;
    }
    digits.push(value);
  }
  const checksum = digits.pop();
  if (checksum === undefined) {
    return false;
  }
  const computed = computeChecksum(digits);
  if (computed !== checksum) {
    return false;
  }
  return true;
}

export function normalizeCode(code: string): ShortCode {
  const trimmed = normalizeInput(code);
  const canonical = trimmed.toUpperCase();
  if (!validateCode(canonical)) {
    throw new Error('invalid shortcode');
  }
  return canonical as ShortCode;
}

export const __testing = {
  ALPHABET,
  computeChecksum,
  normalizeInput,
};

