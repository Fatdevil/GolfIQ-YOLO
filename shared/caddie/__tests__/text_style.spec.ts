import { describe, expect, it } from 'vitest';

import { caddieTipToText } from '../text';
import { defaultCoachStyle, type CoachStyle } from '../style';
import type { ShotPlan } from '../strategy';

const basePlan: ShotPlan = {
  kind: 'approach',
  club: '6i',
  target: { lat: 0, lon: 0 },
  aimDeg: 1.8,
  aimDirection: 'LEFT',
  reason: 'Håll dig vänster om bunkern.',
  risk: 0.12,
  landing: { distance_m: 148.4, lateral_m: 0 },
  aim: { lateral_m: 0 },
  mode: 'normal',
  carry_m: 148.4,
  crosswind_mps: 1.1,
  headwind_mps: -0.3,
  windDrift_m: 0.6,
  tuningActive: true,
};

describe('caddieTipToText with coach style', () => {
  it('concise short returns one line with key fields', () => {
    const style: CoachStyle = {
      ...defaultCoachStyle,
      tone: 'concise',
      verbosity: 'short',
      language: 'sv',
      format: 'text',
      emoji: false,
    };
    const lines = caddieTipToText(basePlan, undefined, style);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toContain('6i');
    expect(line).toContain('148');
    expect(line.toLowerCase()).toContain('sikta');
  });

  it('pep detailed returns multiple lines with pep token', () => {
    const style: CoachStyle = {
      ...defaultCoachStyle,
      tone: 'pep',
      verbosity: 'detailed',
      language: 'en',
      format: 'text',
      emoji: true,
    };
    const lines = caddieTipToText(basePlan, undefined, style);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.some((line) => line.includes("Let's go") || line.includes('🔥'))).toBe(true);
  });

  it('pep short includes pep intro plus concise instructions', () => {
    const style: CoachStyle = {
      ...defaultCoachStyle,
      tone: 'pep',
      verbosity: 'short',
      language: 'sv',
      format: 'text',
      emoji: true,
    };
    const lines = caddieTipToText(basePlan, undefined, style);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toMatch(/6i/);
    expect(line).toMatch(/\b\d+ m/);
    expect(line).toMatch(/\d+\.\d°/);
    expect(line).toMatch(/\d+%/);
  });

  it('language toggle switches aim verb', () => {
    const swedish: CoachStyle = {
      ...defaultCoachStyle,
      tone: 'neutral',
      verbosity: 'normal',
      language: 'sv',
      format: 'text',
      emoji: false,
    };
    const english: CoachStyle = {
      ...defaultCoachStyle,
      tone: 'neutral',
      verbosity: 'normal',
      language: 'en',
      format: 'text',
      emoji: false,
    };
    const svLines = caddieTipToText(basePlan, undefined, swedish);
    const enLines = caddieTipToText(basePlan, undefined, english);
    expect(svLines[0].toLowerCase()).toContain('sikta');
    expect(enLines[0].toLowerCase()).toContain('aim');
  });
});
