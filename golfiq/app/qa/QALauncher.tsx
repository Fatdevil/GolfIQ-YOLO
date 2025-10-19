import React, { PropsWithChildren, useCallback, useMemo, useState } from 'react';
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
import { isQAMode } from './QAGate';

type QALauncherProps = PropsWithChildren<unknown>;

const OPEN_OPTION = 'Open AR-HUD Overlay';
const CANCEL_OPTION = 'Cancel';

export function QALauncher({ children }: QALauncherProps): React.ReactElement {
  const [showOverlay, setShowOverlay] = useState(false);

  const qaEnabled = useMemo(() => isQAMode(), []);

  const handleOpenOverlay = useCallback(() => {
    setShowOverlay(true);
  }, []);

  const handleCloseOverlay = useCallback(() => {
    setShowOverlay(false);
  }, []);

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

  return (
    <>
      {children}
      <View pointerEvents="box-none" style={styles.launcherContainer}>
        <TouchableOpacity
          accessibilityLabel="Open QA Launcher"
          accessibilityRole="button"
          onPress={presentActionSheet}
          style={styles.launcherButton}
        >
          <Text style={styles.launcherButtonText}>QA</Text>
        </TouchableOpacity>
      </View>
      <Modal
        animationType="slide"
        onRequestClose={handleCloseOverlay}
        transparent={false}
        visible={showOverlay}
      >
        <SafeAreaView style={styles.overlayContainer}>
          <TouchableOpacity
            accessibilityLabel="Close QA Overlay"
            onPress={handleCloseOverlay}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
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
  },
  launcherButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  overlayContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  overlayContent: {
    flex: 1,
  },
});
