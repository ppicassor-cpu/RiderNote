// FILE: C:\RiderNote\src\components\PastelScaffold.tsx
import React from "react";
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
};

export default function PastelScaffold({ title, onBack, right, children }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={BG as any} />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {onBack ? (
            <TouchableOpacity activeOpacity={0.88} onPress={onBack} style={styles.iconBtn}>
              <Text style={styles.iconTxt}>‹</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>

        <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
      </View>

      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

const BG = "#F7FAFF";
const BORDER = "rgba(29,44,59,0.10)";
const TEXT = "#1D2C3B";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerSide: { width: 64, height: 44, justifyContent: "center" },
  headerRight: { alignItems: "flex-end" },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29,44,59,0.06)"
  },
  iconTxt: { color: TEXT, fontSize: 22, fontWeight: "900" },
  headerTitle: { flex: 1, textAlign: "center", color: TEXT, fontSize: 16, fontWeight: "900" },
  body: { flex: 1, paddingHorizontal: 14, paddingTop: 12 }
});
