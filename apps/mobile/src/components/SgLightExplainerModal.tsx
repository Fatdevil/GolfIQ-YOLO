import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { buildSgLightExplainerCopy, type Translator } from '@shared/sgLightExplainer';

type Props = {
  visible: boolean;
  onClose(): void;
  t: Translator;
};

export function SgLightExplainerModal({ visible, onClose, t }: Props) {
  const copy = buildSgLightExplainerCopy(t);

  return (
    <Modal visible={visible} transparent animationType="fade" testID="sg-light-explainer-modal">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>{copy.heading}</Text>
          <Text style={styles.title}>{copy.title}</Text>
          <View style={styles.bullets}>
            {copy.bullets.map((line, idx) => (
              <Text key={`${idx}-${line}`} style={styles.bullet}>
                • {line}
              </Text>
            ))}
          </View>
          <Text style={styles.body}>{copy.categoriesLine}</Text>
          <Text style={styles.body}>{copy.confidenceLine}</Text>
          <TouchableOpacity
            accessibilityLabel={t('sg_light.explainer.close_label')}
            onPress={onClose}
            style={styles.closeButton}
            testID="close-sg-light-explainer"
          >
            <Text style={styles.closeButtonText}>{t('sg_light.explainer.close_label')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    gap: 10,
  },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  bullets: { gap: 6 },
  bullet: { color: '#111827' },
  body: { color: '#1f2937' },
  closeButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#0f172a',
  },
  closeButtonText: { color: '#fff', fontWeight: '700' },
});
