const preloadedImages = new Set<string>();

export function preloadImage(url: string | null | undefined): void {
  if (!url || preloadedImages.has(url)) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
  preloadedImages.add(url);
}

export function hasPreloaded(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  if (preloadedImages.has(url)) {
    return true;
  }
  return Array.from(document.head.querySelectorAll('link[rel="preload"][as="image"]')).some(
    (node) => node instanceof HTMLLinkElement && node.href === url,
  );
}
