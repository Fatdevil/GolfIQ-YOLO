import type { CoachPersona, Drill, Plan, TrainingFocus, TrainingPack } from './types';

const MAX_FILE_BYTES = 50 * 1024;
const DEFAULT_PACKS_SEGMENTS = ['data', 'training', 'packs'] as const;
const FOCUS_VALUES: readonly TrainingFocus[] = [
  'long-drive',
  'tee',
  'approach',
  'wedge',
  'short',
  'putt',
  'recovery',
];

const FOCUS_SET = new Set<TrainingFocus>(FOCUS_VALUES);

let cache: TrainingPack[] | null = null;
let cacheKey: string | null = null;
let pending: Promise<TrainingPack[]> | null = null;

function isNode(): boolean {
  // Node when process.versions.node exists and global window is absent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeProcess = typeof process !== 'undefined' ? (process as any) : undefined;
  const hasNodeVersion = !!maybeProcess?.versions?.node;
  const hasWindow = typeof globalThis !== 'undefined' && typeof (globalThis as { window?: unknown }).window !== 'undefined';
  return hasNodeVersion && !hasWindow;
}

function getNodeCacheKey(): string {
  if (!isNode()) {
    return 'catalog';
  }
  const override = typeof process !== 'undefined' ? process.env?.TRAINING_PACKS_DIR?.trim() : undefined;
  return `node:${override ?? 'default'}`;
}

type NodeFsLike = {
  stat(path: string): Promise<{ isDirectory(): boolean }>;
  readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>>;
  readFile(path: string, encoding: string): Promise<string>;
};

type NodePathLike = {
  resolve(...pathSegments: string[]): string;
  join(...pathSegments: string[]): string;
};

