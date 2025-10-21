import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import QAArHudOverlayScreen from '../src/screens/QAArHudOverlayScreen';
import type { UploadQueueSummary } from '../../../shared/runs/uploader';
import {
  getUploadQueueSummary,
  subscribeToUploadQueueSummary,
} from '../../../shared/runs/uploader';
import { subscribeReliabilityEvents } from '../../../shared/reliability/events';
import { isQAMode } from './QAGate';
import ReliabilityStatusRack, { type ReliabilityCard } from './ReliabilityStatusRack';
import submitReliabilityIssueReport from './reportIssue';

type QALauncherProps = PropsWithChildren<unknown>;

const OPEN_OPTION = 'Open AR-HUD Overlay';
const CANCEL_OPTION = 'Cancel';

type ActiveCard = ReliabilityCard & {
  expiresAt: number | null;
  persistent?: boolean;
};

export function QALauncher({ children }: QALauncherProps): React.ReactElement {
  const [showOverlay, setShowOverlay] = useState(false);
  const [queueSummary, setQueueSummary] = useState<UploadQueueSummary | null>(null);
  const [cards, setCards] = useState<ActiveCard[]>([]);
  const [reportingIssue, setReportingIssue] = useState(false);
  const lastFailureTokenRef = useRef<string | null>(null);

  const qaEnabled = useMemo(() => isQAMode(), []);

  const handleOpenOverlay = useCallback(() => {
    setShowOverlay(true);
  }, []);

  const handleCloseOverlay = useCallback(() => {
    setShowOverlay(false);
  }, []);

  const updateOfflineCard = useCallback((summary: UploadQueueSummary) => {
    setCards((previous) => {
      const message = summary.pending > 0
        ? `${summary.pending} upload${summary.pending === 1 ? '' : 's'} queued`
        : 'Uploads will resume automatically when back online.';
      const existingIndex = previous.findIndex((card) => card.id === 'offline');
      if (summary.offline) {
        if (existingIndex >= 0) {
          const next = [...previous];
          next[existingIndex] = { ...next[existingIndex], message };
          return next;
        }
        return [
          {
            id: 'offline',
            title: 'Offline mode',
            message,
            tone: 'warning',
            persistent: true,
            expiresAt: null,
          },
          ...previous,
        ];
      }
      if (existingIndex >= 0) {
        return previous.filter((card) => card.id !== 'offline');
      }
      return previous;
    });
  }, []);

  const handleQueueSummary = useCallback(
    (summary: UploadQueueSummary) => {
      setQueueSummary(summary);
      updateOfflineCard(summary);
      const now = Date.now();
      setCards((prev) =>
        prev.filter((card) => card.persistent || !card.expiresAt || card.expiresAt > now),
      );
      if (summary.lastFailureToken && summary.lastFailureToken !== lastFailureTokenRef.current && summary.lastError) {
        lastFailureTokenRef.current = summary.lastFailureToken;
        setCards((prev) => [
          {
            id: `upload-failure-${summary.lastFailureToken}`,
            title: 'Upload retry scheduled',
            message: summary.lastError ?? 'Retrying upload shortly.',
            tone: 'warning',
            expiresAt: Date.now() + 8_000,
          },
          ...prev.filter((card) => !card.id.startsWith('upload-failure')),
        ]);
      } else if (!summary.lastFailureToken) {
        lastFailureTokenRef.current = null;
      }
    },
    [updateOfflineCard],
  );

  useEffect(() => {
    let cancelled = false;
    getUploadQueueSummary()
      .then((initial) => {
        if (!cancelled && initial) {
          handleQueueSummary(initial);
        }
      })
      .catch(() => {});
    const unsubscribe = subscribeToUploadQueueSummary((snapshot) => {
      handleQueueSummary(snapshot);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [handleQueueSummary]);

  useEffect(() => {
    const unsubscribe = subscribeReliabilityEvents((event) => {
      if (event.type === 'model:fallback') {
        setCards((prev) => [
          {
            id: `model-fallback-${event.timestamp}`,
            title: 'Model fallback active',
            message: event.fallbackId
              ? `Using ${event.fallbackId}`
              : 'Reverted to last known good model.',
            tone: 'danger',
            expiresAt: Date.now() + 10_000,
          },
          ...prev.filter((card) => !card.id.startsWith('model-fallback-')),
        ]);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCards((prev) => prev.filter((card) => card.persistent || !card.expiresAt || card.expiresAt > now));
    }, 2_000);
    return () => clearInterval(interval);
  }, []);

  const handleReportIssue = useCallback(async () => {
    if (reportingIssue) {
      return;
    }
    setReportingIssue(true);
    try {
      const result = await submitReliabilityIssueReport();
      const reference = result.id ? `Reference: ${result.id}` : 'Report received.';
      Alert.alert('Issue reported', reference);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit issue report.';
      Alert.alert('Report failed', message);
    } finally {
      setReportingIssue(false);
    }
  }, [reportingIssue]);

  const presentActionSheet = useCallback(() => {
    const canUseActionSheet =
      typeof ActionSheetIOS?.showActionSheetWithOptions === 'function';

    if (canUseActionSheet) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [OPEN_OPTION, CANCEL_OPTION],
          cancelButtonIndex: 1,
          destructiveButtonIndex: undefined,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            handleOpenOverlay();
          }
        },
      );
      return;
    }

    if (Platform.OS === 'android') {
      Alert.alert('QA Launcher', undefined, [
        { text: CANCEL_OPTION, style: 'cancel' },
        { text: OPEN_OPTION, onPress: handleOpenOverlay },
      ]);
      return;
    }

    handleOpenOverlay();
  }, [handleOpenOverlay]);

  if (!qaEnabled) {
    return <>{children}</>;
  }

  const visibleCards = useMemo<ReliabilityCard[]>(
    () => cards.map(({ id, title, message, tone }) => ({ id, title, message, tone })),
    [cards],
  );

  return (
    <>
      {children}
      <View pointerEvents="box-none" style={styles.launcherContainer}>
        <ReliabilityStatusRack cards={visibleCards} />
        <TouchableOpacity
          accessibilityLabel="Open QA Launcher"
          accessibilityRole="button"
          onPress={presentActionSheet}
          style={styles.launcherButton}
        >
          <Text style={styles.launcherButtonText}>QA</Text>
          {queueSummary?.pending ? (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>
                {queueSummary.pending > 9 ? '9+' : String(queueSummary.pending)}
              </Text>
            </View>
          ) : null}
          {queueSummary?.offline && !queueSummary?.pending ? <View style={styles.offlineDot} /> : null}
        </TouchableOpacity>
      </View>
      <Modal
        animationType="slide"
        onRequestClose={handleCloseOverlay}
        transparent={false}
        visible={showOverlay}
      >
        <SafeAreaView style={styles.overlayContainer}>
          <View style={styles.headerActions}>
            <TouchableOpacity
              accessibilityLabel="Close QA Overlay"
              onPress={handleCloseOverlay}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Report issue"
              onPress={handleReportIssue}
              disabled={reportingIssue}
              style={[styles.reportButton, reportingIssue && styles.reportButtonDisabled]}
            >
              <Text style={styles.reportButtonText}>{reportingIssue ? 'Reporting…' : 'Report issue'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.overlayContent}>
            <QAArHudOverlayScreen />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  launcherContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  launcherButton: {
    backgroundColor: '#111',
    borderRadius: 28,
    height: 56,
    width: 56,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    position: 'relative',
  },
  launcherButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  pendingBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: '#E02424',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  offlineDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FBC65B',
  },
  overlayContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3C3C3C',
  },
  closeButtonText: {
    color: '#E5E5E5',
    fontSize: 14,
    fontWeight: '600',
  },
  reportButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FF8A8A',
  },
  reportButtonDisabled: {
    opacity: 0.6,
  },
  reportButtonText: {
    color: '#FFB4B4',
    fontSize: 14,
    fontWeight: '600',
  },
  overlayContent: {
    flex: 1,
  },
});
