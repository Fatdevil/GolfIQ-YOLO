import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { fmtMeters, fmtPct, nz } from '../../../../shared/caddie/format';
import type { CaddieHudVM } from '../../../../shared/caddie/selectors';

type HudRiskProfile = 'conservative' | 'neutral' | 'aggressive';

export type CaddieHudCardProps = {
  hud: CaddieHudVM;
  onSelect?: () => void;
  onWhy?: () => void;
  disabled?: boolean;
};

const riskLabels: Record<CaddieHudVM['best']['risk'], string> = {
  safe: 'Safe',
  neutral: 'Neutral',
  aggressive: 'Aggressive',
};

const riskBadgeStyles: Record<CaddieHudVM['best']['risk'], { backgroundColor: string; color: string }> = {
  safe: { backgroundColor: '#064e3b', color: '#6ee7b7' },
  neutral: { backgroundColor: '#1e293b', color: '#cbd5f5' },
  aggressive: { backgroundColor: '#7f1d1d', color: '#fca5a5' },
};

const riskProfileLabels: Record<HudRiskProfile, string> = {
  conservative: 'Conservative',
  neutral: 'Neutral',
  aggressive: 'Aggressive',
};

const riskProfileChipStyles: Record<
  HudRiskProfile,
  { backgroundColor: string; borderColor: string; textColor: string }
> = {
  conservative: { backgroundColor: '#052e16', borderColor: '#166534', textColor: '#bbf7d0' },
  neutral: { backgroundColor: '#1e1b4b', borderColor: '#312e81', textColor: '#e0e7ff' },
  aggressive: { backgroundColor: '#450a0a', borderColor: '#991b1b', textColor: '#fecaca' },
};

const clamp01 = (value: number | null | undefined): number | null => {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(1, Math.max(0, Number(value)));
};

const aimLabel = (
  aim: CaddieHudVM['best']['aim'] | undefined,
): string | null => {
  if (!aim || !aim.dir) {
    return null;
  }
  if (aim.dir === 'C') {
    return 'Aim C';
  }
  const offset = Number.isFinite(aim.offset_m) ? Math.round(Number(aim.offset_m)) : null;
  const magnitude = offset !== null ? Math.abs(offset) : null;
  const offsetLabel = magnitude !== null ? `${magnitude}m` : '';
  return `Aim ${aim.dir}${offsetLabel}`;
};

const formatCandidateLabel = (
  candidate: NonNullable<CaddieHudVM['candidates']>[number],
): string => {
  const carryLabel = fmtMeters(candidate.carry_m).replace(/\s*m$/, 'm');
  const sigma = Number.isFinite(candidate.sigma_m)
    ? `±${Math.round(Number(candidate.sigma_m))}m`
    : '';
  return `${candidate.clubId} • ${carryLabel}${sigma ? ` ${sigma}` : ''}`;
};

const buildContextChips = (hud: CaddieHudVM): string[] => {
  const chips: string[] = [];
  const ctx = hud.context ?? {};
  if (Number.isFinite(ctx.wind_mps)) {
    chips.push(`${Math.round(Number(ctx.wind_mps))} m/s wind`);
  }
  if (Number.isFinite(ctx.elevation_m)) {
    const elev = Math.round(Number(ctx.elevation_m));
    chips.push(`${elev >= 0 ? '+' : ''}${elev} m elev`);
  }
  if (Number.isFinite(ctx.temp_c)) {
    chips.push(`${Math.round(Number(ctx.temp_c))}°C`);
  }
  if (Number.isFinite(ctx.hazardLeft)) {
    chips.push(`◀︎ ${fmtPct(nz(ctx.hazardLeft))}`);
  }
  if (Number.isFinite(ctx.hazardRight)) {
    chips.push(`▶︎ ${fmtPct(nz(ctx.hazardRight))}`);
  }
  return chips;
};

