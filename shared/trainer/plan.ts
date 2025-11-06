import { type GoldenSnapshot, type GoldenMetricKey, type WeeklyPlan } from './types';

type DrillPack = {
  drills: string[];
  notes: string[];
};

const DEFAULT_SESSIONS = 3;
const MAX_FOCUS = 2;

const DRILL_LIBRARY: Record<GoldenMetricKey, DrillPack> = {
  startLine: {
    drills: ['Start line gates', 'Alignment stick ladder'],
    notes: ['Gate the start line within 1°', 'Match face to aim at setup'],
  },
  faceToPathIdx: {
    drills: ['Face/path mirror reps', 'Fade-draw windows'],
    notes: ['Hold face 1° closer to path', 'Match curve shape to aim'],
  },
  tempo: {
    drills: ['Tempo 3:1 metronome', 'Counted rehearsal swings'],
    notes: ['Hear “1-2-3” to the top, “4” to impact', 'Match backswing pause across reps'],
  },
  lowPointSign: {
    drills: ['Low-point towel drill', 'Brush-the-grass swings'],
    notes: ['Clip the turf ahead of the ball', 'Shift pressure lead side before impact'],
  },
  launchProxy: {
    drills: ['Launch window ladder', 'Trajectory stick checkpoints'],
    notes: ['Match launch to club family window', 'Use half swings to control launch'],
  },
  dynLoftProxy: {
    drills: ['Shaft lean rehearsals', 'Punch-out distance control'],
    notes: ['Preset handle forward by 2°', 'Maintain hands ahead through strike'],
  },
};

type MetricAggregate = {
  key: GoldenMetricKey;
  poor: number;
  total: number;
};

function emptyAggregate(key: GoldenMetricKey): MetricAggregate {
  return { key, poor: 0, total: 0 };
}

function pickFocusKeys(aggregates: MetricAggregate[]): GoldenMetricKey[] {
  const weighted = aggregates
    .filter((item) => item.total > 0)
    .map((item) => ({ key: item.key, score: item.poor / item.total }))
    .sort((a, b) => b.score - a.score);

  const focus: GoldenMetricKey[] = [];
  for (const entry of weighted) {
    if (focus.includes(entry.key)) {
      continue;
    }
    if (focus.length >= MAX_FOCUS) {
      break;
    }
    if (entry.score <= 0) {
      continue;
    }
    focus.push(entry.key);
  }

  if (focus.length > 0) {
    return focus;
  }
  const fallback: GoldenMetricKey[] = ['startLine', 'tempo'];
  return fallback.slice(0, MAX_FOCUS);
}

function sessionTitle(index: number): string {
  return `Session ${index + 1}`;
}

function collectSessionContent(
  focus: GoldenMetricKey[],
  index: number,
): { drills: string[]; notes: string[] } {
  const primary = focus[index % focus.length] ?? 'startLine';
  const secondary = focus.length > 1 ? focus[(index + 1) % focus.length] : null;
  const packs: DrillPack[] = [DRILL_LIBRARY[primary]];
  if (secondary) {
    packs.push(DRILL_LIBRARY[secondary]);
  }
  const drills: string[] = [];
  const notes: string[] = [];
  packs.forEach((pack, packIndex) => {
    if (!pack) {
      return;
    }
    if (packIndex === 0) {
      drills.push(...pack.drills.slice(0, 2));
      notes.push(...pack.notes.slice(0, 2));
    } else {
      drills.push(pack.drills[0]);
      notes.push(pack.notes[0]);
    }
  });
  return {
    drills: Array.from(new Set(drills)).slice(0, 4),
    notes: Array.from(new Set(notes)).slice(0, 4),
  };
}

export function generateWeeklyPlan(
  snapshots: GoldenSnapshot[],
  options?: { sessions?: number },
): WeeklyPlan {
  const sessionCount = Math.max(1, Math.floor(options?.sessions ?? DEFAULT_SESSIONS));
  const aggregates = (Object.keys(DRILL_LIBRARY) as GoldenMetricKey[]).map((key) => emptyAggregate(key));

  for (const snapshot of snapshots ?? []) {
    if (!snapshot || !Array.isArray(snapshot.metrics)) {
      continue;
    }
    for (const metric of snapshot.metrics) {
      const aggregate = aggregates.find((entry) => entry.key === metric.key);
      if (!aggregate) {
        continue;
      }
      aggregate.total += 1;
      if (metric.quality === 'poor') {
        aggregate.poor += 1;
      }
    }
  }

  const focus = pickFocusKeys(aggregates);
  const sessions: WeeklyPlan['sessions'] = [];
  for (let i = 0; i < sessionCount; i += 1) {
    const { drills, notes } = collectSessionContent(focus, i);
    sessions.push({
      title: sessionTitle(i),
      drills,
      targetNotes: notes,
    });
  }

  return {
    focus,
    sessions,
  };
}
