export type ClipVisibility = {
  hidden: boolean;
  visibility: 'private' | 'event' | 'friends' | 'public';
};

const VALID_VISIBILITIES: ClipVisibility['visibility'][] = ['private', 'event', 'friends', 'public'];

export function parseClipVisibility(value: unknown): ClipVisibility['visibility'] | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return VALID_VISIBILITIES.includes(normalized as ClipVisibility['visibility'])
    ? (normalized as ClipVisibility['visibility'])
    : null;
}

export function normalizeClipVisibility(
  record: { hidden?: boolean | null; visibility?: string | null } | null | undefined,
): ClipVisibility {
  const rawVisibility = record?.visibility;
  const parsed = parseClipVisibility(rawVisibility);
  const fallback: ClipVisibility['visibility'] = rawVisibility === null || rawVisibility === undefined ? 'public' : 'private';
  return {
    hidden: Boolean(record?.hidden),
    visibility: parsed ?? fallback,
  };
}

export function makeIsClipVisible(
  get: (clipId: string) => ClipVisibility | undefined,
  viewer: { inEvent: boolean },
): (clipId: string) => boolean {
  return (clipId: string) => {
    if (typeof clipId !== 'string' || !clipId.trim()) {
      return false;
    }
    const state = get(clipId);
    if (!state) {
      return false;
    }
    if (state.hidden) {
      return false;
    }
    switch (state.visibility) {
      case 'public':
        return true;
      case 'event':
      case 'friends':
        return Boolean(viewer?.inEvent);
      case 'private':
      default:
        return false;
    }
  };
}

export type { ClipVisibility as ClipVisibilityState };
