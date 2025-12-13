export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export type Translator = (key: string, params?: TranslationParams) => string;

export type SgLightExplainerCopy = {
  heading: string;
  title: string;
  bullets: string[];
  categoriesLine: string;
  confidenceLine: string;
};

export const SG_LIGHT_EXPLAINER_KEYS = {
  heading: 'sg_light.explainer.heading',
  title: 'sg_light.explainer.title',
  bullets: [
    'sg_light.explainer.points.performance',
    'sg_light.explainer.points.delta_meaning',
    'sg_light.explainer.points.confidence',
  ],
  categoriesLine: 'sg_light.explainer.categories',
  confidenceLine: 'sg_light.explainer.confidence',
} as const;

export function buildSgLightExplainerCopy(t: Translator): SgLightExplainerCopy {
  return {
    heading: t(SG_LIGHT_EXPLAINER_KEYS.heading),
    title: t(SG_LIGHT_EXPLAINER_KEYS.title),
    bullets: SG_LIGHT_EXPLAINER_KEYS.bullets.map((key) => t(key)),
    categoriesLine: t(SG_LIGHT_EXPLAINER_KEYS.categoriesLine),
    confidenceLine: t(SG_LIGHT_EXPLAINER_KEYS.confidenceLine),
  };
}
