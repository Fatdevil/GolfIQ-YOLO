import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type ReliabilityCard = {
  id: string;
  title: string;
  message?: string | null;
  tone: 'info' | 'warning' | 'danger';
};

type Props = {
  cards: ReliabilityCard[];
};

const toneStyles = {
  info: { backgroundColor: '#1F2A37', borderColor: '#4DA3FF', textColor: '#E5F0FF' },
  warning: { backgroundColor: '#3B2F0E', borderColor: '#FBC65B', textColor: '#FFE9B3' },
  danger: { backgroundColor: '#3B1C1C', borderColor: '#FF7A7A', textColor: '#FFD7D7' },
} as const;

export function ReliabilityStatusRack({ cards }: Props): React.ReactElement | null {
  if (!cards.length) {
    return null;
  }
  return (
    <View pointerEvents="none" style={styles.container}>
      {cards.map((card, index) => {
        const palette = toneStyles[card.tone];
        return (
          <View
            key={card.id}
            style={[
              styles.card,
              index > 0 ? styles.cardSpacing : null,
              { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor },
            ]}
          >
            <Text style={[styles.title, { color: palette.textColor }]}>{card.title}</Text>
            {card.message ? <Text style={[styles.message, { color: palette.textColor }]}>{card.message}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    bottom: 88,
    left: 16,
    alignItems: 'flex-end',
  },
  card: {
    maxWidth: 320,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  cardSpacing: {
    marginTop: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },
});

export default ReliabilityStatusRack;
