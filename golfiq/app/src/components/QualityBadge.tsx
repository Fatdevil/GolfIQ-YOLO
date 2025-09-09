import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function QualityBadge({value}:{value:'green'|'yellow'|'red'|string}){
  const color = value==='green' ? '#16a34a' : value==='yellow' ? '#f59e0b' : '#ef4444';
  const label = value.toUpperCase();
  return (
    <View style={[styles.badge,{borderColor:color}]}>
      <View style={[styles.dot,{backgroundColor:color}]} />
      <Text style={[styles.text,{color}]}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  badge:{flexDirection:'row', alignItems:'center', borderWidth:1, paddingHorizontal:10, paddingVertical:6, borderRadius:999},
  dot:{width:10, height:10, borderRadius:5, marginRight:8},
  text:{fontWeight:'700'}
});
