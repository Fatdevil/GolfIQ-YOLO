import React, { useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import CalibrateScreen from './src/screens/CalibrateScreen';
import RecordSwingScreen from './src/screens/RecordSwingScreen';
import CameraInferScreen from './src/screens/CameraInferScreen';
import FeedbackModal from './src/components/FeedbackModal';
import { QaSummaryProvider } from './src/context/QaSummaryContext';

export default function App(){
  const [tab, setTab] = useState<'cal'|'rec'|'cam'>('cal');
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
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
          </View>
          <TouchableOpacity style={styles.feedbackButton} onPress={()=>setFeedbackOpen(true)}>
            <Text style={styles.feedbackText}>Feedback</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{padding:16}}>
          {tab==='cal' ? <CalibrateScreen/> : tab==='rec' ? <RecordSwingScreen/> : <CameraInferScreen/>}
        </ScrollView>
        <FeedbackModal visible={feedbackOpen} onClose={()=>setFeedbackOpen(false)} />
      </SafeAreaView>
    </QaSummaryProvider>
  );
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
