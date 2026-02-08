// FILE: C:\RiderNote\src\components\PastelPopup.tsx
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type PopupButton = {
  text: string;
  onPress?: () => void | Promise<void>;
  variant?: "primary" | "secondary";
};

export type PopupState = {
  visible: boolean;
  title: string;
  message: string;
  buttons: PopupButton[];
};

export default function PastelPopup({ state, onClose }: { state: PopupState; onClose: () => void }) {
  return (
    <View
      pointerEvents={state.visible ? "auto" : "none"}
      style={[StyleSheet.absoluteFill, { zIndex: state.visible ? 40000 : -1 }]}
    >
      {state.visible ? (
        <View style={styles.dim}>
          <View style={styles.box}>
            <Text style={styles.title}>{state.title}</Text>
            <Text style={styles.msg}>{state.message}</Text>

            <View style={styles.btns}>
              {state.buttons.map((b, idx) => (
                <TouchableOpacity
                  key={`${b.text}_${idx}`}
                  activeOpacity={0.88}
                  style={[styles.btn, b.variant === "secondary" ? styles.btnSecondary : styles.btnPrimary]}
                  onPress={async () => {
                    try {
                      await b.onPress?.();
                    } finally {
                      onClose();
                    }
                  }}
                >
                  <Text style={[styles.btnText, b.variant === "secondary" ? styles.btnTextSecondary : styles.btnTextPrimary]}>
                    {b.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: "rgba(29,44,59,0.28)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16
  },
  box: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#F3FBFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(170, 219, 255, 0.9)",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12
  },
  title: { color: "#1D2C3B", fontSize: 15, fontWeight: "900" },
  msg: { marginTop: 8, color: "rgba(29,44,59,0.78)", fontSize: 12, lineHeight: 18 },
  btns: { marginTop: 12, gap: 10 },
  btn: { height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  btnPrimary: { backgroundColor: "#FFD6E7", borderColor: "rgba(255, 140, 190, 0.55)" },
  btnSecondary: { backgroundColor: "#D9FFF2", borderColor: "rgba(47, 183, 163, 0.45)" },
  btnText: { fontSize: 13, fontWeight: "900" },
  btnTextPrimary: { color: "#3B2A3F" },
  btnTextSecondary: { color: "#13443D" }
});
