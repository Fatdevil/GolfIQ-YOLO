import { useCallback, useRef } from 'react';

export function useTrackOncePerKey(key: string | null | undefined) {
  const lastKeyRef = useRef<string | null>();

  const shouldFire = useCallback(() => {
    if (!key) return false;
    if (lastKeyRef.current === key) return false;
    lastKeyRef.current = key;
    return true;
  }, [key]);

  const fire = useCallback(
    (callback: () => void) => {
      if (!key) return;
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;
      callback();
    },
    [key],
  );

  return { shouldFire, fire } as const;
}
