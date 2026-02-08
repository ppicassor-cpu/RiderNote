// FILE: C:\RiderNote\src\screens\AppInfoScreen.tsx
import React, { useMemo } from "react";
import Constants from "expo-constants";
import {
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
  onOpenTerms?: () => void;
  onOpenHelp?: () => void;
  onOpenSubs?: () => void;
};

const CONTACT_EMAIL = "support@ridernote.app";
const DEVELOPER_NAME = "RiderNote";

export default function AppInfoScreen({
  onBack,
  onClose,
  onOpenTerms,
  onOpenHelp,
  onOpenSubs
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const statusBarStyle = theme.mode === "dark" ? "light-content" : "dark-content";

  const bottomPad = insets.bottom + 26;

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

  const openTerms = () => {
    onOpenTerms?.();
  };

  const openHelp = () => {
    onOpenHelp?.();
  };

  const openSubs = () => {
    onOpenSubs?.();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={theme.statusBarBg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.85} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>앱 정보</Text>

        <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>닫기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} bounces={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeaderRow}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroTitle}>RiderNote는 어떤 앱인가요?</Text>
              <Text style={styles.heroSub}>
                라이더의 동선을 기록하고, 그 위에 메모를 남겨 나중에 빠르게 정리할 수 있도록 돕는 앱입니다.
              </Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={[styles.badgeTxt, styles.badgeTxtOff]}>소개</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>핵심 기능</Text>

          <LineItem styles={styles}>세션 기록: 기록 시작/완료로 동선을 하나의 세션으로 저장</LineItem>
          <LineItem styles={styles}>메모 핀: 메모를 작성한 위치를 지도에 표시</LineItem>
          <LineItem styles={styles}>메모 기록: 날짜/세션 기준으로 메모를 빠르게 확인</LineItem>
          <LineItem styles={styles}>빠른 정리: 짧게 기록 후, 나중에 한 번에 정리</LineItem>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>권한 사용 안내</Text>

          <LineItem styles={styles}>위치 권한: 경로 기록, 핀 위치 표시, 지도 중심 이동을 위해 사용</LineItem>
          <LineItem styles={styles}>알림/백그라운드 관련 권한: 기록 상태를 안정적으로 유지하기 위해 필요할 수 있음</LineItem>
          <LineItem styles={styles}>오버레이(있는 경우): 일부 기기에서 기록 안정성/UX 보조 목적</LineItem>

          <Text style={styles.hint}>
            권한은 기능 제공 목적 외로 사용하지 않도록 설계되어야 하며, 자세한 항목은 약관 및 개인정보 처리방침에서 확인할 수 있습니다.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>업데이트 안내</Text>

          <LineItem styles={styles}>기능 추가/변경 시 앱 내 공지 또는 스토어 업데이트 내역으로 안내합니다.</LineItem>
          <LineItem styles={styles}>권한/데이터 처리 방식이 바뀌는 경우에는 별도 고지합니다.</LineItem>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>기본 정보</Text>

          <LineItem styles={styles}>앱 버전: {appVersion}</LineItem>
          <LineItem styles={styles}>빌드: {buildVersion}</LineItem>
          <LineItem styles={styles}>저장 데이터: 메모/저장시각/세션ID, 핀 위치, 이동 경로(시간/정확도 포함)</LineItem>
          <LineItem styles={styles}>데이터 보관: 기능 제공을 위해 기기 내 저장을 기본으로 합니다.</LineItem>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>개발자 정보</Text>

          <LineItem styles={styles}>개발자: {DEVELOPER_NAME}</LineItem>
          <LineItem styles={styles}>문의: {CONTACT_EMAIL}</LineItem>
          <Text style={styles.hint}>버그/개선 제안은 프로필의 문의하기로 기기/OS/재현 방법을 함께 보내주세요.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shortcuts</Text>

          <View style={styles.listCard}>
            <ListRow
              styles={styles}
              title="약관 및 개인정보 처리방침 보기"
              desc="서비스 제공, 수집 항목, 보관/보호, 이용자 권리 등"
              onPress={openTerms}
            />
            <View style={styles.listDivider} />
            <ListRow styles={styles} title="도움말 열기" desc="기록 흐름, 지도 표시, 백그라운드 동작 안내" onPress={openHelp} />
            <View style={styles.listDivider} />
            <ListRow styles={styles} title="구독관리" desc="구독 상태 확인, 구매 복원, 스토어 관리" onPress={openSubs} />
          </View>
        </View>

        <Text style={styles.footerText}>© RiderNote</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type AppStyles = ReturnType<typeof createStyles>;

function LineItem({ children, styles }: { children: React.ReactNode; styles: AppStyles }) {
  return (
    <View style={styles.lineItem}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.lineTxt}>{children}</Text>
    </View>
  );
}

function ListRow({
  title,
  desc,
  onPress,
  styles
}: {
  title: string;
  desc: string;
  onPress: () => void;
  styles: AppStyles;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.listRow}>
      <View style={styles.menuTextCol}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuDesc}>{desc}</Text>
      </View>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

const ACCENT = "#1DD4F5";

function createStyles(theme: AppTheme) {
  const softNeutralBg = theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(29,44,59,0.06)";
  const divider = theme.mode === "dark" ? "rgba(255,255,255,0.10)" : "rgba(29,44,59,0.08)";
  const backColor = theme.mode === "dark" ? "rgba(255,255,255,0.85)" : "rgba(29,44,59,0.85)";
  const arrowColor = theme.mode === "dark" ? "rgba(255,255,255,0.40)" : "rgba(29,44,59,0.40)";

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
      justifyContent: "center",
      paddingLeft: 6
    },
    backTxt: { color: backColor, fontSize: 24, fontWeight: "700" },
    headerTitle: { flex: 1, textAlign: "center", color: theme.text, fontSize: 15, fontWeight: "700" },
    closeBtn: {
      width: 44,
      height: 36,
      borderRadius: 12,
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
    heroHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start"
    },
    heroLeft: { flex: 1 },
    heroTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
    heroSub: { color: theme.textSub, fontSize: 13, marginTop: 6, lineHeight: 18 },

    badgeRow: { marginTop: 14, flexDirection: "row" },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1
    },
    badgeOff: { borderColor: theme.border, backgroundColor: theme.mode === "dark" ? softNeutralBg : "rgba(29,212,245,0.12)" },
    badgeTxt: { fontSize: 12, fontWeight: "700" },
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

    lineItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
    bullet: { color: ACCENT, fontSize: 16, fontWeight: "700", marginRight: 8, marginTop: -1 },
    lineTxt: { color: theme.textSub, fontSize: 13, lineHeight: 18, flex: 1 },

    hint: { color: theme.textMuted, fontSize: 11, lineHeight: 16, marginTop: 6 },

    section: { marginTop: 14 },
    sectionTitle: { color: theme.text, fontSize: 13, fontWeight: "700", marginBottom: 10 },

    listCard: {
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden"
    },
    listRow: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10
    },
    listDivider: { height: 1, backgroundColor: divider },

    menuTextCol: { flex: 1, gap: 4 },
    menuTitle: { color: theme.text, fontSize: 13, fontWeight: "700" },
    menuDesc: { color: theme.textSub, fontSize: 11, lineHeight: 15 },
    menuArrow: { color: arrowColor, fontSize: 20, fontWeight: "700" },

    footerText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 16
    }
  });
}
