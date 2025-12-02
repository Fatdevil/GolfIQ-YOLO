import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CaddieDecisionOutput } from '@app/caddie/CaddieDecisionEngine';
import type { CaddieSettings } from '@app/caddie/caddieSettingsStorage';
import { t } from '@app/i18n';

export interface CaddieRecommendationCardProps {
  decision: CaddieDecisionOutput;
  settings: CaddieSettings;
}

function intentLabel(intent: CaddieDecisionOutput['intent']): string {
  return t(`caddie.decision_intent_label.${intent}`);
}

function riskProfileLabel(profile: CaddieSettings['riskProfile']): string {
  return t(`caddie.decision.profile_label.${profile}`);
}

export function CaddieRecommendationCard({ decision, settings }: CaddieRecommendationCardProps): JSX.Element {
  const header = t('caddie.decision.header', {
    club: decision.club,
    intentLabel: intentLabel(decision.intent),
  });
  const playsLike = t('caddie.decision.plays_like', {
    distance: Math.round(decision.playsLikeDistanceM),
  });
  const sourceLabel =
    decision.source === 'manual' ? t('caddie.decision.source_manual') : t('caddie.decision.source_auto');
  const profileLabel = t('caddie.decision.profile_badge', { profile: riskProfileLabel(settings.riskProfile) });
  const core = decision.risk.coreZone;
  const tailLeft = decision.risk.tailLeftProb > 0.01;
  const tailRight = decision.risk.tailRightProb > 0.01;
  const lowSamples = decision.samples < 5;
  const profileHint =
    settings.riskProfile === 'safe'
      ? t('caddie.decision.profile_safe_hint')
      : settings.riskProfile === 'aggressive'
        ? t('caddie.decision.profile_aggressive_hint')
        : null;

  return (
    <View style={styles.card} testID="caddie-recommendation-card">
      <Text style={styles.header}>{header}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{profileLabel}</Text>
      </View>
      <Text style={styles.playsLike}>{playsLike}</Text>
      <Text style={styles.source}>{sourceLabel}</Text>
      {profileHint ? <Text style={styles.hint}>{profileHint}</Text> : null}

      <Text style={styles.sectionTitle}>{t('caddie.decision.core_window', {
        carryMin: Math.round(core.carryMinM),
        carryMax: Math.round(core.carryMaxM),
        sideMin: Math.round(core.sideMinM),
        sideMax: Math.round(core.sideMaxM),
      })}</Text>

      {tailLeft ? (
        <Text style={styles.tailText} testID="caddie-tail-left">
          {t('caddie.decision.tail_left', { percent: Math.round(decision.risk.tailLeftProb * 100) })}
        </Text>
      ) : null}
      {tailRight ? (
        <Text style={styles.tailText} testID="caddie-tail-right">
          {t('caddie.decision.tail_right', { percent: Math.round(decision.risk.tailRightProb * 100) })}
        </Text>
      ) : null}

      {lowSamples ? <Text style={styles.helper}>{t('caddie.decision.low_samples')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0a0a0e',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#202029',
  },
  header: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f2937',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#c2c2d0',
    fontSize: 12,
    fontWeight: '600',
  },
  playsLike: {
    fontSize: 16,
    color: 'white',
  },
  source: {
    fontSize: 14,
    color: '#c2c2d0',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    color: 'white',
  },
  tailText: {
    fontSize: 14,
    color: '#f1c40f',
  },
  hint: {
    color: '#c2c2d0',
    fontSize: 13,
  },
  helper: {
    fontSize: 13,
    color: '#c2c2d0',
    marginTop: 4,
  },
});

export default CaddieRecommendationCard;
