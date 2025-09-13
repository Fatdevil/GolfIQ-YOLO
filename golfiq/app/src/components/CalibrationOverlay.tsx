import React from "react";
import { View, StyleSheet } from "react-native";

/**
 * Lättviktig overlay (utan bildberoenden) – ramar in mitten av bilden
 * och ger en horisontlinje. Kan bytas till SVG/image senare.
 */
export default function CalibrationOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.frame}>
        <View style={styles.hline} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  frame: {
    flex: 1,
    margin: 24,
    borderWidth: 2,
    borderColor: "#FFD54A", // R6-guld-ish
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "stretch",
  },
  hline: {
    height: 2,
    backgroundColor: "#FFD54A",
    opacity: 0.8,
  },
});
