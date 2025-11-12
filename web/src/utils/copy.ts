export function copyToClipboard(text: string): Promise<void> | void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  if (typeof document === 'undefined') {
    return undefined;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand?.('copy');
  } finally {
    document.body.removeChild(textarea);
  }

  return undefined;
}
