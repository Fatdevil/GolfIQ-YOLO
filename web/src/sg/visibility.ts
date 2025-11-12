export type ClipModerationLike = {
  hidden?: boolean | null;
  visibility?: string | null;
} | null;

export function isClipVisible(state?: ClipModerationLike): boolean {
  if (!state) {
    return true;
  }
  if (state.hidden) {
    return false;
  }
  const visibility = typeof state.visibility === 'string' ? state.visibility.toLowerCase() : null;
  if (visibility && visibility !== 'public') {
    return false;
  }
  return true;
}
