import React from 'react';

type ParamList = Record<string, object | undefined>;

type ScreenConfig = string | { path: string };

export type LinkingOptions<T extends ParamList> = {
  prefixes: string[];
  config: {
    screens: {
      [K in keyof T]: ScreenConfig;
    };
  };
  getInitialURL?: () => Promise<string | null>;
  subscribe?: (listener: (url: string) => void) => () => void;
};

type RouteState = {
  routes: Array<{
    name: string;
    params?: Record<string, unknown>;
  }>;
};

function normalizeUrl(url: string): string {
  if (!url) {
    return '';
  }
  const [clean] = url.split('?');
  const prefixIndex = clean.indexOf('://');
  if (prefixIndex >= 0) {
    return clean.slice(prefixIndex + 3);
  }
  return clean.replace(/^\//, '');
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  let pathIndex = 0;

  for (let i = 0; i < patternSegments.length; i += 1) {
    const part = patternSegments[i]!;
    const isParam = part.startsWith(':');
    const isOptional = isParam && part.endsWith('?');
    const name = isParam ? part.slice(1, isOptional ? -1 : undefined) : part;
    const segment = pathSegments[pathIndex];

    if (isParam) {
      if (segment) {
        params[name] = decodeSegment(segment);
        pathIndex += 1;
      } else if (!isOptional) {
        return null;
      }
    } else {
      if (segment !== name) {
        return null;
      }
      pathIndex += 1;
    }
  }

  if (pathIndex < pathSegments.length) {
    return null;
  }
  return params;
}

export function getStateFromPath(url: string, config: LinkingOptions<ParamList>['config']): RouteState | undefined {
  const path = normalizeUrl(url);
  for (const [name, pattern] of Object.entries(config.screens)) {
    const template = typeof pattern === 'string' ? pattern : pattern.path;
    if (!template) {
      continue;
    }
    const params = matchPattern(template, path);
    if (params) {
      return {
        routes: [
          {
            name,
            params: Object.keys(params).length > 0 ? params : undefined,
          },
        ],
      };
    }
  }
  return undefined;
}

type NavigationContainerProps = {
  children?: React.ReactNode;
  linking?: LinkingOptions<ParamList>;
};

export const NavigationContainer: React.FC<NavigationContainerProps> = ({ children }) => (
  <>{children}</>
);

export function useNavigation<T extends { navigate: (...args: unknown[]) => void }>(): T {
  throw new Error('useNavigation is not implemented in the test runtime.');
}

export function useRoute<T>(): T {
  throw new Error('useRoute is not implemented in the test runtime.');
}
