import type { GoldenMetricKey } from './types';

export type DrillPack = {
  drills: string[];
  notes: string[];
};

export const GOLDEN6_DRILL_LIBRARY: Record<GoldenMetricKey, DrillPack> = {
  startLine: {
    drills: ['Start line gates', 'Alignment stick ladder', 'Gate release tempo'],
    notes: ['Gate the start line within 1°', 'Match face to aim at setup'],
  },
  faceToPathIdx: {
    drills: ['Face/path mirror reps', 'Fade-draw windows', 'Lead hand roll timing'],
    notes: ['Hold face 1° closer to path', 'Match curve shape to aim'],
  },
  tempo: {
    drills: ['Tempo 3:1 metronome', 'Counted rehearsal swings', 'Step-change cadence'],
    notes: ['Hear “1-2-3” to the top, “4” to impact', 'Match backswing pause across reps'],
  },
  lowPointSign: {
    drills: ['Low-point towel drill', 'Brush-the-grass swings', 'Pressure shift rehearsals'],
    notes: ['Clip the turf ahead of the ball', 'Shift pressure lead side before impact'],
  },
  launchProxy: {
    drills: ['Launch window ladder', 'Trajectory stick checkpoints', 'Half-swing launch match'],
    notes: ['Match launch to club family window', 'Use half swings to control launch'],
  },
  dynLoftProxy: {
    drills: ['Shaft lean rehearsals', 'Punch-out distance control', 'Trail wrist hinge holds'],
    notes: ['Preset handle forward by 2°', 'Maintain hands ahead through strike'],
  },
};
