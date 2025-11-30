import { getItem, removeItem, setItem } from '@app/storage/asyncStorage';

export interface TrainingGoal {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

const TRAINING_GOAL_KEY = 'golfiq.range.trainingGoal.current.v1';

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}`;
}

export async function loadCurrentTrainingGoal(): Promise<TrainingGoal | null> {
  const raw = await getItem(TRAINING_GOAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.text === 'string' && typeof parsed.createdAt === 'string') {
      return parsed as TrainingGoal;
    }
  } catch (error) {
    console.warn('[range] Failed to parse training goal', error);
  }
  return null;
}

export async function saveCurrentTrainingGoal(text: string): Promise<TrainingGoal | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    await clearCurrentTrainingGoal();
    return null;
  }

  const existing = await loadCurrentTrainingGoal();
  const now = new Date().toISOString();
  const goal: TrainingGoal = existing
    ? {
        ...existing,
        text: trimmed,
        updatedAt: now,
      }
    : {
        id: createId(),
        text: trimmed,
        createdAt: now,
      };

  await setItem(TRAINING_GOAL_KEY, JSON.stringify(goal));
  return goal;
}

export async function clearCurrentTrainingGoal(): Promise<void> {
  await removeItem(TRAINING_GOAL_KEY);
}

export { TRAINING_GOAL_KEY };
