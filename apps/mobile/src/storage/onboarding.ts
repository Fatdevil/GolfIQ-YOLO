import { getItem, setItem } from '@app/storage/asyncStorage';

const KEY = 'onboarding/completed';

export async function getHasCompletedOnboarding(): Promise<boolean> {
  const value = await getItem(KEY);
  return value === 'true';
}

export async function setHasCompletedOnboarding(value: boolean): Promise<void> {
  await setItem(KEY, value ? 'true' : 'false');
}
