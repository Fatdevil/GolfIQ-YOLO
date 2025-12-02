import { getItem, setItem } from '@app/storage/asyncStorage';

export type ShotShapeIntent = 'fade' | 'draw' | 'straight';
export type RiskProfile = 'safe' | 'normal' | 'aggressive';

export interface CaddieSettings {
  stockShape: ShotShapeIntent;
  riskProfile: RiskProfile;
}

export const DEFAULT_SETTINGS: CaddieSettings = {
  stockShape: 'straight',
  riskProfile: 'normal',
};

const STORAGE_KEY = 'golfiq.caddie.settings.v1';

function isShotShapeIntent(value: unknown): value is ShotShapeIntent {
  return value === 'fade' || value === 'draw' || value === 'straight';
}

function isRiskProfile(value: unknown): value is RiskProfile {
  return value === 'safe' || value === 'normal' || value === 'aggressive';
}

export async function loadCaddieSettings(): Promise<CaddieSettings> {
  try {
    const raw = await getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw);
    const stockShape = isShotShapeIntent(parsed?.stockShape) ? parsed.stockShape : DEFAULT_SETTINGS.stockShape;
    const riskProfile = isRiskProfile(parsed?.riskProfile) ? parsed.riskProfile : DEFAULT_SETTINGS.riskProfile;

    return { stockShape, riskProfile } satisfies CaddieSettings;
  } catch (error) {
    console.warn('[caddie] Failed to load settings', error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveCaddieSettings(settings: CaddieSettings): Promise<void> {
  try {
    await setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[caddie] Failed to save settings', error);
  }
}

export { STORAGE_KEY };
