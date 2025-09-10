import React, {useEffect, useRef, useState} from 'react';
import { View, Text, Button, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Camera } from 'expo-camera';
import MetricCard from '../components/MetricCard';
import QualityBadge from '../components/QualityBadge';
import CalibrationOverlay from '../components/CalibrationOverlay';
import QualityBanner from '../components/QualityBanner';
import { useFps } from '../hooks/useFps';
import { inferWithFrames, coachFeedback, Meta } from '../lib/api';

export default function CameraInferScreen(){
  const cameraRef = useRef<Camera | null>(null);
  const [perm, requestPerm] = Camera.useCameraPermissions();
  const { fps: fpsClient, tick } = useFps();
  const [fpsInput, setFpsInput] = useState('120');
  const [scale, setScale] = useState('0.002');
  const [modelPath, setModelPath] = useState('/abs/path/to/yolov8n.pt');
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<'short'|'detailed'|'drill'>('short');
  const [coachText, setCoachText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(()=>{
    if(!perm || !perm.granted) requestPerm();
  },[]);

  const captureBurst = async () => {
    if(!cameraRef.current) return [];
    const frames:any[] = [];
    for(let i=0;i<12;i++){
      const img = await cameraRef.current.takePictureAsync({base64:true, quality:0.9, skipProcessing:true});
      tick();
      frames.push({ image_b64: img.base64 });
    }
    return frames;
  };

  const onAnalyze = async () => {
    setBusy(true); setCoachText(''); setResult(null);
    try{
      const frames = await captureBurst();
      const meta: Meta = { fps: parseFloat(fpsInput)||120, scale_m_per_px: parseFloat(scale)||0.002, calibrated:true, view:'DTL' };
      const yolo = { model_path: modelPath, class_map: {0:'ball',1:'club_head'}, conf:0.25 };
      const r = await inferWithFrames(meta, frames, yolo);
      setResult(r);
    } finally { setBusy(false); }
  };

  const onCoach = async () => {
    if(!result) return;
    const resp = await coachFeedback(mode, result.metrics, '');
    setCoachText(resp.text);
  };

  if(!perm?.granted){
    return <View style={{padding:16}}><Text>Begär kameratillstånd...</Text></View>
  }

  return (
    <ScrollView contentContainerStyle={{padding:16}}>
      <Text style={{fontSize:22, fontWeight:'700', marginBottom:12}}>Kamera → /infer</Text>
      <Camera ref={cameraRef} style={{height:300, borderRadius:12, overflow:'hidden'}}>
        <CalibrationOverlay />
        <QualityBanner quality={result?.quality} fps={fpsClient} />
      </Camera>
      <View style={styles.row}><Text style={styles.label}>FPS</Text><TextInput style={styles.input} value={fpsInput} onChangeText={setFpsInput} keyboardType='numeric'/></View>
      <View style={styles.row}><Text style={styles.label}>m/px</Text><TextInput style={styles.input} value={scale} onChangeText={setScale} keyboardType='numeric'/></View>
      <View style={styles.row}><Text style={styles.label}>YOLO‑modell (server)</Text><TextInput style={[styles.input,{flex:1}]} value={modelPath} onChangeText={setModelPath}/></View>
      <Button title={busy? 'Analyserar...' : 'Fånga & analysera'} onPress={onAnalyze} />

      {result && (
        <View style={{marginTop:16}}>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
            <Text style={{fontSize:16, fontWeight:'600'}}>Resultat</Text>
            <QualityBadge value={result.quality} />
          </View>
          <MetricCard title="Club speed" value={(result.metrics.club_speed_mps*2.23693629).toFixed(1)} unit="mph" />
          <MetricCard title="Ball speed" value={(result.metrics.ball_speed_mps*2.23693629).toFixed(1)} unit="mph" />
          <MetricCard title="Launch" value={result.metrics.launch_deg.toFixed(1)} unit="°" />
          <MetricCard title="Carry" value={(result.metrics.carry_m*1.0936133).toFixed(0)} unit="yd" />

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row:{flexDirection:'row', alignItems:'center', marginTop:8},
  label:{width:120},
  input:{borderWidth:1, borderColor:'#ccc', padding:8, borderRadius:8, width:120, marginLeft:8},
  modes:{flexDirection:'row', marginTop:8, marginBottom:8},
  mode:{paddingVertical:6, paddingHorizontal:10, borderWidth:1, borderColor:'#ddd', borderRadius:8, marginRight:8},
  modeActive:{backgroundColor:'#f1f1f1'},
  coachBox:{marginTop:10, padding:12, borderRadius:10, backgroundColor:'#eef6ff', borderWidth:1, borderColor:'#cfe1ff'}
});