const CaddieHudCard: React.FC<CaddieHudCardProps> = ({ hud, onSelect, onWhy, disabled }) => {
  const { best } = hud;
  const total = Number.isFinite(best.total_m) ? Number(best.total_m) : null;
  const aim = aimLabel(best.aim ?? undefined);
  const confidence = clamp01(best.confidence ?? null);
  const riskStyle = riskBadgeStyles[best.risk];
  const contextChips = buildContextChips(hud);
  const riskProfile = hud.context?.riskProfile ?? null;
  const riskProfileStyle = riskProfile ? riskProfileChipStyles[riskProfile] : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.headerIcon}>🏌</Text>
        <Text style={styles.headerClub}>{best.clubId}</Text>
        <Text style={styles.headerCarry}>{fmtMeters(best.carry_m)}</Text>
        {total !== null ? (
          <Text style={styles.headerTotal}>{`(${fmtMeters(total)})`}</Text>
        ) : null}
        {aim ? (
          <View style={styles.aimChip}>
            <Text style={styles.aimChipText}>{aim}</Text>
          </View>
        ) : null}
        {riskProfile && riskProfileStyle ? (
          <View
            style={[
              styles.riskProfileChip,
              {
                backgroundColor: riskProfileStyle.backgroundColor,
                borderColor: riskProfileStyle.borderColor,
              },
            ]}
          >
            <Text style={[styles.riskProfileChipText, { color: riskProfileStyle.textColor }]}>
              {riskProfileLabels[riskProfile]}
            </Text>
          </View>
        ) : null}
        <View style={[styles.riskBadge, { backgroundColor: riskStyle.backgroundColor }]}>
          <Text style={[styles.riskBadgeText, { color: riskStyle.color }]}>{riskLabels[best.risk]}</Text>
        </View>
      </View>
      {confidence !== null ? (
        <Text style={styles.metaText}>Confidence {fmtPct(confidence)}</Text>
      ) : null}
      {hud.candidates && hud.candidates.length > 0 ? (
        <View style={styles.candidatesRow}>
          {hud.candidates.slice(0, 3).map((candidate) => {
            const candidateConfidence = clamp01(candidate.confidence ?? null);
            const confidenceWidth = candidateConfidence !== null ? `${Math.round(candidateConfidence * 100)}%` : '0%';
            return (
              <View key={`${candidate.risk}-${candidate.clubId}`} style={styles.candidateChip}>
                <Text style={styles.candidateText}>{formatCandidateLabel(candidate)}</Text>
                {candidateConfidence !== null ? (
                  <View style={styles.candidateConfidenceTrack}>
                    <View style={[styles.candidateConfidenceFill, { width: confidenceWidth }]} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {contextChips.length ? (
        <View style={styles.contextRow}>
          {contextChips.map((chip) => (
            <View key={chip} style={styles.contextChip}>
              <Text style={styles.contextChipText}>{chip}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={onSelect}
          disabled={disabled}
          style={[styles.primaryButton, disabled ? styles.buttonDisabled : null]}
        >
          <Text style={styles.primaryButtonLabel}>Select</Text>
        </TouchableOpacity>
        {onWhy ? (
          <TouchableOpacity onPress={onWhy} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonLabel}>Why?</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerIcon: {
    fontSize: 18,
  },
  headerClub: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  headerCarry: {
    fontSize: 16,
    fontWeight: '600',
    color: '#bfdbfe',
  },
  headerTotal: {
    fontSize: 14,
    color: '#94a3b8',
  },
  aimChip: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  aimChipText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '600',
  },
  riskProfileChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  riskProfileChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  riskBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaText: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  candidatesRow: {
    gap: 8,
  },
  candidateChip: {
    backgroundColor: '#111c34',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  candidateText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500',
  },
  candidateConfidenceTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
  },
  candidateConfidenceFill: {
    height: 4,
    backgroundColor: '#38bdf8',
  },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  contextChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  contextChipText: {
    color: '#cbd5f5',
    fontSize: 11,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  primaryButtonLabel: {
    color: '#ffffff',
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
  },
  secondaryButtonLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});

export default CaddieHudCard;
