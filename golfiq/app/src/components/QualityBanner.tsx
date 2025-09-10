import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = { quality?: "green"|"yellow"|"red"; fps?: number };
export default function QualityBanner({ quality, fps }: Props) {
  const q = quality ?? (fps !== undefined ? (fps>=26?"green":fps>=18?"yellow":"red") : undefined);
  const bg = q==="green" ? "#173B2E" : q==="yellow" ? "#3B3417" : "#3B1717";
  const fg = q==="green" ? "#63E6BE" : q==="yellow" ? "#E6D163" : "#FF8A8A";
  return (
    <View style={[styles.wrap, {backgroundColor: bg, borderColor: fg}]}>
      <Text style={[styles.txt,{color: fg}]}>
        {q ? `Quality: ${q.toUpperCase()}` : "Quality: n/a"}{fps!==undefined ? `  ·  FPS: ${Math.round(fps)}`:""}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap:{ position:"absolute", top:16, alignSelf:"center", paddingHorizontal:12, paddingVertical:6, borderRadius:10, borderWidth:1 },
  txt:{ fontWeight:"600", letterSpacing:0.3 }
});
