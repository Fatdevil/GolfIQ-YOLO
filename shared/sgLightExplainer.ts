export type Translator = (...args: unknown[]) => string;

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
    heading: t(SG_LIGHT_EXPLAINER_KEYS.heading, 'Strokes Gained Light'),
    title: t(SG_LIGHT_EXPLAINER_KEYS.title, 'What is SG Light?'),
    bullets: SG_LIGHT_EXPLAINER_KEYS.bullets.map((key) =>
      t(key, 'Strokes gained vs players at your level'),
    ),
    categoriesLine: t(
      SG_LIGHT_EXPLAINER_KEYS.categoriesLine,
      'Covers Tee, Approach, Short Game, and Putting.',
    ),
    confidenceLine: t(
      SG_LIGHT_EXPLAINER_KEYS.confidenceLine,
      'Needs enough shots in each category to be confident.',
    ),
  };
}
