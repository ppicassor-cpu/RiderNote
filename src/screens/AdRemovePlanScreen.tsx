// FILE: C:\RiderNote\src\screens\AdRemovePlanScreen.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
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

const PREMIUM_CACHE_KEY = "RIDERNOTE_IS_PREMIUM";

type FakePackage = {
  priceString: string;
};

export default function AdRemovePlanScreen({ onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const statusBarStyle = theme.mode === "dark" ? "light-content" : "dark-content";

  const [isPremium, setIsPremium] = useState(false);
  const [pkg, setPkg] = useState<FakePackage | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const alertAnim = useRef(new Animated.Value(0)).current;

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const hideAlert = () => {
    setAlertVisible(false);
  };

  useEffect(() => {
    Animated.timing(alertAnim, {
      toValue: alertVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true
    }).start();
  }, [alertVisible, alertAnim]);

  useEffect(() => {
    const backAction = () => {
      if (alertVisible) {
        hideAlert();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, [alertVisible]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const cached = await AsyncStorage.getItem(PREMIUM_CACHE_KEY);
        const active = cached === "1";
        if (mounted) setIsPremium(active);
        if (mounted) setPkg({ priceString: "₩2,900" });
      } catch {
      } finally {
        if (mounted) setIsInitializing(false);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  const saveCache = async (active: boolean) => {
    try {
      await AsyncStorage.setItem(PREMIUM_CACHE_KEY, active ? "1" : "0");
    } catch {}
  };

  const handlePurchase = async () => {
    if (isBusy) return;
    if (isPremium) {
      showAlert("알림", "이미 프리미엄 상태입니다.");
      return;
    }
    if (!pkg) {
      showAlert("알림", "상품 정보를 불러오는 중입니다.");
      return;
    }

    setIsBusy(true);
    try {
      setIsPremium(true);
      await saveCache(true);
      showAlert("구매 완료", "프리미엄이 활성화되었습니다.");
    } catch {
      showAlert("오류", "구매 처리 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestore = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const cached = await AsyncStorage.getItem(PREMIUM_CACHE_KEY);
      const active = cached === "1";
      setIsPremium(active);
      await saveCache(active);

      if (active) {
        showAlert("복원 완료", "프리미엄 상태가 복원되었습니다.");
      } else {
        showAlert("알림", "복원할 구매내역이 없습니다.");
      }
    } catch {
      showAlert("오류", "복원 처리 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  };

  const openStoreSubscription = async () => {
    try {
      const url =
        Platform.OS === "android"
          ? "https://play.google.com/store/account/subscriptions"
          : "https://apps.apple.com/account/subscriptions";
      await Linking.openURL(url);
    } catch {
      showAlert("알림", "스토어 구독 관리 페이지를 열 수 없습니다.");
    }
  };

  const bottomPad = insets.bottom + 26;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={theme.statusBarBg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.85} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>광고 제거 플랜</Text>

        <TouchableOpacity activeOpacity={0.88} onPress={onClose} style={styles.headerCloseBtn}>
          <Text style={styles.headerCloseText}>닫기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} bounces={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeaderRow}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroTitle}>프리미엄</Text>
              <Text style={styles.heroSub}>광고 없이 더 깔끔하게, 기록은 더 안정적으로</Text>
            </View>

            {!isPremium && (
              <TouchableOpacity
                style={styles.quickBuyBtn}
                onPress={handlePurchase}
                disabled={isBusy || !pkg}
                activeOpacity={0.85}
              >
                <Text style={styles.quickBuyTxt}>빠른 구매</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, isPremium ? styles.badgeOn : styles.badgeOff]}>
              <Text style={[styles.badgeTxt, isPremium ? styles.badgeTxtOn : styles.badgeTxtOff]}>
                {isInitializing ? "확인 중..." : isPremium ? "PREMIUM MEMBERSHIP" : "FREE MEMBERSHIP"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>프리미엄 혜택</Text>

          <View style={styles.lineItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.lineTxt}>앱 내 광고 노출을 완전히 제거됩니다.</Text>
          </View>
          <View style={styles.lineItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.lineTxt}>기록/저장 횟수가 무제한입니다.</Text>
          </View>
          <View style={styles.lineItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.lineTxt}>세션 제한 시간이 없으며 무제한입니다.</Text>
          </View>
          <View style={styles.lineItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.lineTxt}>업데이트로 안정성과 기록 품질이 지속 개선됩니다.</Text>
          </View>
          <View style={styles.lineItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.lineTxt}>결제/복원/해지는 스토어 구독 관리에서 처리됩니다.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>구독 관리</Text>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handlePurchase}
            style={[styles.primaryBtn, (isBusy || isPremium || !pkg) && styles.btnDisabled]}
            disabled={isBusy || isPremium || !pkg}
          >
            {isBusy ? (
              <ActivityIndicator color={ACCENT} size="small" />
            ) : (
              <Text style={styles.primaryBtnTxt}>
                {isPremium ? "이미 프리미엄입니다" : pkg ? `${pkg.priceString} 월 구독` : "로딩 중..."}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleRestore}
            style={[styles.secondaryBtn, isBusy && styles.btnDisabled]}
            disabled={isBusy}
          >
            <Text style={styles.secondaryBtnTxt}>구매내역 복원</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.85} onPress={openStoreSubscription} style={styles.linkBtn}>
            <Text style={styles.linkTxt}>스토어 구독 관리 열기</Text>
          </TouchableOpacity>

          <Text style={styles.note}>환불/해지/결제 관리는 스토어 정책을 따릅니다.</Text>
        </View>
      </ScrollView>

      <Animated.View pointerEvents={alertVisible ? "auto" : "none"} style={[styles.alertRoot, { opacity: alertAnim }]}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>{alertTitle}</Text>
            <Text style={styles.alertMessage}>{alertMessage}</Text>
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
const ACCENT_SOFT = "rgba(29,212,245,0.14)";
const ACCENT_SOFT_2 = "rgba(29,212,245,0.12)";

function createStyles(theme: AppTheme) {
  const softNeutralBg = theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(29,44,59,0.06)";
  const backColor = theme.mode === "dark" ? "rgba(255,255,255,0.85)" : "rgba(29,44,59,0.85)";

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
    backTxt: { color: backColor, fontSize: 24, fontWeight: "700" },
    headerTitle: { flex: 1, textAlign: "center", color: theme.text, fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },

    headerCloseBtn: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder
    },
    headerCloseText: { color: theme.accentText, fontSize: 12, fontWeight: "700" },

    content: { padding: 18, paddingBottom: 26 },

    heroCard: {
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 14
    },
    heroHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start"
    },
    heroLeft: { flex: 1 },
    heroTitle: { color: theme.text, fontSize: 20, fontWeight: "700" },
    heroSub: { color: theme.textSub, fontSize: 13, marginTop: 4, lineHeight: 18 },

    quickBuyBtn: {
      backgroundColor: ACCENT_SOFT_2,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(29,212,245,0.55)"
    },
    quickBuyTxt: {
      color: theme.primaryTextOnColor,
      fontSize: 12,
      fontWeight: "700"
    },

    badgeRow: { marginTop: 14, flexDirection: "row" },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1
    },
    badgeOn: { borderColor: "rgba(29,212,245,0.55)", backgroundColor: ACCENT_SOFT_2 },
    badgeOff: { borderColor: theme.border, backgroundColor: softNeutralBg },
    badgeTxt: { fontSize: 12, fontWeight: "700" },
    badgeTxtOn: { color: theme.primaryTextOnColor },
    badgeTxtOff: { color: theme.textSub },

    card: {
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 12
    },
    cardTitle: { color: theme.text, fontSize: 14, fontWeight: "700", marginBottom: 12 },
    lineItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
    bullet: { color: ACCENT, fontSize: 16, fontWeight: "700", marginRight: 8, marginTop: -1 },
    lineTxt: { color: theme.textSub, fontSize: 13, lineHeight: 18, flex: 1 },

    primaryBtn: {
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: ACCENT_SOFT,
      borderWidth: 1,
      borderColor: "rgba(29,212,245,0.55)",
      marginTop: 2
    },
    primaryBtnTxt: { color: theme.primaryTextOnColor, fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },

    secondaryBtn: {
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: softNeutralBg,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 10
    },
    secondaryBtnTxt: { color: theme.textSub, fontSize: 13, fontWeight: "700" },

    linkBtn: { paddingVertical: 12, alignItems: "center", marginTop: 6 },
    linkTxt: { color: theme.text, fontSize: 12, fontWeight: "700", opacity: 0.85 },

    note: { color: theme.textMuted, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: "center" },

    btnDisabled: { opacity: 0.5 },

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
      maxWidth: 380,
      backgroundColor: theme.popupBoxBg,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.popupBoxBorder,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12
    },
    alertTitle: { color: theme.popupTitle, fontSize: 15, fontWeight: "700", textAlign: "center" },
    alertMessage: { marginTop: 8, color: theme.popupMsg, fontSize: 12, lineHeight: 18, textAlign: "center" },
    alertButton: {
      height: 46,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.popupPrimaryBorder,
      backgroundColor: theme.popupPrimaryBg,
      marginTop: 12
    },
    alertButtonText: { color: theme.popupPrimaryText, fontSize: 13, fontWeight: "700" }
  });
}
