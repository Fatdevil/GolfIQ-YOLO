export type FollowContext = {
  holeId: number;
  par?: number;
  pos?: { lat: number; lon: number };
  onGreen?: boolean;
  onTee?: boolean;
  lie?: 'Tee' | 'Fairway' | 'Rough' | 'Sand' | 'Recovery';
};

let current: FollowContext | null = null;

export function setFollowContext(context: FollowContext | null): void {
  current = context;
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__follow = context ?? undefined;
  }
}

export function getFollowContext(): FollowContext | null {
  return current;
}
