import * as Sentry from "@sentry/react";
import { BrowserTracing } from "@sentry/tracing";

const DSN = import.meta.env.VITE_SENTRY_DSN_WEB ?? "";
const ANALYTICS_FLAG = (import.meta.env.VITE_ANALYTICS_ENABLED ?? "true").toLowerCase() !== "false";
const CONSENT_KEY = "golfiq.analytics.consent";
const SAMPLE_RATE = 0.2;
const MAX_STACK_FRAMES = 50;

let initialised = false;

const hasConsent = (): boolean => {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch (error) {
    console.warn("analytics consent lookup failed", error);
    return false;
  }
};

export const setAnalyticsConsent = (granted: boolean) => {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "revoked");
  } catch (error) {
    console.warn("analytics consent write failed", error);
  }
};

export const initSentry = () => {
  if (initialised || !DSN || !ANALYTICS_FLAG || !hasConsent()) {
    return;
  }

  Sentry.init({
    dsn: DSN,
    integrations: [new BrowserTracing()],
    tracesSampleRate: SAMPLE_RATE,
    sendDefaultPii: false,
    beforeSend(event) {
      if (!hasConsent() || Math.random() > SAMPLE_RATE) {
        return null;
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      if (event.contexts?.geo) {
        delete event.contexts.geo;
      }
      if (event.exception?.values?.length) {
        event.exception.values = event.exception.values.map((exception) => {
          if (exception.stacktrace?.frames && exception.stacktrace.frames.length > MAX_STACK_FRAMES) {
            exception.stacktrace.frames = exception.stacktrace.frames.slice(-MAX_STACK_FRAMES);
          }
          return exception;
        });
      }
      return event;
    },
  });

  initialised = true;
};

export const captureException = (error: unknown) => {
  if (!initialised) {
    return;
  }
  Sentry.captureException(error);
};
