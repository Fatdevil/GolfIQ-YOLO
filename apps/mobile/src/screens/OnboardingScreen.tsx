import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { setHasCompletedOnboarding } from '@app/storage/onboarding';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

function completeOnboarding(
  navigation: Props['navigation'],
  next: keyof RootStackParamList,
  params?: Record<string, unknown>,
) {
  Promise.resolve(setHasCompletedOnboarding(true)).catch(() => undefined);
  navigation.replace(next as any, params as any);
}

export default function OnboardingScreen({ navigation }: Props): JSX.Element {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.title}>{t('onboarding_title_1')}</Text>
        <Text style={styles.body}>{t('onboarding_body_1')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>{t('onboarding_title_2')}</Text>
        <Text style={styles.body}>{t('onboarding_body_2')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>{t('onboarding_title_3')}</Text>
        <Text style={styles.body}>{t('onboarding_body_3')}</Text>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => completeOnboarding(navigation, 'DemoExperience')}
        testID="onboarding-try-demo"
      >
        <Text style={styles.primaryText}>{t('onboarding_try_demo_button')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => completeOnboarding(navigation, 'HomeDashboard')}
        testID="onboarding-go-dashboard"
      >
        <Text style={styles.secondaryText}>{t('onboarding_go_dashboard_button')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1224' },
  content: { padding: 24, gap: 20, alignItems: 'center' },
  section: { backgroundColor: '#111827', borderRadius: 12, padding: 16, gap: 6, width: '100%' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  body: { color: '#cbd5e1', fontSize: 15 },
  primaryButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  primaryText: { color: '#0b1224', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    borderColor: '#334155',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  secondaryText: { color: '#e2e8f0', fontWeight: '700', fontSize: 16 },
});
