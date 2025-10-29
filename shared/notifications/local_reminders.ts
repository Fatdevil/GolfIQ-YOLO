export type ReminderId = string;

export type ReminderResult = ReminderId | null;

type ExpoNotificationModule = typeof import('expo-notifications');

type PermissionStatus = {
  status: string;
  granted?: boolean;
  canAskAgain?: boolean;
};

type NotificationContent = {
  title: string;
  body: string;
  sound?: boolean | string;
  data?: Record<string, unknown>;
};

let modulePromise: Promise<ExpoNotificationModule | null> | null = null;
let permissionPromise: Promise<boolean> | null = null;

const PRACTICE_CATEGORY_ID = 'practice-session-reminder';

const safeNow = (): number => Date.now();

async function loadNotificationsModule(): Promise<ExpoNotificationModule | null> {
  if (modulePromise) {
    return modulePromise;
  }
  modulePromise = import('expo-notifications')
    .then((mod) => {
      if (mod && typeof mod === 'object') {
        return (mod as ExpoNotificationModule) ?? null;
      }
      return null;
    })
    .catch(() => null);
  return modulePromise;
}

const isGranted = (status: PermissionStatus | null | undefined): boolean => {
  if (!status) {
    return false;
  }
  if (typeof status.granted === 'boolean') {
    return status.granted;
  }
  return status.status === 'granted';
};

export async function ensureReminderPermission(): Promise<boolean> {
  if (permissionPromise) {
    return permissionPromise;
  }
  permissionPromise = (async () => {
    const mod = await loadNotificationsModule();
    if (!mod) {
      return false;
    }
    try {
      const current = (await mod.getPermissionsAsync?.()) as PermissionStatus | null | undefined;
      if (isGranted(current)) {
        return true;
      }
      if (current && current.canAskAgain === false) {
        return false;
      }
      const next = (await mod.requestPermissionsAsync?.()) as PermissionStatus | null | undefined;
      return isGranted(next);
    } catch {
      return false;
    }
  })();
  try {
    const result = await permissionPromise;
    return result;
  } finally {
    permissionPromise = null;
  }
}

const buildContent = (text: string): NotificationContent => ({
  title: 'Practice reminder',
  body: text,
  sound: true,
  data: { category: PRACTICE_CATEGORY_ID },
});

const normaliseDate = (input: Date | number): Date | null => {
  const value = input instanceof Date ? input.getTime() : Number(input);
  if (!Number.isFinite(value)) {
    return null;
  }
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  if (target.getTime() <= safeNow()) {
    return null;
  }
  return target;
};

export async function scheduleReminder(date: Date | number, text: string): Promise<ReminderResult> {
  const mod = await loadNotificationsModule();
  if (!mod) {
    return null;
  }
  const allowed = await ensureReminderPermission();
  if (!allowed) {
    return null;
  }
  const triggerDate = normaliseDate(date);
  if (!triggerDate) {
    return null;
  }
  try {
    const id = await mod.scheduleNotificationAsync({
      content: buildContent(text),
      trigger: triggerDate,
    });
    if (typeof id === 'string' && id.trim()) {
      return id;
    }
  } catch {
    // ignored – reminders are best-effort
  }
  return null;
}

export async function cancelAllPracticeReminders(): Promise<void> {
  const mod = await loadNotificationsModule();
  if (!mod) {
    return;
  }
  try {
    await mod.cancelAllScheduledNotificationsAsync?.();
  } catch {
    // ignore cancellation failures
  }
}

export const __private__ = {
  loadNotificationsModule,
  normaliseDate,
  buildContent,
};
