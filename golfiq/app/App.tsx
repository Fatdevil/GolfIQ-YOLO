import React, { useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import CalibrateScreen from './src/screens/CalibrateScreen';
import RecordSwingScreen from './src/screens/RecordSwingScreen';
import CameraInferScreen from './src/screens/CameraInferScreen';

export default function App(){
  const [tab, setTab] = useState<'cal'|'rec'|'cam'>('cal');
  return (
    <SafeAreaView style={{flex:1}}>
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
      <ScrollView contentContainerStyle={{padding:16}}>
        {tab==='cal' ? <CalibrateScreen/> : tab==='rec' ? <RecordSwingScreen/> : <CameraInferScreen/>}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  tabs:{flexDirection:'row', borderBottomWidth:1, borderColor:'#ddd'},
  tab:{flex:1, padding:12, alignItems:'center'},
  tabActive:{borderBottomWidth:3, borderColor:'#111'},
  tabText:{fontWeight:'600'}
});
