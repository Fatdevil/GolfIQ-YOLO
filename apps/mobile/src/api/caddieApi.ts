import { apiFetch } from '@app/api/client';

export type ShotShapeIntent = 'fade' | 'draw' | 'straight';

export interface ShotShapeProfile {
  club: string;
  intent: ShotShapeIntent;
  coreCarryMeanM: number;
  coreCarryStdM: number;
  coreSideMeanM: number;
  coreSideStdM: number;
  tailLeftProb: number;
  tailRightProb: number;
}

export async function fetchShotShapeProfile(
  club: string,
  intent: ShotShapeIntent,
): Promise<ShotShapeProfile> {
  const params = new URLSearchParams({ club, intent });
  return apiFetch<ShotShapeProfile>(`/api/caddie/shot-shape-profile?${params.toString()}`);
}
