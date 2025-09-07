import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MetricCard({title, value, unit}:{title:string, value:number|string, unit?:string}){
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}{unit? ' '+unit: ''}</Text>
    </View>
  )
}
const styles = StyleSheet.create({
  card:{padding:16, borderRadius:12, backgroundColor:'#f1f1f1', marginBottom:12},
  title:{fontSize:14, color:'#666'},
  value:{fontSize:22, fontWeight:'600'}
});
