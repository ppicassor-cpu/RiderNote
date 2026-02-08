// FILE: C:\RiderNote\src\screens\ProfileScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

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
    return <SubscriptionManageScreen onBack={() => setPage("main")} onClose={onClose} />;
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
