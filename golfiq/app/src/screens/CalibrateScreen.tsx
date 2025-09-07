import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { calibrate } from '../lib/api';

export default function CalibrateScreen(){
  const [px, setPx] = useState('500');
  const [scale, setScale] = useState<number|null>(null);

  const onCalc = async () => {
    const x = parseFloat(px);
    if(!x || x<=0) return;
    const s = await calibrate(x);
    setScale(s.scale_m_per_px);
  };

  return (
    <View>
      <Text style={styles.h1}>Kalibrering (A4)</Text>
      <Text>Fyll i hur många pixlar en A4-bredd motsvarar i din bild. Tips: ta en bild med A4 i bildplanet, 
      öppna den i valfri app och mät bredden i px – eller använd vår overlay i nästa version.</Text>
      <View style={{flexDirection:'row', alignItems:'center', marginTop:12}}>
        <TextInput style={styles.input} keyboardType='numeric' value={px} onChangeText={setPx} />
        <Button title='Beräkna' onPress={onCalc} />
      </View>
      {scale!==null && (
        <View style={styles.result}>
          <Text>Skala: <Text style={{fontWeight:'700'}}>{scale.toFixed(6)} m/px</Text></Text>
        </View>
      )}
    </View>
  )
}
const styles = StyleSheet.create({
  h1:{fontSize:20, fontWeight:'700', marginBottom:8},
  input:{borderWidth:1, borderColor:'#ccc', padding:8, borderRadius:8, width:120, marginRight:8},
  result:{marginTop:12, padding:12, backgroundColor:'#f1f1f1', borderRadius:10}
});