function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureObject(value: unknown, label: string): Record<string, unknown> {
  assertCondition(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

function ensureString(value: unknown, label: string): string {
  assertCondition(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string`);
  return value.trim();
}

function ensureBoolean(value: unknown, label: string): boolean {
  assertCondition(typeof value === 'boolean', `${label} must be a boolean`);
  return value;
}

function ensureNumber(value: unknown, label: string): number {
  assertCondition(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number`);
  return value;
}

function ensureArray(value: unknown, label: string): unknown[] {
  assertCondition(Array.isArray(value), `${label} must be an array`);
  return value as unknown[];
}

function ensureFocus(value: unknown, label: string): TrainingFocus {
  assertCondition(typeof value === 'string' && FOCUS_SET.has(value as TrainingFocus), `${label} must be a valid TrainingFocus`);
  return value as TrainingFocus;
}

function ensureStyleHints(value: unknown, label: string): CoachPersona['styleHints'] | undefined {
  if (typeof value === 'undefined' || value === null) {
    return undefined;
  }
  const obj = ensureObject(value, label);
  const tone = obj.tone;
  const verbosity = obj.verbosity;
  const result: CoachPersona['styleHints'] = {};
  if (typeof tone !== 'undefined') {
    assertCondition(tone === 'concise' || tone === 'neutral' || tone === 'pep', `${label}.tone must be a valid tone`);
    result.tone = tone;
  }
  if (typeof verbosity !== 'undefined') {
    assertCondition(
      verbosity === 'short' || verbosity === 'normal' || verbosity === 'detailed',
      `${label}.verbosity must be a valid verbosity`,
    );
    result.verbosity = verbosity;
  }
  return Object.keys(result).length ? result : undefined;
}

function ensurePersona(value: unknown, file: string): CoachPersona | undefined {
  if (typeof value === 'undefined' || value === null) {
    return undefined;
  }
  const obj = ensureObject(value, `${file} persona`);
  const allowed = new Set(['id', 'name', 'styleHints', 'focus', 'premium', 'version']);
  for (const key of Object.keys(obj)) {
    assertCondition(allowed.has(key), `Unknown persona field ${key} in ${file}`);
  }
  const persona: CoachPersona = {
    id: ensureString(obj.id, `${file} persona.id`),
    name: ensureString(obj.name, `${file} persona.name`),
    version: ensureString(obj.version, `${file} persona.version`),
    focus: ensureArray(obj.focus, `${file} persona.focus`).map((entry, index) =>
      ensureFocus(entry, `${file} persona.focus[${index}]`),
    ),
  };
  const hints = ensureStyleHints(obj.styleHints, `${file} persona.styleHints`);
  if (hints) {
    persona.styleHints = hints;
  }
  if (typeof obj.premium !== 'undefined') {
    persona.premium = ensureBoolean(obj.premium, `${file} persona.premium`);
  }
  return persona;
}

function ensureTargetMetric(value: unknown, file: string, drillId: string): Drill['targetMetric'] {
  const obj = ensureObject(value, `${file} drills.${drillId}.targetMetric`);
  const allowed = new Set(['type', 'segment']);
  for (const key of Object.keys(obj)) {
    assertCondition(allowed.has(key), `Unknown targetMetric field ${key} in ${file}`);
  }
  const type = ensureString(obj.type, `${file} drills.${drillId}.targetMetric.type`);
  assertCondition(
    type === 'SG' || type === 'dispersion' || type === 'make%' || type === 'speed',
    `${file} drills.${drillId}.targetMetric.type must be SG|dispersion|make%|speed`,
  );
  return {
    type: type as Drill['targetMetric']['type'],
    segment: ensureFocus(obj.segment, `${file} drills.${drillId}.targetMetric.segment`),
  };
}

function ensureDrills(value: unknown, file: string): Drill[] {
  const arr = ensureArray(value, `${file} drills`);
  const drills = arr.map((entry, index) => {
    const obj = ensureObject(entry, `${file} drills[${index}]`);
    const allowed = new Set([
      'id',
      'focus',
      'title',
      'description',
      'estTimeMin',
      'prerequisites',
      'requiredGear',
      'targetMetric',
      'difficulty',
    ]);
    for (const key of Object.keys(obj)) {
      assertCondition(allowed.has(key), `Unknown drill field ${key} in ${file}`);
    }
    const id = ensureString(obj.id, `${file} drills[${index}].id`);
    const drill: Drill = {
      id,
      focus: ensureFocus(obj.focus, `${file} drills.${id}.focus`),
      title: ensureString(obj.title, `${file} drills.${id}.title`),
      description: ensureString(obj.description, `${file} drills.${id}.description`),
      estTimeMin: ensureNumber(obj.estTimeMin, `${file} drills.${id}.estTimeMin`),
      targetMetric: ensureTargetMetric(obj.targetMetric, file, id),
      difficulty: ensureNumber(obj.difficulty, `${file} drills.${id}.difficulty`) as Drill['difficulty'],
    };
    assertCondition(Number.isInteger(drill.estTimeMin) && drill.estTimeMin > 0, `${file} drills.${id}.estTimeMin must be positive integer`);
    assertCondition(
      Number.isInteger(drill.difficulty) && drill.difficulty >= 1 && drill.difficulty <= 5,
      `${file} drills.${id}.difficulty must be between 1-5`,
    );
    if (typeof obj.prerequisites !== 'undefined') {
      drill.prerequisites = ensureArray(obj.prerequisites, `${file} drills.${id}.prerequisites`).map((item, idx) =>
        ensureString(item, `${file} drills.${id}.prerequisites[${idx}]`),
      );
    }
    if (typeof obj.requiredGear !== 'undefined') {
      drill.requiredGear = ensureArray(obj.requiredGear, `${file} drills.${id}.requiredGear`).map((item, idx) =>
        ensureString(item, `${file} drills.${id}.requiredGear[${idx}]`),
      );
    }
    return drill;
  });
  const seen = new Set<string>();
  drills.forEach((drill) => {
    assertCondition(!seen.has(drill.id), `${file} drills contains duplicate id ${drill.id}`);
    seen.add(drill.id);
  });
  drills.sort((a, b) => a.id.localeCompare(b.id));
  return drills;
}

function ensurePlanEntries(value: unknown, file: string, planId: string): Plan['drills'] {
  const arr = ensureArray(value, `${file} plans.${planId}.drills`);
  assertCondition(arr.length > 0, `${file} plans.${planId}.drills must not be empty`);
  return arr.map((entry, index) => {
    const obj = ensureObject(entry, `${file} plans.${planId}.drills[${index}]`);
    const allowed = new Set(['id', 'reps', 'durationMin']);
    for (const key of Object.keys(obj)) {
      assertCondition(allowed.has(key), `Unknown plan drill field ${key} in ${file}`);
    }
    const item = { id: ensureString(obj.id, `${file} plans.${planId}.drills[${index}].id`) } as Plan['drills'][number];
    if (typeof obj.reps !== 'undefined') {
      const reps = ensureNumber(obj.reps, `${file} plans.${planId}.drills[${index}].reps`);
      assertCondition(Number.isInteger(reps) && reps > 0, `${file} plans.${planId}.drills[${index}].reps must be positive integer`);
      item.reps = reps;
    }
    if (typeof obj.durationMin !== 'undefined') {
      const duration = ensureNumber(obj.durationMin, `${file} plans.${planId}.drills[${index}].durationMin`);
      assertCondition(
        Number.isInteger(duration) && duration > 0,
        `${file} plans.${planId}.drills[${index}].durationMin must be positive integer`,
      );
      item.durationMin = duration;
    }
    return item;
  });
}

function ensurePlans(value: unknown, file: string): Plan[] {
  const arr = ensureArray(value, `${file} plans`);
  const plans = arr.map((entry, index) => {
    const obj = ensureObject(entry, `${file} plans[${index}]`);
    const allowed = new Set(['id', 'name', 'focus', 'version', 'drills', 'schedule', 'estTotalMin']);
    for (const key of Object.keys(obj)) {
      assertCondition(allowed.has(key), `Unknown plan field ${key} in ${file}`);
    }
    const id = ensureString(obj.id, `${file} plans[${index}].id`);
    const plan: Plan = {
      id,
      name: ensureString(obj.name, `${file} plans.${id}.name`),
      focus: ensureFocus(obj.focus, `${file} plans.${id}.focus`),
      version: ensureString(obj.version, `${file} plans.${id}.version`),
      drills: ensurePlanEntries(obj.drills, file, id),
    };
    if (typeof obj.schedule !== 'undefined') {
      plan.schedule = ensureString(obj.schedule, `${file} plans.${id}.schedule`);
    }
    if (typeof obj.estTotalMin !== 'undefined') {
      const est = ensureNumber(obj.estTotalMin, `${file} plans.${id}.estTotalMin`);
      assertCondition(Number.isInteger(est) && est > 0, `${file} plans.${id}.estTotalMin must be positive integer`);
      plan.estTotalMin = est;
    }
    return plan;
  });
  const seen = new Set<string>();
  plans.forEach((plan) => {
    assertCondition(!seen.has(plan.id), `${file} plans contains duplicate id ${plan.id}`);
    seen.add(plan.id);
  });
  plans.sort((a, b) => a.id.localeCompare(b.id));
  return plans;
}

async function collectJsonFiles(fs: NodeFsLike, path: NodePathLike, dir: string): Promise<string[]> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch (error) {
    return [];
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectJsonFiles(fs, path, entryPath);
        files.push(...nested);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        files.push(entryPath);
      }
    }),
  );
  files.sort();
  return files;
}

