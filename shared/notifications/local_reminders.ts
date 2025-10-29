export type ReminderId = string;

export type ReminderResult = ReminderId | null;

type PermissionStatus = {
  status?: string;
  granted?: boolean;
};

type NotificationContent = {
  title: string;
  body: string;
  sound?: boolean | string;
  data?: Record<string, unknown>;
};

const PRACTICE_CATEGORY_ID = 'practice-session-reminder';

let _isRN: boolean | null = null;
function isRN(): boolean {
  if (_isRN != null) {
    return _isRN;
  }
  // Works in Expo/React Native; on web this will be false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _isRN = typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative';
  return _isRN;
}

let modulePromise: Promise<any | null> | null = null;
async function loadExpoNotifications(): Promise<any | null> {
  if (!isRN()) {
    return null;
  }
  if (modulePromise) {
    return modulePromise;
  }
  modulePromise = import('expo-notifications')
    .then((mod: any) => mod ?? null)
    .catch(() => null);
  return modulePromise;
}

let permissionPromise: Promise<boolean> | null = null;

const safeNow = (): number => Date.now();

const buildContent = (text: string): NotificationContent => ({
  title: 'GolfIQ',
  body: text,
  sound: true,
  data: { category: PRACTICE_CATEGORY_ID },
});

const toDate = (value: Date | number): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const next = new Date(timestamp);
  return Number.isNaN(next.getTime()) ? null : next;
};

const isGranted = (status: PermissionStatus | null | undefined): boolean => {
  if (!status) {
    return false;
  }
  if (typeof status.granted === 'boolean') {
    return status.granted;
  }
  if (typeof status.status === 'string') {
    return status.status === 'granted';
  }
  return false;
};

export async function ensureReminderPermission(): Promise<boolean> {
  if (!isRN()) {
    return false;
  }
  if (permissionPromise) {
    return permissionPromise;
  }
  permissionPromise = (async () => {
    const Notifications = await loadExpoNotifications();
    if (!Notifications) {
      return false;
    }
    try {
      const status = (await Notifications.requestPermissionsAsync?.()) as
        | PermissionStatus
        | null
        | undefined;
      return isGranted(status);
    } catch {
      return false;
    }
  })();
  try {
    return await permissionPromise;
  } finally {
    permissionPromise = null;
  }
}

export async function scheduleReminder(date: Date | number, text: string): Promise<ReminderResult> {
  if (!isRN()) {
    return null;
  }
  const Notifications = await loadExpoNotifications();
  if (!Notifications) {
    return null;
  }
  const when = toDate(date);
  if (!when) {
    return null;
  }
  try {
    await Notifications.requestPermissionsAsync?.();
    const trigger = when.getTime() <= safeNow() ? null : { date: when };
    const id = await Notifications.scheduleNotificationAsync?.({
      content: buildContent(text),
      trigger,
    });
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

export async function cancelAllPracticeReminders(): Promise<void> {
  if (!isRN()) {
    return;
  }
  const Notifications = await loadExpoNotifications();
  if (!Notifications) {
    return;
  }
  try {
    await Notifications.cancelAllScheduledNotificationsAsync?.();
  } catch {
    // ignore cancellation failures
  }
}

export const __private__ = {
  loadExpoNotifications,
  isRN,
  buildContent,
  toDate,
};
