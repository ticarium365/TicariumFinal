import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function BrandMark({ size = 32 }: { size?: number }) {
  const fontSize = Math.round(size * 0.55);
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
        },
      ]}
    >
      <Text style={[styles.t, { fontSize }]}>
        T<Text style={styles.three}>3</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  t: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    lineHeight: undefined,
  },
  three: {
    color: "#5EEAD4",
    fontFamily: "Inter_400Regular",
  },
});
