// FILE: C:\RiderNote\src\screens\ProfileScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Purchases from "react-native-purchases";
import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";
import { BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Platform, NativeModules, Modal, TextInput, KeyboardAvoidingView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

import HelpScreen from "./HelpScreen";
import AppInfoScreen from "./AppInfoScreen";
import TermsPrivacyScreen from "./TermsPrivacyScreen";
import AdRemovePlanScreen from "./AdRemovePlanScreen";
import SubscriptionManageScreen from "./SubscriptionManageScreen";
import { useAppTheme, Theme as AppTheme, ThemePref } from "../theme/ThemeProvider";

type Props = {
  onClose: () => void;
};

type Page = "main" | "help" | "info" | "terms" | "ads" | "subs";

const CONTACT_EMAIL = "ppicassor@gmail.com";

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

export default function ProfileScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>("main");
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [isTrial, setIsTrial] = useState<boolean>(false);

  const { theme, themePref, setThemePref } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string>("");

  const [contactVisible, setContactVisible] = useState<boolean>(false);
  const [contactText, setContactText] = useState<string>("");
  const [contactSending, setContactSending] = useState<boolean>(false);

  const appVersion = useMemo(() => {
    const v =
      (Constants as any)?.nativeAppVersion ??
      Constants?.expoConfig?.version ??
      (Constants as any)?.manifest?.version;
    return v ? String(v) : "-";
  }, []);

  const buildVersion = useMemo(() => {
    const c1 = (Constants as any)?.nativeBuildVersion;
    const c2 = (Constants as any)?.expoConfig?.ios?.buildNumber;
    const c3 = (Constants as any)?.expoConfig?.android?.versionCode;
    const v = c1 ?? c2 ?? c3;
    return v != null && String(v).length ? String(v) : "-";
  }, []);

  const getDeviceInfo = useCallback(() => {
    const pc: any = (Platform as any).constants ?? (NativeModules as any).PlatformConstants ?? {};
    const manufacturer = pc?.Manufacturer ?? pc?.manufacturer ?? "";
    const brand = pc?.Brand ?? pc?.brand ?? "";
    const model = pc?.Model ?? pc?.model ?? "";
    const device = [manufacturer, brand, model].map((x) => String(x || "").trim()).filter(Boolean).join(" ").trim();
    const os = `${Platform.OS} ${String(Platform.Version)}`;
    return { device: device || "-", os: os || "-" };
  }, []);

  const getNowString = useCallback(() => {
    try {
      return new Date().toLocaleString("ko-KR", { hour12: false });
    } catch {
      return String(Date.now());
    }
  }, []);

  const openContact = useCallback(() => {
    setContactText("");
    setContactVisible(true);
  }, []);

  const sendContactEmail = useCallback(async () => {
    if (contactSending) return;
    setContactSending(true);

    try {
      const when = getNowString();
      const { device, os } = getDeviceInfo();

      const subjectRaw = `[RiderNote 문의] ${when}`;
      const meta =
        `- 날짜: ${when}\n` +
        `- 기종: ${device}\n` +
        `- OS: ${os}\n` +
        `- 앱버전: ${appVersion}\n` +
        `- 빌드: ${buildVersion}\n\n`;

      const bodyRaw =
        `안녕하세요. RiderNote 문의입니다.\n\n` +
        meta +
        `【문의 내용】\n` +
        `${(contactText ?? "").toString()}\n\n` +
        `【추가 정보(선택)】\n- 재현 단계:\n- 기대 동작:\n- 실제 동작:\n`;

      const subject = encodeURIComponent(subjectRaw);
      const body = encodeURIComponent(bodyRaw);
      const mailto = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;

      try {
        await Linking.openURL(mailto);
        setContactVisible(false);
        return;
      } catch {}

      try {
        const gmailWeb = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(CONTACT_EMAIL)}&su=${subject}&body=${body}`;
        await Linking.openURL(gmailWeb);
        setContactVisible(false);
        return;
      } catch {
        setUpdateMsg("메일 앱을 열 수 없습니다. 메일 앱 설치/설정 후 다시 시도해 주세요.");
      }
    } finally {
      setContactSending(false);
    }
  }, [appVersion, buildVersion, contactSending, contactText, getDeviceInfo, getNowString]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const v = await readPremiumFlag();
      if (mounted) {
        setIsPremium(v);
        setIsTrial(false);
      }

      try {
        const info: any = await (Purchases as any).getCustomerInfo?.();
        const active = info?.entitlements?.active ?? {};
        const keys = Object.keys(active);

        if (keys.length === 0) {
          if (mounted) {
            setIsPremium(false);
            setIsTrial(false);
          }
          return;
        }

        let hasNonTrial = false;
        let hasTrial = false;

        for (const k of keys) {
          const ent = active[k];
          const pt = String(ent?.periodType ?? "").toUpperCase();
          if (pt === "TRIAL") hasTrial = true;
          else hasNonTrial = true;
        }

        const premiumActive = hasNonTrial;
        const trialActive = !hasNonTrial && hasTrial;

        if (mounted) {
          setIsPremium(premiumActive);
          setIsTrial(trialActive);
        }

        try {
          await AsyncStorage.setItem("RIDERNOTE_IS_PREMIUM", premiumActive ? "1" : "0");
        } catch {}
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setTheme = async (pref: ThemePref) => {
    await setThemePref(pref);
  };

  const getAndroidPackageName = useCallback((): string | null => {
    try {
      const m: any = (Updates as any).manifest;
      const m2: any = (Updates as any).manifest2;

      const candidates = [
        m?.android?.package,
        m?.android?.packageName,
        m?.extra?.expoClient?.android?.package,
        m?.extra?.expoClient?.android?.packageName,
        m2?.extra?.expoClient?.android?.package,
        m2?.extra?.expoClient?.android?.packageName
      ];

      for (const c of candidates) {
        if (typeof c === "string" && c.trim().length > 0) return c.trim();
      }
    } catch {}
    return null;
  }, []);

  const openPlayStoreFallback = useCallback(async () => {
    const pkg = getAndroidPackageName();
    const marketUrl = pkg ? `market://details?id=${pkg}` : "";
    const webUrl = pkg
      ? `https://play.google.com/store/apps/details?id=${pkg}`
      : `https://play.google.com/store/search?q=${encodeURIComponent("RiderNote")}&c=apps`;

    try {
      if (Platform.OS === "android" && marketUrl) {
        await Linking.openURL(marketUrl);
        return;
      }
    } catch {}

    try {
      await Linking.openURL(webUrl);
    } catch {}
  }, [getAndroidPackageName]);

  const runEasOtaUpdateIfAvailable = useCallback(async (): Promise<boolean> => {
    try {
      if (!Updates.isEnabled) return false;
      setUpdateMsg("업데이트 확인 중...");
      const res = await Updates.checkForUpdateAsync();
      if (!res.isAvailable) return false;

      setUpdateMsg("업데이트 다운로드 중...");
      await Updates.fetchUpdateAsync();

      setUpdateMsg("업데이트 적용 중...");
      await Updates.reloadAsync();
      return true;
    } catch {
      return false;
    }
  }, []);

  const tryAndroidInAppUpdate = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return false;

    const mod: any =
      (NativeModules as any).RiderInAppUpdate ||
      (NativeModules as any).InAppUpdateModule ||
      (NativeModules as any).InAppUpdatesModule;

    try {
      if (mod && typeof mod.checkAndStartUpdate === "function") {
        setUpdateMsg("Play Store 업데이트 확인 중...");
        const r = await mod.checkAndStartUpdate();
        return !!r;
      }

      if (mod && typeof mod.checkNeedsUpdate === "function" && typeof mod.startUpdate === "function") {
        setUpdateMsg("Play Store 업데이트 확인 중...");
        const r = await mod.checkNeedsUpdate();
        const shouldUpdate = typeof r === "boolean" ? r : !!r?.shouldUpdate;
        if (!shouldUpdate) return false;

        setUpdateMsg("업데이트 시작 중...");
        await mod.startUpdate({ updateType: "IMMEDIATE" });
        return true;
      }
    } catch {}

    return false;
  }, []);

  const handleUpdatePress = useCallback(async () => {
    if (updateBusy) return;

    setUpdateBusy(true);
    setUpdateMsg("");

    try {
      const didOta = await runEasOtaUpdateIfAvailable();
      if (didOta) return;

      const didInApp = await tryAndroidInAppUpdate();
      if (didInApp) return;

      setUpdateMsg("Play Store로 이동합니다...");
      await openPlayStoreFallback();
    } finally {
      setUpdateBusy(false);
    }
  }, [openPlayStoreFallback, runEasOtaUpdateIfAvailable, tryAndroidInAppUpdate, updateBusy]);

  if (page === "help") {
    return <HelpScreen onBack={() => setPage("main")} onClose={onClose} />;
  }
  if (page === "info") {
    return <AppInfoScreen onBack={() => setPage("main")} onClose={onClose} />;
  }
  if (page === "terms") {
    return <TermsPrivacyScreen onBack={() => setPage("main")} onClose={onClose} />;
  }
  if (page === "ads") {
    return <AdRemovePlanScreen onBack={() => setPage("main")} onClose={onClose} />;
  }
  if (page === "subs") {
    return (
      <SafeAreaView style={styles.subsRoot} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.subsBody}>
          <SubscriptionManageScreen onBack={() => setPage("main")} onClose={onClose} />
        </View>
      </SafeAreaView>
    );
  }

  const bannerReserve = !isPremium ? 62 : 0;
  const bottomPad = insets.bottom + 18 + bannerReserve;

  const whenPreview = getNowString();
  const dev = getDeviceInfo();

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.header, { paddingTop: 10 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity activeOpacity={0.88} onPress={onClose} style={styles.headerBackBtn}>
            <Text style={styles.headerBackText}>{"<"}</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>프로필</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>
        <View style={styles.membershipCard}>
          <Text style={styles.membershipTitle}>내 멤버쉽 등급</Text>

          <View style={styles.membershipRow}>
            <Text style={styles.membershipValue}>{isTrial ? "무료체험중" : isPremium ? "Premium Membership" : "Free Membership"}</Text>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setPage("ads")}
              style={[styles.upgradeBtn, (isPremium || isTrial) ? styles.upgradeBtnDisabled : null]}
              disabled={isPremium || isTrial}
            >
              <Text style={styles.upgradeBtnText}>Buy Now</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.menuCard}>
          <View style={styles.menuRow}>
            <Text style={styles.menuText}>테마</Text>

            <View style={styles.themeGroup}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setTheme("system")}
                style={[styles.themePill, themePref === "system" ? styles.themePillOn : styles.themePillOff]}
              >
                <Text style={[styles.themePillText, themePref === "system" ? styles.themePillTextOn : styles.themePillTextOff]}>
                  {themePref === "system" ? (theme.mode === "dark" ? "자동" : "자동") : "자동"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setTheme("light")}
                style={[styles.themePill, themePref === "light" ? styles.themePillOn : styles.themePillOff]}
              >
                <Text style={[styles.themePillText, themePref === "light" ? styles.themePillTextOn : styles.themePillTextOff]}>
                  라이트
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setTheme("dark")}
                style={[styles.themePill, themePref === "dark" ? styles.themePillOn : styles.themePillOff]}
              >
                <Text style={[styles.themePillText, themePref === "dark" ? styles.themePillTextOn : styles.themePillTextOff]}>
                  다크
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.menuDivider} />

          <MenuRow title="광고제거 플랜" onPress={() => setPage("ads")} styles={styles} />
          <View style={styles.menuDivider} />
          <MenuRow title="도움말" onPress={() => setPage("help")} styles={styles} />
          <View style={styles.menuDivider} />
          <MenuRow title="앱정보" onPress={() => setPage("info")} styles={styles} />
          <View style={styles.menuDivider} />
          <MenuRow title="약관 및 개인정보처리방침" onPress={() => setPage("terms")} styles={styles} />
          <View style={styles.menuDivider} />
          <MenuRow title="구독관리" onPress={() => setPage("subs")} chevron="›" styles={styles} />

          <View style={[styles.updateBar, { paddingBottom: 14 }]}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleUpdatePress}
              disabled={updateBusy}
              style={[styles.updateBtn, updateBusy ? styles.updateBtnDisabled : null]}
            >
              <Text style={styles.updateBtnText}>{updateBusy ? "UPDATING..." : "UPDATE"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={openContact}
              style={[styles.contactBtn, contactSending ? styles.contactBtnDisabled : null]}
              disabled={contactSending}
            >
              <Text style={styles.contactBtnText}>문의하기</Text>
            </TouchableOpacity>

            {updateMsg ? <Text style={styles.updateHint}>{updateMsg}</Text> : null}
          </View>
        </View>
      </ScrollView>

      {!isPremium ? (
        <View style={[styles.bannerDock, { paddingBottom: insets.bottom }]}>
          <View style={styles.bannerBox}>
            <BannerAd unitId={"ca-app-pub-5144004139813427/4269745317"} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
          </View>
        </View>
      ) : null}

      <Modal transparent visible={contactVisible} animationType="fade" onRequestClose={() => setContactVisible(false)}>
        <View style={styles.modalRoot}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>

            <View style={styles.modalOverlay} />

            <View style={[styles.modalCard, { marginBottom: insets.bottom + 14 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>문의하기</Text>

                <TouchableOpacity activeOpacity={0.88} onPress={() => setContactVisible(false)} style={styles.modalCloseBtn}>
                  <Text style={styles.modalCloseTxt}>닫기</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalMetaBox}>
                <Text style={styles.modalMetaTxt}>날짜: {whenPreview}</Text>
                <Text style={styles.modalMetaTxt}>기종: {dev.device}</Text>
                <Text style={styles.modalMetaTxt}>OS: {dev.os}</Text>
                <Text style={styles.modalMetaTxt}>앱버전: {appVersion} / 빌드: {buildVersion}</Text>
                <Text style={styles.modalMetaTxt}>수신: {CONTACT_EMAIL}</Text>
              </View>

              <Text style={styles.modalLabel}>내용</Text>
              <TextInput
                value={contactText}
                onChangeText={setContactText}
                placeholder="문의 내용을 입력해 주세요. (재현 방법/상황을 적어주시면 해결이 빠릅니다)"
                placeholderTextColor={theme.mode === "dark" ? "rgba(255,255,255,0.35)" : "rgba(29,44,59,0.35)"}
                multiline
                textAlignVertical="top"
                style={styles.modalInput}
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity activeOpacity={0.88} onPress={() => setContactVisible(false)} style={styles.modalBtnGhost}>
                  <Text style={styles.modalBtnGhostTxt}>취소</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={sendContactEmail}
                  style={[styles.modalBtnPrimary, contactSending ? styles.modalBtnPrimaryDisabled : null]}
                  disabled={contactSending}
                >
                  <Text style={styles.modalBtnPrimaryTxt}>{contactSending ? "준비중..." : "메일로 전송"}</Text>
                </TouchableOpacity>
              </View>
            </View>

          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MenuRow({
  title,
  onPress,
  chevron,
  styles
}: {
  title: string;
  onPress: () => void;
  chevron?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.menuRow}>
      <Text style={styles.menuText}>{title}</Text>
      <Text style={styles.menuArrow}>{chevron ?? "›"}</Text>
    </TouchableOpacity>
  );
}

function createStyles(theme: AppTheme) {
  const pillOffBg = theme.surfaceBg;
  const pillOffBorder = theme.border;
  const pillOffText = theme.textSub;

  const modalOverlayBg = theme.mode === "dark" ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.55)";
  const inputBg = theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(29,44,59,0.06)";
  const inputBorder = theme.mode === "dark" ? "rgba(255,255,255,0.10)" : "rgba(29,44,59,0.10)";

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.rootBg },

    subsRoot: { flex: 1, backgroundColor: theme.rootBg },
    subsBody: { flex: 1 },
    updateBar: {
      paddingHorizontal: 16,
      paddingTop: 10,
      backgroundColor: theme.headerBg,
      borderTopWidth: 1,
      borderTopColor: theme.border
    },
    updateBtn: {
      height: 44,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder
    },
    updateBtnDisabled: { opacity: 0.6 },
    updateBtnText: { color: theme.accentText, fontSize: 13, fontWeight: "900" },
    updateHint: { marginTop: 8, marginBottom: 2, color: theme.textMuted, fontSize: 11, lineHeight: 15, textAlign: "center" },

    contactBtn: {
      marginTop: 10,
      height: 44,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surfaceBg,
      borderWidth: 1,
      borderColor: theme.border
    },
    contactBtnDisabled: { opacity: 0.6 },
    contactBtnText: { color: theme.text, fontSize: 13, fontWeight: "900" },

    header: {
      paddingHorizontal: 16,
      paddingBottom: 10,
      backgroundColor: theme.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    headerRow: { height: 36, alignItems: "center", justifyContent: "center" },
    headerTitle: { color: theme.text, fontSize: 17, fontWeight: "700" },
    headerBackBtn: {
      position: "absolute",
      left: 10,
      height: 36,
      minWidth: 36,
      alignItems: "flex-start",
      justifyContent: "center"
    },
    headerBackText: { color: theme.textSub, fontSize: 22, fontWeight: "700" },

    scrollContent: { paddingHorizontal: 16, paddingTop: 14 },

    membershipCard: {
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      marginBottom: 10
    },
    membershipTitle: { color: theme.text, fontSize: 13, fontWeight: "700", marginBottom: 10 },
    membershipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    membershipValue: { color: theme.textSub, fontSize: 12, fontWeight: "700" },

    upgradeBtn: {
      height: 34,
      transform: [{ translateY: -17 }],
      paddingHorizontal: 14,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.startBg,
      borderWidth: 1,
      borderColor: theme.startBorder
    },
    upgradeBtnDisabled: { opacity: 0.45 },
    upgradeBtnText: { color: theme.primaryTextOnColor, fontSize: 12, fontWeight: "700" },

    menuCard: {
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden"
    },
    menuRow: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10
    },
    menuDivider: { height: 1, backgroundColor: theme.border },
    menuText: { color: theme.text, fontSize: 13, fontWeight: "700" },
    menuArrow: { color: theme.textSub2, fontSize: 20, fontWeight: "700" },

    themeGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    themePill: {
      height: 30,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    themePillOn: {
      backgroundColor: theme.accentBg,
      borderColor: theme.accentBorder
    },
    themePillOff: {
      backgroundColor: pillOffBg,
      borderColor: pillOffBorder
    },
    themePillText: { fontSize: 12, fontWeight: "700" },
    themePillTextOn: { color: theme.accentText },
    themePillTextOff: { color: pillOffText },

    bannerDock: {
      paddingHorizontal: 16,
      paddingTop: 10,
      backgroundColor: theme.rootBg
    },
    bannerBox: {
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center"
    },

    modalRoot: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
    modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: modalOverlayBg },
    modalCard: {
      width: "90%",
      maxWidth: 420,
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14
    },
    modalHeader: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    modalTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
    modalCloseBtn: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder
    },
    modalCloseTxt: { color: theme.accentText, fontSize: 12, fontWeight: "700" },

    modalMetaBox: {
      marginTop: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: inputBorder,
      backgroundColor: inputBg,
      paddingHorizontal: 12,
      paddingVertical: 10
    },
    modalMetaTxt: { color: theme.textSub, fontSize: 11, lineHeight: 16, fontWeight: "700" },

    modalLabel: { marginTop: 12, color: theme.text, fontSize: 12, fontWeight: "900" },
    modalInput: {
      marginTop: 8,
      minHeight: 140,
      maxHeight: 260,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: inputBorder,
      backgroundColor: inputBg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 17
    },

    modalBtnRow: {
      marginTop: 12,
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10
    },
    modalBtnGhost: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surfaceBg,
      borderWidth: 1,
      borderColor: theme.border
    },
    modalBtnGhostTxt: { color: theme.text, fontSize: 12, fontWeight: "900" },

    modalBtnPrimary: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder
    },
    modalBtnPrimaryDisabled: { opacity: 0.6 },
    modalBtnPrimaryTxt: { color: theme.accentText, fontSize: 12, fontWeight: "900" }
  });
}