async function readPack(fs: NodeFsLike, filePath: string): Promise<TrainingPack> {
  const content = await fs.readFile(filePath, 'utf-8');
  assertCondition(Buffer.byteLength(content, 'utf-8') <= MAX_FILE_BYTES, `${filePath} exceeds ${MAX_FILE_BYTES} bytes`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${filePath}: ${(error as Error).message}`);
  }
  return normalizePack(parsed, filePath);
}

function normalizePack(parsed: unknown, filePath: string): TrainingPack {
  const obj = ensureObject(parsed, filePath);
  const allowed = new Set(['packId', 'version', 'author', 'updatedAt', 'persona', 'drills', 'plans']);
  for (const key of Object.keys(obj)) {
    assertCondition(allowed.has(key), `Unknown field ${key} in ${filePath}`);
  }
  const pack: TrainingPack = {
    packId: ensureString(obj.packId, `${filePath} packId`),
    version: ensureString(obj.version, `${filePath} version`),
    drills: ensureDrills(obj.drills, filePath),
    plans: ensurePlans(obj.plans, filePath),
  };
  const persona = ensurePersona(obj.persona, filePath);
  if (persona) {
    pack.persona = persona;
  }
  if (typeof obj.author !== 'undefined') {
    pack.author = ensureString(obj.author, `${filePath} author`);
  }
  if (typeof obj.updatedAt !== 'undefined') {
    pack.updatedAt = ensureString(obj.updatedAt, `${filePath} updatedAt`);
  }
  return pack;
}

async function loadFromNodeFS(): Promise<TrainingPack[]> {
  const [{ promises: fsModule }, pathModule] = await Promise.all([import('node:fs'), import('node:path')]);
  const fs = fsModule as unknown as NodeFsLike;
  const path = pathModule as unknown as NodePathLike;
  const override = typeof process !== 'undefined' ? process.env?.TRAINING_PACKS_DIR?.trim() : undefined;
  const root = override && override.length
    ? path.resolve(override)
    : path.resolve(process.cwd(), ...DEFAULT_PACKS_SEGMENTS);
  const files = await collectJsonFiles(fs, path, root);
  if (!files.length) {
    return [];
  }
  const packs = await Promise.all(files.map((file) => readPack(fs, file)));
  packs.sort((a, b) => a.packId.localeCompare(b.packId));
  return packs;
}

async function loadFromCatalog(): Promise<TrainingPack[]> {
  try {
    const catalogModule: unknown = await import('../../data/training/catalog.json');
    const catalog = (catalogModule as { default?: unknown }).default ?? catalogModule;
    const catalogObj = ensureObject(catalog, 'catalog');
    const entries = ensureArray(catalogObj.packs, 'catalog.packs');
    const packs: TrainingPack[] = [];
    for (const entry of entries) {
      if (!entry) {
        continue;
      }
      const entryObj = ensureObject(entry, 'catalog.pack');
      const packIdRaw = entryObj.packId;
      if (typeof packIdRaw !== 'string' || !packIdRaw.trim()) {
        continue;
      }
      const moduleIdRaw = entryObj.module;
      const moduleId = typeof moduleIdRaw === 'string' && moduleIdRaw.trim().length ? moduleIdRaw.trim() : packIdRaw.trim();
      try {
        const packModule: unknown = await import(
          /* @vite-ignore */ `../../data/training/packs/${moduleId}.json`
        );
        const packValue = (packModule as { default?: unknown }).default ?? packModule;
        const normalized = normalizePack(packValue, `catalog:${packIdRaw}`);
        packs.push(normalized);
      } catch (error) {
        // ignore missing pack modules in web builds to keep surface resilient
        continue;
      }
    }
    packs.sort((a, b) => a.packId.localeCompare(b.packId));
    return packs;
  } catch (error) {
    return [];
  }
}

export function clearTrainingPackCache(): void {
  cache = null;
  cacheKey = null;
  pending = null;
}

export async function loadTrainingPacks(): Promise<TrainingPack[]> {
  const key = getNodeCacheKey();
  if (cache && cacheKey === key) {
    return cache;
  }
  if (pending) {
    return pending;
  }
  const loader = isNode() ? loadFromNodeFS : loadFromCatalog;
  pending = loader()
    .then((packs) => {
      cache = packs;
      cacheKey = key;
      return packs;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

function focusSorter(a: Plan | Drill, b: Plan | Drill): number {
  return a.id.localeCompare(b.id);
}

export function getPlansByFocus(focus: TrainingFocus): Plan[] {
  if (!cache) {
    throw new Error('Training packs not loaded; call loadTrainingPacks() first');
  }
  const plans = cache.flatMap((pack) => pack.plans.filter((plan) => plan.focus === focus));
  return plans
    .map((plan) => ({ ...plan, drills: plan.drills.map((item) => ({ ...item })) }))
    .sort((a, b) => a.name.localeCompare(b.name) || focusSorter(a, b));
}

export function getDrillsByFocus(focus: TrainingFocus): Drill[] {
  if (!cache) {
    throw new Error('Training packs not loaded; call loadTrainingPacks() first');
  }
  const drills = cache.flatMap((pack) => pack.drills.filter((drill) => drill.focus === focus));
  return drills.map((drill) => ({ ...drill, prerequisites: drill.prerequisites?.slice(), requiredGear: drill.requiredGear?.slice() })).sort(focusSorter);
}
