import { postTelemetryEvent } from "@/api";
import {
  buildSgLightExplainerOpenTelemetry,
  buildSgLightPracticeCtaClickTelemetry,
  SG_LIGHT_EXPLAINER_OPENED_EVENT,
  type SgLightPracticeCtaClickedPayload,
  type SgLightSurface,
} from "@shared/sgLight/analytics";

export type SgLightExplainerSurface = SgLightSurface;

export function trackSgLightExplainerOpenedWeb(payload: { surface: SgLightExplainerSurface }): void {
  const { eventName, payload: resolvedPayload } = buildSgLightExplainerOpenTelemetry(payload);
  void postTelemetryEvent({
    event: eventName,
    platform: "web",
    ts: Date.now(),
    ...resolvedPayload,
  }).catch((error) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[sg_light] failed to emit explainer open", error);
    }
  });
}

export function trackSgLightPracticeCtaClickedWeb(payload: SgLightPracticeCtaClickedPayload): void {
  const { eventName, payload: resolvedPayload } = buildSgLightPracticeCtaClickTelemetry(payload);
  void postTelemetryEvent({
    event: eventName,
    ...resolvedPayload,
  }).catch((error) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[sg_light] failed to emit practice CTA click", error);
    }
  });
}
