import { en } from './en';
import { sv } from './sv';

type LeafValue = string | number | boolean | null | undefined;

type Interpolation = Record<string, LeafValue>;

type TranslationValue = string | TranslationTree;

interface TranslationTree {
  [key: string]: TranslationValue;
}

function interpolate(template: string, params?: Interpolation): string {
  if (!params) return template;
  return template.replace(/{{(.*?)}}/g, (_, key) => {
    const value = params[key.trim()];
    return value === undefined || value === null ? '' : String(value);
  });
}

function resolveKey(source: TranslationTree, key: string): string | null {
  const parts = key.split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !(part in (current as TranslationTree))) {
      return null;
    }
    current = (current as TranslationTree)[part];
  }
  return typeof current === 'string' ? current : null;
}

export function t(key: string, params?: Interpolation): string {
  const value = resolveKey(en as unknown as TranslationTree, key);
  if (!value) return key;
  return interpolate(value, params);
}

export { en, sv };
