import type { AdviceCtx as BaseAdviceCtx } from '../caddie/advice';
import type { CoachPersona, TrainingFocus } from '../training/types';

export type AdviceCtx = BaseAdviceCtx & {
  focus?: TrainingFocus;
  persona?: CoachPersona;
};

export interface CoachProvider {
  getPreShotAdvice(ctx: AdviceCtx): string[];
  getPracticePlan?(focus: TrainingFocus): string | null | undefined;
}

export const DefaultCoachProvider: CoachProvider = {
  getPreShotAdvice: () => [],
};

let activeProvider: CoachProvider = DefaultCoachProvider;

export function setCoachProvider(provider?: CoachProvider | null): void {
  activeProvider = provider ?? DefaultCoachProvider;
}

export function getCoachProvider(): CoachProvider {
  return activeProvider;
}
