import React, {useState} from 'react';
import { View, Text, Button } from 'react-native';
import MetricCard from '../components/MetricCard';
import { mpsToMph, metersToYards } from '../lib/units';
import { inferWithDetections, mockDetections, Meta } from '../lib/api';

export default function RecordSwingScreen(){
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string|undefined>();

  const onAnalyze = async () => {
    setLoading(true); setErr(undefined);
    try{
      const meta: Meta = { fps:120, scale_m_per_px:0.002, calibrated:true, view:'DTL' };
      const detections = mockDetections();
      const r = await inferWithDetections(meta, detections);
      setResult(r);
    } catch(e:any){
      setErr(String(e?.message || e));
    } finally { setLoading(false); }
  };

  return (
    <View>
      <Text style={{fontSize:22, fontWeight:'700', marginBottom:12}}>Analys (demo via /infer)</Text>
      <Button title={loading? 'Analyserar...' : 'Kör demo-analys'} onPress={onAnalyze} />
      {err && <Text style={{color:'red', marginTop:8}}>{err}</Text>}
      {result && (
        <View style={{marginTop:16}}>
          <MetricCard title="Club speed" value={mpsToMph(result.metrics.club_speed_mps).toFixed(1)} unit="mph" />
          <MetricCard title="Ball speed" value={mpsToMph(result.metrics.ball_speed_mps).toFixed(1)} unit="mph" />
          <MetricCard title="Launch" value={result.metrics.launch_deg.toFixed(1)} unit="°" />
          <MetricCard title="Carry" value={metersToYards(result.metrics.carry_m).toFixed(0)} unit="yd" />
          <MetricCard title="Quality" value={result.quality} />
        </View>
      )}
    </View>
  );
}
