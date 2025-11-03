import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { autoQueue } from '../../shotsense/AutoCaptureQueue';
import { guessClub } from '../../shotsense/clubGuess';
import { shotSense } from '../../shotsense/ShotSenseService';
import { RoundRecorder } from '../../../../shared/round/recorder';

export function AutoReviewBanner(): JSX.Element | null {
  const [shot, setShot] = useState(autoQueue.currentShot());

  useEffect(() => {
    return autoQueue.on((event) => {
      if (event.type === 'enqueue') {
        setShot(event.shot ?? undefined);
      }
      if (event.type === 'clear') {
        setShot(undefined);
      }
    });
  }, []);

  if (!shot) {
    return null;
  }

  const suggestion = guessClub(shot);

  const resolveStart = () => {
    if (!shot.start) {
      if (__DEV__) {
        console.warn('[AutoReviewBanner] Missing start position for auto shot');
      }
      return null;
    }
    return { lat: shot.start.lat, lon: shot.start.lon, ts: shot.ts };
  };

  const handleConfirm = (clubCode?: string) => {
    const start = resolveStart();
    if (start) {
      void RoundRecorder.addShot(shot.holeId, {
        kind: 'Full',
        start,
        startLie: shot.lie ?? 'Fairway',
        source: 'auto',
        club: clubCode,
      }).catch((error) => {
        if (__DEV__) {
          console.warn('[AutoReviewBanner] Failed to record auto shot', error);
        }
      });
    }
    try {
      shotSense.hapticsAck?.('confirmed');
    } catch (error) {
      if (__DEV__) {
        console.warn('[AutoReviewBanner] haptics ack failed', error);
      }
    }
    autoQueue.confirm({});
  };

  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <Text style={styles.title}>Shot detected</Text>
        <Text style={styles.sub}>
          strength {shot.strength.toFixed(2)}
          {suggestion?.label ? ` · ${suggestion.label}` : ''}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => handleConfirm(suggestion.code)}>
          <Text style={styles.btn}>ADD</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleConfirm(undefined)}>
          <Text style={styles.btn}>TAG</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            autoQueue.dismiss();
          }}
        >
          <Text style={styles.btnDim}>DISMISS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
    backgroundColor: '#111C',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: { flex: 1 },
  title: { color: '#fff', fontWeight: '600' },
  sub: { color: '#ccc', marginTop: 2, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { color: '#0ff', fontWeight: '700' },
  btnDim: { color: '#aaa', fontWeight: '600' },
});
