import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { fmtMeters, fmtPct } from '../../../../shared/caddie/format';
import type { CaddieHudVM } from '../../../../shared/caddie/selectors';

export type CaddieWhySheetProps = {
  visible: boolean;
  hud: CaddieHudVM | null;
  lines?: string[];
  reasons?: Array<{ label: string; value?: number }>;
  onClose: () => void;
};

const CaddieWhySheet: React.FC<CaddieWhySheetProps> = ({ visible, hud, lines = [], reasons = [], onClose }) => {
  const best = hud?.best;
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Why this plan?</Text>
            {best ? (
              <Text style={styles.subtitle}>{`${best.clubId} • ${fmtMeters(best.carry_m)}`}</Text>
            ) : null}
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {lines.length ? (
              lines.map((line, index) => (
                <Text key={`why-line-${index}`} style={styles.line}>
                  {line}
                </Text>
              ))
            ) : (
              <Text style={styles.lineMuted}>No rationale available yet.</Text>
            )}
            {reasons.length ? (
              <View style={styles.reasonGroup}>
                {reasons.map((reason, index) => (
                  <View key={`reason-${index}`} style={styles.reasonRow}>
                    <Text style={styles.reasonLabel}>{reason.label}</Text>
                    {Number.isFinite(reason.value) ? (
                      <Text style={styles.reasonValue}>{fmtPct((reason.value ?? 0))}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonLabel}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    gap: 16,
    borderTopWidth: 1,
    borderColor: '#1e293b',
  },
  header: {
    gap: 4,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: '#bfdbfe',
    fontSize: 14,
  },
  body: {
    maxHeight: 240,
  },
  bodyContent: {
    gap: 10,
    paddingBottom: 8,
  },
  line: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
  },
  lineMuted: {
    color: '#94a3b8',
    fontSize: 14,
  },
  reasonGroup: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 10,
    gap: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reasonLabel: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  reasonValue: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeButtonLabel: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default CaddieWhySheet;
