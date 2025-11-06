import type { CourseBundle, CourseFeature } from '../../../../../shared/arhud/bundle_client';
import {
  createAutoHole,
  maybeAdvanceOnGreen,
  updateAutoHole,
  type AutoHoleState,
  type CourseRef,
  type HoleRef,
} from '../../../../../shared/arhud/auto_hole_detect';

type LatLon = { lat: number; lon: number };

function toLatLon(value: unknown): LatLon | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

function centroid(points: LatLon[]): LatLon | null {
  if (!points.length) {
    return null;
  }
  const sum = points.reduce(
    (acc, point) => {
      acc.lat += point.lat;
      acc.lon += point.lon;
      return acc;
    },
    { lat: 0, lon: 0 },
  );
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}

function geometryToPoint(geometry: CourseFeature['geometry']): LatLon | null {
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }
  const typeRaw = geometry.type;
  const type = typeof typeRaw === 'string' ? typeRaw.toLowerCase() : '';
  const coords = geometry.coordinates;
  if (!coords) {
    return null;
  }
  if (type === 'point') {
    return toLatLon(coords as unknown[]);
  }
  if (type === 'multipoint' && Array.isArray(coords) && coords.length) {
    return toLatLon((coords as unknown[])[0]);
  }
  if (type === 'linestring' && Array.isArray(coords) && coords.length) {
    return toLatLon((coords as unknown[])[0]);
  }
  if (type === 'multilinestring' && Array.isArray(coords) && coords.length) {
    const firstLine = (coords as unknown[])[0];
    if (Array.isArray(firstLine) && firstLine.length) {
      return toLatLon((firstLine as unknown[])[0]);
    }
  }
  if (type === 'polygon' && Array.isArray(coords) && coords.length) {
    const points: LatLon[] = [];
    for (const ring of coords as unknown[]) {
      if (!Array.isArray(ring)) {
        continue;
      }
      for (const vertex of ring as unknown[]) {
        const point = toLatLon(vertex as unknown[]);
        if (point) {
          points.push(point);
        }
      }
    }
    return centroid(points);
  }
  if (type === 'multipolygon' && Array.isArray(coords) && coords.length) {
    const points: LatLon[] = [];
    for (const polygon of coords as unknown[]) {
      if (!Array.isArray(polygon)) {
        continue;
      }
      for (const ring of polygon as unknown[]) {
        if (!Array.isArray(ring)) {
          continue;
        }
        for (const vertex of ring as unknown[]) {
          const point = toLatLon(vertex as unknown[]);
          if (point) {
            points.push(point);
          }
        }
      }
    }
    return centroid(points);
  }
  return null;
}

function extractHoleNumber(feature: CourseFeature): number | null {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [
    props.hole,
    props.holeId,
    props.hole_id,
    props.holeNo,
    props.hole_no,
    props.number,
    props.num,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
  }
  const rawId = typeof feature.id === 'string' ? feature.id : '';
  const match = rawId.match(/(\d{1,2})/u);
  if (match) {
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
  }
  return null;
}

function classifyFeature(feature: CourseFeature): 'green' | 'tee' | null {
  const tokens: string[] = [];
  const append = (value: unknown) => {
    if (typeof value === 'string' && value) {
      tokens.push(value.toLowerCase());
    }
  };
  append(feature.type);
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  append(props.type);
  append(props.kind);
  append(props.label);
  const joined = tokens.join(' ');
  if (joined.includes('green') || joined.includes('putting')) {
    return 'green';
  }
  if (joined.includes('tee')) {
    return 'tee';
  }
  return null;
}

export function deriveCourseRef(bundle: CourseBundle | null, courseId: string | null): CourseRef | null {
  if (!bundle) {
    return null;
  }
  const holes = new Map<number, HoleRef>();
  for (const feature of bundle.features) {
    if (!feature || typeof feature !== 'object') {
      continue;
    }
    const number = extractHoleNumber(feature);
    if (!number) {
      continue;
    }
    const kind = classifyFeature(feature);
    if (!kind) {
      continue;
    }
    const point = geometryToPoint(feature.geometry);
    if (!point) {
      continue;
    }
    const entry = holes.get(number) ?? { hole: number };
    if (kind === 'green') {
      entry.green = entry.green ?? { mid: point };
    } else if (kind === 'tee') {
      entry.tee = entry.tee ?? point;
    }
    holes.set(number, entry);
  }
  const ordered = [...holes.values()].filter((hole) => hole.green).sort((a, b) => a.hole - b.hole);
  if (!ordered.length) {
    return null;
  }
  return { id: courseId ?? bundle.courseId, holes: ordered };
}

type StateListener = (state: AutoHoleState | null) => void;

export class AutoHoleController {
  private enabled = false;

  private tournamentSafe = false;

  private course: CourseRef | null = null;

  private state: AutoHoleState | null = null;

  constructor(private readonly listener: StateListener) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.emit();
  }

  setTournamentSafe(safe: boolean): void {
    this.tournamentSafe = safe;
  }

  setCourse(course: CourseRef | null, initialHole?: number | null): void {
    this.course = course;
    if (!course) {
      this.state = null;
      this.emit();
      return;
    }
    const hole = initialHole ?? this.state?.hole ?? course.holes[0]?.hole ?? 1;
    this.state = createAutoHole(course, hole);
    this.emit();
  }

  updateFix(fix: { lat: number; lon: number; heading_deg?: number } | null): void {
    if (!this.enabled || !this.course || !fix) {
      return;
    }
    if (!this.state) {
      this.state = createAutoHole(this.course);
    }
    this.state = updateAutoHole(this.state, { course: this.course, fix }, Date.now());
    this.emit();
  }

  handlePutt(onGreen: boolean): void {
    if (!this.enabled || !this.course || !this.state) {
      return;
    }
    if (this.tournamentSafe) {
      return;
    }
    this.state = maybeAdvanceOnGreen(this.state, onGreen, Date.now());
    this.emit();
  }

  manualPrev(): void {
    if (!this.course || !this.state) {
      return;
    }
    const index = this.course.holes.findIndex((hole) => hole.hole === this.state!.hole);
    const prev = index > 0 ? this.course.holes[index - 1]! : this.course.holes[0]!;
    this.applyManual(prev.hole);
  }

  manualNext(): void {
    if (!this.course || !this.state) {
      return;
    }
    const index = this.course.holes.findIndex((hole) => hole.hole === this.state!.hole);
    const next = index >= 0 && index < this.course.holes.length - 1
      ? this.course.holes[index + 1]!
      : this.course.holes[this.course.holes.length - 1]!;
    this.applyManual(next.hole);
  }

  manualUndo(): void {
    if (!this.course || !this.state || !this.state.previousHole) {
      return;
    }
    this.applyManual(this.state.previousHole);
  }

  private applyManual(hole: number): void {
    if (!this.course) {
      return;
    }
    this.state = {
      ...(this.state ?? createAutoHole(this.course, hole)),
      hole,
      previousHole: this.state?.hole ?? null,
      confidence: 0,
      sinceTs: Date.now(),
      candidateHole: null,
      candidateVotes: 0,
      streak: 0,
      reasons: ['manual'],
      onGreen: false,
      nextTeeVotes: 0,
      nextTeeIsClosest: false,
    };
    this.emit();
  }

  private emit(): void {
    this.listener(this.enabled ? this.state : null);
  }
}
