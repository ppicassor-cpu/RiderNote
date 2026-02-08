// FILE: C:\RiderNote\src\screens\HelpScreen.tsx
import React, { useMemo } from "react";
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme as AppTheme, useAppTheme } from "../theme/ThemeProvider";

type Props = {
  onBack: () => void;
  onClose: () => void;
};

export default function HelpScreen({ onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + 26;

  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const statusBarStyle = theme.mode === "dark" ? "light-content" : "dark-content";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={theme.statusBarBg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.85} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>도움말</Text>

        <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>닫기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} bounces={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeaderRow}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroSub}>기록 시작부터 저장/정리, 지도 표시, 백그라운드 동작까지 핵심만 모았습니다.</Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={[styles.badgeTxt, styles.badgeTxtOff]}>가이드</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>기본 흐름</Text>

          <LineItem styles={styles}>홈에서 기록 시작을 누르면 이동 경로가 자동으로 쌓입니다.</LineItem>
          <LineItem styles={styles}>저장하고 싶은 내용은 메모에서 바로 저장/편집합니다.</LineItem>
          <LineItem styles={styles}>기록 완료를 누르면 세션이 저장되고, 메모 기록에서 언제든 다시 볼 수 있습니다.</LineItem>

          <Text style={styles.hint}>팁: 메모는 짧게 남기고, 나중에 메모 기록에서 한 번에 정리하는 방식이 빠릅니다.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>지도 핀 / 경로가 안 보일 때</Text>

          <LineItem styles={styles}>위치 권한이 켜져 있는지 확인해 주세요(설정 → 앱 → 권한 → 위치).</LineItem>
          <LineItem styles={styles}>배터리 최적화/절전 모드가 기록을 끊을 수 있습니다(최적화 제외 권장).</LineItem>
          <LineItem styles={styles}>실내/지하/고층 건물 주변은 GPS 정확도가 떨어질 수 있습니다.</LineItem>

          <Text style={styles.hint}>팁: 잠깐 실외로 이동해 다시 측정하면 정확도가 올라가는 경우가 많습니다.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>백그라운드 기록이 끊기는 경우</Text>

          <LineItem styles={styles}>기록 안정성을 위해 ‘항상 허용’ 위치 권한이 필요할 수 있습니다.</LineItem>
          <LineItem styles={styles}>제조사별 절전 정책이 강하면 백그라운드 동작이 중단될 수 있습니다.</LineItem>
          <LineItem styles={styles}>최근 앱 목록에서 앱을 잠금하면 중단이 줄어드는 기기도 있습니다.</LineItem>

          <Text style={styles.hint}>권장: 배터리 최적화 해제 + 위치 항상 허용</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>자주 묻는 질문</Text>

          <Text style={styles.q}>Q. 메모는 어디에 저장되나요?</Text>
          <Text style={styles.a}>기본적으로 기기 내 저장소에 저장되며, 기능 제공을 위해 필요한 설정값도 함께 저장될 수 있습니다.</Text>

          <Text style={styles.q}>Q. 위치를 안 켜면 쓸 수 없나요?</Text>
          <Text style={styles.a}>메모 텍스트만 작성하는 것은 가능하지만, 핀/경로 기능은 제한될 수 있습니다.</Text>

          <Text style={styles.q}>Q. 앱이 느려졌어요.</Text>
          <Text style={styles.a}>기록이 많이 쌓이면 목록 렌더링이 무거워질 수 있습니다. 오래된 세션을 정리해 보세요.</Text>
        </View>

        <Text style={styles.footerText}>문제가 계속되면 프로필의 문의하기로 기기/OS/재현 방법을 함께 보내주세요.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function LineItem({ children, styles }: { children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.lineItem}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.lineTxt}>{children}</Text>
    </View>
  );
}

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
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      marginRight: 2
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
    heroTitle: { color: theme.text, fontSize: 20, fontWeight: "700" },
    heroSub: { color: theme.textSub2, fontSize: 13, marginTop: 4, lineHeight: 18 },

    badgeRow: { marginTop: 14, flexDirection: "row" },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1
    },
    badgeOff: { borderColor: theme.border, backgroundColor: theme.accentBg },
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
    bullet: { color: theme.ok, fontSize: 16, fontWeight: "700", marginRight: 8, marginTop: -1 },
    lineTxt: { color: theme.textSub, fontSize: 13, lineHeight: 18, flex: 1 },

    hint: { color: theme.textMuted, fontSize: 11, lineHeight: 16, marginTop: 6 },

    q: { marginTop: 10, color: theme.text, fontSize: 12, fontWeight: "700" },
    a: { color: theme.textSub, fontSize: 12, lineHeight: 18, marginTop: 4 },

    footerText: {
      color: theme.textSub2,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 14
    }
  });
}
