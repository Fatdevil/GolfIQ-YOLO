import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { t } from '@app/i18n';
import type { RangeSessionStory } from '@app/range/rangeSessionStory';

interface Props {
  story: RangeSessionStory;
}

export function RangeSessionStoryCard({ story }: Props): JSX.Element {
  return (
    <View style={styles.card} testID="range-session-story">
      <Text style={styles.title}>{t(story.titleKey)}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('range.story.section_strengths')}</Text>
        {story.strengths.map((key) => (
          <View key={key} style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.body}>{t(key)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('range.story.section_focus')}</Text>
        {story.improvements.map((key) => (
          <View key={key} style={styles.bulletRow}>
            <Text style={[styles.bullet, styles.focusBullet]}>•</Text>
            <Text style={styles.body}>{t(key)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0B1524',
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bullet: {
    color: '#10B981',
    fontSize: 14,
    lineHeight: 22,
  },
  focusBullet: {
    color: '#2563EB',
  },
  body: {
    flex: 1,
    color: '#1F2937',
    lineHeight: 20,
  },
});
