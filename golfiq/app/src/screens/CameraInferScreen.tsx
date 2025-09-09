import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button, StyleSheet, TextInput, Alert } from 'react-native';
import { Camera, CameraType, useCameraPermissions } from 'expo-camera';
import type { ImgFrame, Meta, YoloConfig } from '../lib/api';
import { inferWithFrames } from '../lib/api';
import MetricCard from '../components/MetricCard';

export default function CameraInferScreen(){
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [fps, setFps] = useState('120');
  const [scale, setScale] = useState('0.002'); // m/px (kalibrering)
  const [serverModelPath, setServerModelPath] = useState('/abs/path/to/yolov8n.pt');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const cameraRef = useRef<Camera | null>(null);

  useEffect(()=>{
    if (!permission) requestPermission();
  }, [permission]);

  const captureBurst = async (count=12, intervalMs=60): Promise<ImgFrame[]> => {
    const frames: ImgFrame[] = [];
    for(let i=0;i<count;i++){
      try{
        const pic = await cameraRef.current?.takePictureAsync({ base64:true, quality:0.5, skipProcessing:true });
        if (pic?.base64) frames.push({ image_b64: pic.base64 });
      }catch(e){ console.warn('capture error', e); }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return frames;
  };

  const onAnalyze = async () => {
    if (!permission?.granted) { Alert.alert('Kamera', 'Ge kameratillstånd först.'); return; }
    if (!cameraRef.current) { Alert.alert('Kamera', 'Kameran är inte redo.'); return; }
    setBusy(true); setResult(null);
    try{
      const frames = await captureBurst(12, 60);
      if (frames.length < 4) { Alert.alert('Kamera', 'Fick för få bilder. Försök igen.'); setBusy(false); return; }
      const meta: Meta = { fps: parseFloat(fps)||120, scale_m_per_px: parseFloat(scale)||0.002, calibrated:true, view:'DTL' };
      const yolo: YoloConfig = { model_path: serverModelPath, class_map: {0:'ball',1:'club_head'}, conf: 0.25 };
      const r = await inferWithFrames(meta, frames, yolo);
      setResult(r);
    } catch(e:any){
      Alert.alert('Fel vid inferens', String(e?.message || e));
    } finally { setBusy(false); }
  };

  if (!permission) return <View><Text>Kontrollerar kameratillstånd…</Text></View>;
  if (!permission.granted){
    return (
      <View style={{gap:12}}>
        <Text>Vi behöver kameratillstånd för att analysera svingen.</Text>
        <Button title="Ge tillstånd" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.h1}>Kamera → /infer (YOLO på server)</Text>
      <View style={styles.row}>
        <Text style={styles.label}>FPS</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={fps} onChangeText={setFps} />
        <Text style={styles.label}>m/px</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={scale} onChangeText={setScale} />
      </View>
      <View style={{marginTop:8}}>
        <Text style={styles.label}>Serverns YOLO‑modell (sökväg på servern)</Text>
        <TextInput style={[styles.input, {width:'100%'}]} value={serverModelPath} onChangeText={setServerModelPath} />
      </View>

      <View style={{height:320, marginTop:12, borderRadius:12, overflow:'hidden', backgroundColor:'#000'}}>
        <Camera ref={(r)=> (cameraRef.current = r)} style={{flex:1}} type={CameraType.back} onCameraReady={()=>setReady(true)} />
      </View>

      <View style={{marginTop:12}}>
        <Button title={busy? 'Analyserar…' : 'Fånga 12 bilder och analysera'} onPress={onAnalyze} disabled={busy || !ready} />
      </View>

      {result && (
        <View style={{marginTop:16}}>
          <MetricCard title="Club speed" value={(result.metrics.club_speed_mps*2.23693629).toFixed(1)} unit="mph" />
          <MetricCard title="Ball speed" value={(result.metrics.ball_speed_mps*2.23693629).toFixed(1)} unit="mph" />
          <MetricCard title="Launch" value={result.metrics.launch_deg.toFixed(1)} unit="°" />
          <MetricCard title="Carry" value={(result.metrics.carry_m*1.0936133).toFixed(0)} unit="yd" />
          <MetricCard title="Quality" value={result.quality} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  h1:{fontSize:20, fontWeight:'700', marginBottom:8},
  row:{flexDirection:'row', alignItems:'center', gap:8},
  label:{fontSize:12, color:'#666'},
  input:{borderWidth:1, borderColor:'#ccc', padding:8, borderRadius:8, width:90}
});
