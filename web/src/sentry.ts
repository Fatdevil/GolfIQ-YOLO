import * as Sentry from "@sentry/browser";

type AnalyticsWindow = Window & {
  __analyticsEnabled?: boolean;
};

const analyticsWindow = window as AnalyticsWindow;
const dsn = import.meta.env.VITE_SENTRY_DSN;
const killSwitch = analyticsWindow.__analyticsEnabled;

if (dsn && (killSwitch ?? true)) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    beforeSend(event: Sentry.Event | null) {
      return scrubEvent(event);
    },
    sendDefaultPii: false,
  });
}

function scrubEvent(event: Sentry.Event | null): Sentry.Event | null {
  if (!event) {
    return event;
  }
  event.user = undefined;
  event.request = undefined;
  event.server_name = undefined;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .filter((breadcrumb: Sentry.Breadcrumb) => {
        const message = `${breadcrumb.message ?? ""} ${JSON.stringify(breadcrumb.data ?? {})}`.toLowerCase();
        return !message.includes("@") && !message.includes("email") && !message.includes("ssn");
      })
      .slice(-30);
  }
  if (event.exception?.values) {
    event.exception.values.forEach((exception: Sentry.Exception) => {
      const stacktrace = exception.stacktrace;
      const frames = stacktrace?.frames;
      if (frames && frames.length > 20) {
        stacktrace!.frames = frames.slice(-20);
      }
    });
  }
  if (event.contexts) {
    delete event.contexts.device;
    delete event.contexts.trace;
  }
  if (event.extra) {
    event.extra = {};
  }
  return event;
}
