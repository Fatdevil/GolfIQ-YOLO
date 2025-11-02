import React, { useEffect, useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import CalibrateScreen from './src/screens/CalibrateScreen';
import RecordSwingScreen from './src/screens/RecordSwingScreen';
import CameraInferScreen from './src/screens/CameraInferScreen';
import AboutDiagnostics from './src/screens/AboutDiagnostics';
import FeedbackModal from './src/components/FeedbackModal';
import { QaSummaryProvider } from './src/context/QaSummaryContext';
import QAArHudScreen from './src/screens/QAArHudScreen';
import QABenchScreen from './src/screens/QABenchScreen';
import FollowScreen from './src/screens/FollowScreen';
import EventDashboardScreen from './src/screens/EventDashboardScreen';
import { qaHudEnabled } from '../../shared/arhud/native/qa_gate';
import { cleanupDispersionV1 } from '../../shared/caddie/migrations';
import { QALauncher } from './qa/QALauncher';
import { isQAMode } from './qa/QAGate';
import { initWatchIMUReceiver, teardownWatchIMUReceiver } from './src/bridge/WatchBridge+Sense';

type TabKey = 'cal' | 'rec' | 'cam' | 'follow' | 'event' | 'about' | 'qaHud' | 'qaBench';

export default function App(){
  const qaEnabled = qaHudEnabled();
  const [tab, setTab] = useState<TabKey>('cal');
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    // fire-and-forget; idempotent via cleanup flag
    cleanupDispersionV1().catch(() => {});
  }, []);

  useEffect(() => {
    initWatchIMUReceiver();
    return () => {
      teardownWatchIMUReceiver();
    };
  }, []);

  useEffect(() => {
    if (!qaEnabled && (tab === 'qaHud' || tab === 'qaBench')) {
      setTab('cal');
    }
  }, [qaEnabled, tab]);

  const qaTabs: { key: TabKey; label: string }[] = qaEnabled
    ? [
        { key: 'qaHud', label: 'QA HUD' },
        { key: 'qaBench', label: 'QA Bench' },
      ]
    : [];

  const renderTab = () => {
    switch (tab) {
      case 'cal':
        return <CalibrateScreen/>;
      case 'rec':
        return <RecordSwingScreen/>;
      case 'cam':
        return <CameraInferScreen/>;
      case 'follow':
        return <FollowScreen/>;
      case 'event':
        return <EventDashboardScreen/>;
      case 'about':
        return <AboutDiagnostics/>;
      case 'qaHud':
        return <QAArHudScreen/>;
      case 'qaBench':
        return <QABenchScreen/>;
      default:
        return <CalibrateScreen/>;
    }
  };

  const appRoot = (
    <QaSummaryProvider>
      <SafeAreaView style={{flex:1}}>
        <View style={styles.topBar}>
          <View style={styles.tabs}>
            <TouchableOpacity onPress={()=>setTab('cal')} style={[styles.tab, tab==='cal' && styles.tabActive]}>
              <Text style={styles.tabText}>Kalibrera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setTab('rec')} style={[styles.tab, tab==='rec' && styles.tabActive]}>
              <Text style={styles.tabText}>Analys (demo)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setTab('cam')} style={[styles.tab, tab==='cam' && styles.tabActive]}>
              <Text style={styles.tabText}>Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setTab('follow')} style={[styles.tab, tab==='follow' && styles.tabActive]}>
              <Text style={styles.tabText}>Follow</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setTab('about')} style={[styles.tab, tab==='about' && styles.tabActive]}>
              <Text style={styles.tabText}>About</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setTab('event')} style={[styles.tab, tab==='event' && styles.tabActive]}>
              <Text style={styles.tabText}>Events</Text>
            </TouchableOpacity>
            {qaTabs.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                onPress={() => setTab(key)}
                style={[styles.tab, tab===key && styles.tabActive]}
              >
                <Text style={styles.tabText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.feedbackButton} onPress={()=>setFeedbackOpen(true)}>
            <Text style={styles.feedbackText}>Feedback</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{padding:16}}>
          {renderTab()}
        </ScrollView>
        <FeedbackModal visible={feedbackOpen} onClose={()=>setFeedbackOpen(false)} />
      </SafeAreaView>
    </QaSummaryProvider>
  );

  if (isQAMode()) {
    return <QALauncher>{appRoot}</QALauncher>;
  }

  return appRoot;
}
const styles = StyleSheet.create({
  topBar:{flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderBottomWidth:1, borderColor:'#ddd', paddingHorizontal:8},
  tabs:{flexDirection:'row', flex:1},
  tab:{flex:1, padding:12, alignItems:'center'},
  tabActive:{borderBottomWidth:3, borderColor:'#111'},
  tabText:{fontWeight:'600'},
  feedbackButton:{paddingHorizontal:12, paddingVertical:8, borderRadius:999, backgroundColor:'#111', marginLeft:12},
  feedbackText:{color:'#fff', fontWeight:'600'}
});
