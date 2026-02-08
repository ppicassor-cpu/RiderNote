import React, { useEffect, useMemo, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Platform, NativeModules } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";

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

  const { theme, themePref, setThemePref } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string>("");

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
      if (mounted) setIsPremium(v);
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

        <View style={[styles.updateBar, { paddingBottom: insets.bottom + 14 }]}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={handleUpdatePress}
            disabled={updateBusy}
            style={[styles.updateBtn, updateBusy ? styles.updateBtnDisabled : null]}
          >
            <Text style={styles.updateBtnText}>{updateBusy ? "UPDATING..." : "UPDATE"}</Text>
          </TouchableOpacity>

          {updateMsg ? <Text style={styles.updateHint}>{updateMsg}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  const bottomPad = insets.bottom + 18;

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
            <Text style={styles.membershipValue}>{isPremium ? "Premium Membership" : "Free Membership"}</Text>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setPage("ads")}
              style={[styles.upgradeBtn, isPremium ? styles.upgradeBtnDisabled : null]}
              disabled={isPremium}
            >
              <Text style={styles.upgradeBtnText}>UPGRADE</Text>
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
                  시스템
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
          <MenuRow title="구독관리" onPress={() => setPage("subs")} chevron="››" styles={styles} />
        </View>
      </ScrollView>
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
    themePillTextOff: { color: pillOffText }
  });
}
