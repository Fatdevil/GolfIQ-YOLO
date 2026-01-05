export type ToastEvent = {
  message: string;
  variant: 'error' | 'info' | 'success';
};

function dispatchToast(event: ToastEvent): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('toast', { detail: event }));
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[toast:${event.variant}]`, event.message);
  }
}

export const toast = {
  error(message: string): void {
    dispatchToast({ message, variant: 'error' });
  },
  success(message: string): void {
    dispatchToast({ message, variant: 'success' });
  },
};

export type ToastApi = typeof toast;
