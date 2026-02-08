// FILE: C:\RiderNote\src\screens\SubscriptionManageScreen.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme as AppTheme, useAppTheme } from "../theme/ThemeProvider";

type Props = {
  onBack: () => void;
  onClose: () => void;
};

async function readPremiumFlag(): Promise<boolean> {
  const keys = ["isPremium", "premium", "hasPremium", "membershipPremium"];
  for (const k of keys) {
    try {
      const v = await AsyncStorage.getItem(k);
      if (v == null) continue;
      const s = String(v).trim().toLowerCase();
      if (s === "1" || s === "true" || s === "yes" || s === "premium") return true;
      if (s === "0" || s === "false" || s === "no" || s === "free") return false;
    } catch {}
  }
  return false;
}

type AlertState = {
  visible: boolean;
  title: string;
  message: string;
};

export default function SubscriptionManageScreen({ onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + 26;

  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const statusBarStyle = theme.mode === "dark" ? "light-content" : "dark-content";

  const [isPremium, setIsPremium] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const [alert, setAlert] = useState<AlertState>({ visible: false, title: "", message: "" });
  const alertAnim = useRef(new Animated.Value(0)).current;

  const showAlert = (title: string, message: string) => {
    setAlert({ visible: true, title, message });
  };
  const hideAlert = () => setAlert(a => ({ ...a, visible: false }));

  useEffect(() => {
    Animated.timing(alertAnim, {
      toValue: alert.visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true
    }).start();
  }, [alert.visible, alertAnim]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const v = await readPremiumFlag();
      if (mounted) setIsPremium(v);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const openStoreSubscription = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const url =
        Platform.OS === "android"
          ? "https://play.google.com/store/account/subscriptions"
          : "https://apps.apple.com/account/subscriptions";
      await Linking.openURL(url);
    } catch {
      showAlert("안내", "스토어를 열 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsBusy(false);
    }
  };

  const onRestorePress = () => {
    showAlert("구매내역 복원", "구매 복원은 스토어 구독 관리에서 상태 확인 후 앱을 다시 열어주세요.");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={theme.statusBarBg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.85} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>구독 관리</Text>

        <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>닫기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} bounces={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeaderRow}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroTitle}>현재 상태</Text>
              <Text style={styles.heroSub}>구독/프리미엄 활성화 여부를 확인합니다.</Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, isPremium ? styles.badgeOn : styles.badgeOff]}>
              <Text style={[styles.badgeTxt, isPremium ? styles.badgeTxtOn : styles.badgeTxtOff]}>
                {isPremium ? "PREMIUM" : "FREE"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>관리</Text>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={openStoreSubscription}
            style={[styles.primaryBtn, isBusy && styles.btnDisabled]}
            disabled={isBusy}
          >
            {isBusy ? (
              <ActivityIndicator color={ACCENT} size="small" />
            ) : (
              <Text style={styles.primaryBtnTxt}>스토어 구독 관리 열기</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onRestorePress}
            style={[styles.secondaryBtn, isBusy && styles.btnDisabled]}
            disabled={isBusy}
          >
            <Text style={styles.secondaryBtnTxt}>구매내역 복원</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Animated.View pointerEvents={alert.visible ? "auto" : "none"} style={[styles.alertRoot, { opacity: alertAnim }]}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>{alert.title}</Text>
            <Text style={styles.alertMessage}>{alert.message}</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={hideAlert} style={styles.alertButton}>
              <Text style={styles.alertButtonText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const ACCENT = "#1DD4F5";
const ACCENT_SOFT = "rgba(29,212,245,0.12)";

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.rootBg },

    header: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.headerBg
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "flex-start",
      justifyContent: "center"
    },
    backTxt: { color: theme.text, fontSize: 24, fontWeight: "700" },
    headerTitle: { flex: 1, textAlign: "center", color: theme.text, fontSize: 15, fontWeight: "700" },

    closeBtn: {
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder
    },
    closeTxt: { color: theme.accentText, fontSize: 12, fontWeight: "700" },

    content: { padding: 18 },

    heroCard: {
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 14
    },
    heroHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    heroLeft: { flex: 1 },
    heroTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
    heroSub: { color: theme.textSub2, fontSize: 13, marginTop: 4, lineHeight: 18 },

    badgeRow: { marginTop: 14, flexDirection: "row" },
    badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
    badgeOn: { borderColor: ACCENT, backgroundColor: "rgba(29,212,245,0.10)" },
    badgeOff: { borderColor: theme.border, backgroundColor: ACCENT_SOFT },
    badgeTxt: { fontSize: 12, fontWeight: "700" },
    badgeTxtOn: { color: ACCENT },
    badgeTxtOff: { color: theme.accentText },

    card: {
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 12
    },
    cardTitle: { color: theme.text, fontSize: 14, fontWeight: "700", marginBottom: 12 },

    primaryBtn: {
      height: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(29,212,245,0.14)",
      borderWidth: 1,
      borderColor: ACCENT
    },
    primaryBtnTxt: { color: ACCENT, fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },

    secondaryBtn: {
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 10
    },
    secondaryBtnTxt: { color: theme.textSub, fontSize: 13, fontWeight: "700" },

    btnDisabled: { opacity: 0.55 },

    alertRoot: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      zIndex: 10000
    },
    alertOverlay: {
      flex: 1,
      backgroundColor: theme.dimBg,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 16
    },
    alertBox: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: theme.popupBoxBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.popupBoxBorder,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12
    },
    alertTitle: { color: theme.popupTitle, fontSize: 15, fontWeight: "700", textAlign: "center" },
    alertMessage: { marginTop: 8, color: theme.popupMsg, fontSize: 12, lineHeight: 18, textAlign: "center" },
    alertButton: {
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      marginTop: 12
    },
    alertButtonText: { color: theme.accentText, fontSize: 13, fontWeight: "700" }
  });
}
