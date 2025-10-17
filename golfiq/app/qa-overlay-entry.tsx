import { registerRootComponent } from 'expo';
import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';

import QAArHudOverlayScreen from './src/screens/QAArHudOverlayScreen';

const Root: React.FC = () => (
  <SafeAreaView style={styles.container}>
    <StatusBar barStyle="light-content" />
    <QAArHudOverlayScreen />
  </SafeAreaView>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
});

registerRootComponent(Root);
