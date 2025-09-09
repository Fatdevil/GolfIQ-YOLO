import React, {useState} from 'react';
import { View, Text, Button, TouchableOpacity, StyleSheet } from 'react-native';
import MetricCard from '../components/MetricCard';
import QualityBadge from '../components/QualityBadge';
import { mpsToMph, metersToYards } from '../lib/units';
import { inferWithDetections, mockDetections, Meta, coachFeedback } from '../lib/api';

export default function RecordSwingScreen(){
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [coachText, setCoachText] = useState<string>('');
  const [mode, setMode] = useState<'short'|'detailed'|'drill'>('short');

  const onAnalyze = async () => {
    setLoading(true); setCoachText('');
    try{
      const meta: Meta = { fps:120, scale_m_per_px:0.002, calibrated:true, view:'DTL' };
      const detections = mockDetections();
      const r = await inferWithDetections(meta, detections);
      setResult(r);
    } finally { setLoading(false); }
  };

  const onCoach = async () => {
    if(!result) return;
    const resp = await coachFeedback(mode, result.metrics, '');
    setCoachText(resp.text);
  };

  return (
    <View>
      <Text style={{fontSize:22, fontWeight:'700', marginBottom:12}}>Analys (demo via /infer)</Text>
      <Button title={loading? 'Analyserar...' : 'Kör demo-analys'} onPress={onAnalyze} />
      {result && (
        <View style={{marginTop:16}}>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
            <Text style={{fontSize:16, fontWeight:'600'}}>Resultat</Text>
            <QualityBadge value={result.quality} />
          </View>
          <MetricCard title="Club speed" value={mpsToMph(result.metrics.club_speed_mps).toFixed(1)} unit="mph" />
          <MetricCard title="Ball speed" value={mpsToMph(result.metrics.ball_speed_mps).toFixed(1)} unit="mph" />
          <MetricCard title="Launch" value={result.metrics.launch_deg.toFixed(1)} unit="°" />
          <MetricCard title="Carry" value={metersToYards(result.metrics.carry_m).toFixed(0)} unit="yd" />

          <View style={{marginTop:16}}>
            <Text style={{fontSize:16, fontWeight:'600', marginBottom:8}}>Coach</Text>
            <View style={styles.modes}>
              {(['short','detailed','drill'] as const).map(m => (
                <TouchableOpacity key={m} style={[styles.mode, mode===m && styles.modeActive]} onPress={()=>setMode(m)}>
                  <Text style={{fontWeight:'600'}}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title="Få coach-feedback" onPress={onCoach} />
            {!!coachText && <View style={styles.coachBox}><Text>{coachText}</Text></View>}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modes:{flexDirection:'row', marginBottom:8},
  mode:{paddingVertical:6, paddingHorizontal:10, borderWidth:1, borderColor:'#ddd', borderRadius:8, marginRight:8},
  modeActive:{backgroundColor:'#f1f1f1'},
  coachBox:{marginTop:10, padding:12, borderRadius:10, backgroundColor:'#eef6ff', borderWidth:1, borderColor:'#cfe1ff'}
});
