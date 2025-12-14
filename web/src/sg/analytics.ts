import { postTelemetryEvent } from "@/api";
import {
  buildSgLightExplainerOpenedPayload,
  SG_LIGHT_EXPLAINER_OPENED_EVENT,
  type SgLightSurface,
} from "@shared/sgLight/analytics";

export type SgLightExplainerSurface = SgLightSurface;

export function trackSgLightExplainerOpenedWeb(payload: { surface: SgLightExplainerSurface }): void {
  const resolvedPayload = buildSgLightExplainerOpenedPayload(payload);
  void postTelemetryEvent({
    event: SG_LIGHT_EXPLAINER_OPENED_EVENT,
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
