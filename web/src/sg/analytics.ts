import { postTelemetryEvent } from "@/api";
import type { SgLightSurface } from "@shared/sgLight/analytics";

export type SgLightExplainerSurface = SgLightSurface;

export function trackSgLightExplainerOpenedWeb(payload: { surface: SgLightExplainerSurface }): void {
  void postTelemetryEvent({
    event: "sg_light_explainer_opened",
    platform: "web",
    ts: Date.now(),
    ...payload,
  }).catch((error) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[sg_light] failed to emit explainer open", error);
    }
  });
}
