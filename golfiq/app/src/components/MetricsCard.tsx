import React from "react";
import { View, Text, StyleSheet } from "react-native";
type M = { sway_cm?: number|null, sway_px?: number, shoulder_tilt_deg?: number, shaft_lean_deg?: number };
export default function MetricsCard({ m }: { m?: M }) {
  if (!m) return null;
  const row = (k:string,v?:number|null,suffix="") => (
    <View style={styles.r} key={k}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v===null||v===undefined ? "—" : `${v.toFixed(1)}${suffix}`}</Text>
    </View>
  );
  return (
    <View style={styles.card}>
      <Text style={styles.h}>Face-on metrics</Text>
      {row("Sway", m.sway_cm ?? (m.sway_px ?? null), m.sway_cm!=null?" cm":" px")}
      {row("Shoulder tilt", m.shoulder_tilt_deg, "°")}
      {row("Shaft lean", m.shaft_lean_deg, "°")}
    </View>
  );
}
const styles = StyleSheet.create({
  card:{ margin:12, padding:12, borderRadius:12, backgroundColor:"#0B0F14", borderWidth:1, borderColor:"#243041" },
  h:{ fontWeight:"700", marginBottom:6, color:"#CFE3FF" },
  r:{ flexDirection:"row", justifyContent:"space-between", paddingVertical:2 },
  k:{ color:"#9AB0C6" }, v:{ color:"#E6F1FF", fontWeight:"600" }
});
