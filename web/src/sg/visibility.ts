import { makeIsClipVisible, normalizeClipVisibility } from '@web/features/clips/visibilityPolicy';

export type ClipModerationLike = {
  hidden?: boolean | null;
  visibility?: string | null;
} | null;

export function isClipVisible(state?: ClipModerationLike, viewerInEvent = false): boolean {
  if (!state) {
    return true;
  }
  const normalized = normalizeClipVisibility({ hidden: state.hidden ?? false, visibility: state.visibility ?? null });
  const checker = makeIsClipVisible(() => normalized, { inEvent: viewerInEvent });
  return checker('clip');
}
