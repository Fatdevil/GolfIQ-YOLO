import { postTelemetryEvent } from "@/api";

export type SgLightExplainerSurface = "round_recap" | "round_story" | "round_share" | "player_stats";

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
