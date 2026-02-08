// FILE: C:\RiderNote\src\screens\TermsPrivacyScreen.tsx
import React, { useMemo } from "react";
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme as AppTheme, useAppTheme } from "../theme/ThemeProvider";

type Props = {
  onBack: () => void;
  onClose: () => void;
};

export default function TermsPrivacyScreen({ onBack, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + 26;

  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const statusBarStyle = theme.mode === "dark" ? "light-content" : "dark-content";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={theme.statusBarBg} />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity activeOpacity={0.85} onPress={onBack} style={styles.headerBackBtn}>
            <Text style={styles.headerBackText}>‹</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>약관  개인정보</Text>

          <TouchableOpacity activeOpacity={0.85} onPress={onClose} style={styles.headerCloseBtn}>
            <Text style={styles.headerCloseText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>◆ RiderNote 개인정보 처리방침</Text>
          <Text style={styles.heroSub}>▶ 시행일: 2026-02-07</Text>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={[styles.badgeTxt, styles.badgeTxtOff]}>개인정보</Text>
            </View>
          </View>
        </View>

        <Card styles={styles} title="1. 처리 목적">
          <Line styles={styles}>▶ RiderNote(이하 “서비스”)는 아래 목적에 필요한 범위에서만 개인정보를 처리합니다.</Line>
          <Line styles={styles}>▷ 메모 기록/저장/수정/삭제, 세션 관리 등 서비스 기능 제공</Line>
          <Line styles={styles}>▷ 지도 기반 표시(핀/경로) 및 기록 정리 기능 제공</Line>
          <Line styles={styles}>▷ 서비스 안정성 확보(오류 확인, 품질 개선)</Line>
          <Line styles={styles}>▷ 고객지원(문의 응대 및 문제 해결)</Line>
        </Card>

        <Card styles={styles} title="2. 처리하는 개인정보 항목">
          <Sub styles={styles}>2.1 이용자가 생성/입력하는 정보(기기 내 저장)</Sub>
          <Line styles={styles}>▶ 메모 및 기록 데이터</Line>
          <Line styles={styles}>▷ 메모 내용(제목/본문)</Line>
          <Line styles={styles}>▷ 저장/수정 시각</Line>
          <Line styles={styles}>▷ 세션 식별 정보(세션 ID 등 기능 제공을 위한 내부 관리 값)</Line>

          <Sub styles={styles}>2.2 위치정보(권한 동의 시, 기기 내 저장)</Sub>
          <Line styles={styles}>▶ 지도 표시 및 기록 연결을 위해 다음 정보가 처리될 수 있습니다.</Line>
          <Line styles={styles}>▷ 핀 위치(좌표)</Line>
          <Line styles={styles}>▷ 이동 경로(좌표), 이동 시간, 위치 정확도(가능한 경우)</Line>

          <Sub styles={styles}>2.3 자동으로 처리될 수 있는 정보(최소 범위)</Sub>
          <Line styles={styles}>▶ 서비스 품질 및 호환성 확인을 위해 다음 정보가 처리될 수 있습니다.</Line>
          <Line styles={styles}>▷ OS 종류/버전, 기기 모델, 언어/지역 설정</Line>
          <Line styles={styles}>▷ 앱 버전/빌드 정보</Line>
          <Line styles={styles}>▷ 오류/비정상 종료 관련 정보(발생 시점, 오류 내용 등 최소 범위)</Line>

          <Sub styles={styles}>2.4 결제/구독 관련(해당 기능 이용 시)</Sub>
          <Line styles={styles}>▶ 결제는 Apple App Store/Google Play 결제 시스템을 통해 처리됩니다.</Line>
          <Line styles={styles}>▷ 서비스는 신용카드 번호 등 결제수단 정보를 직접 수집·저장하지 않습니다.</Line>
          <Line styles={styles}>▷ 구독 상태 확인/복원을 위해 구매 여부, 구독 활성 상태 등 구독 확인에 필요한 최소 정보가 처리될 수 있습니다.</Line>

          <Sub styles={styles}>2.5 광고 관련(광고가 표시되는 경우)</Sub>
          <Line styles={styles}>▶ 무료 이용 환경에서 광고가 표시될 수 있으며, 광고 제공 과정에서 다음 정보가 처리될 수 있습니다.</Line>
          <Line styles={styles}>▷ 광고 식별자(기기 설정 및 정책에 따라 제한될 수 있음)</Line>
          <Line styles={styles}>▷ 광고 노출/클릭/빈도 관련 이벤트 정보</Line>
        </Card>

        <Card styles={styles} title="3. 보관 장소 및 보관 기간">
          <Sub styles={styles}>3.1 보관 장소(중요)</Sub>
          <Line styles={styles}>▶ 서비스는 서버 저장·동기화 기능을 제공하지 않습니다.</Line>
          <Line styles={styles}>▷ 이용자가 생성한 메모/세션/핀/경로 등 기록 데이터는 이용자 기기(개인폰) 내에만 저장됩니다.</Line>
          <Line styles={styles}>▷ 서비스는 이용 기록 데이터를 서버로 업로드하거나 서버에 보관하지 않습니다.</Line>
          <Line styles={styles}>▷ 이용자가 앱을 삭제하면 일반적으로 로컬 데이터도 함께 삭제됩니다(기기/OS 환경에 따라 백업/복원 설정의 영향을 받을 수 있습니다).</Line>

          <Sub styles={styles}>3.2 보관 기간</Sub>
          <Line styles={styles}>▶ 로컬 기록 데이터</Line>
          <Line styles={styles}>▷ 이용자가 삭제하기 전까지 보관(서비스 기능 제공 목적)</Line>
          <Line styles={styles}>▶ 고객지원(이메일 문의)</Line>
          <Line styles={styles}>▷ 문의 처리 완료 후 목적 달성 시까지 보관하며, 필요 최소 기간 보관 후 파기할 수 있습니다.</Line>
        </Card>

        <Card styles={styles} title="4. 개인정보의 파기">
          <Line styles={styles}>▶ 파기 사유가 발생하면 지체 없이 안전한 방법으로 파기합니다.</Line>
          <Line styles={styles}>▷ 앱 내 삭제 기능을 통해 이용자가 삭제한 기록은 기기 내 저장소에서 삭제 처리됩니다.</Line>
          <Line styles={styles}>▷ 앱 삭제 시 OS 정책에 따라 앱 데이터가 삭제됩니다.</Line>
        </Card>

        <Card styles={styles} title="5. 제3자 제공 및 처리위탁">
          <Sub styles={styles}>5.1 제3자 제공</Sub>
          <Line styles={styles}>▶ 서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.</Line>
          <Line styles={styles}>▷ 법령에 근거가 있거나 수사기관의 적법한 요청이 있는 경우 등 법령상 예외는 제외됩니다.</Line>

          <Sub styles={styles}>5.2 처리위탁 및 외부 서비스 연동</Sub>
          <Line styles={styles}>▶ 서비스는 결제/구독 처리, 광고 제공 등 기능 수행을 위해 외부 서비스를 연동할 수 있습니다.</Line>
          <Line styles={styles}>▷ 결제/구독: Apple/Google 결제 시스템을 통해 처리되며, 해당 사업자의 개인정보 처리방침이 적용됩니다.</Line>
          <Line styles={styles}>▷ 광고: 광고 제공 과정에서 광고 사업자 SDK가 광고 식별자 및 노출/측정 정보를 처리할 수 있습니다.</Line>
        </Card>

        <Card styles={styles} title="6. 이용자 권리 및 행사 방법">
          <Line styles={styles}>▶ 이용자는 다음 권리를 행사할 수 있습니다.</Line>
          <Line styles={styles}>▷ 기록 데이터 삭제: 앱 내 삭제 기능을 통해 이용자 기기 내 데이터 삭제</Line>
          <Line styles={styles}>▷ 위치 권한 철회/변경: 기기 설정에서 언제든 변경 가능</Line>
          <Line styles={styles}>▷ 문의: 개인정보 관련 문의 및 요청은 아래 연락처로 접수</Line>
          <Line styles={styles}>▶ 서비스는 서버에 이용 기록 데이터를 보관하지 않으므로, 기록 데이터 관련 요청은 이용자 기기 내 삭제/권한 변경 안내 중심으로 처리됩니다.</Line>
        </Card>

        <Card styles={styles} title="7. 위치정보 처리 및 권한 동의 절차(백그라운드 포함)">
          <Sub styles={styles}>7.1 위치정보 처리 원칙</Sub>
          <Line styles={styles}>▶ 위치정보는 지도 표시 및 기록 연결 목적에 한해, 이용자의 동의 및 권한 허용이 있는 경우에만 처리됩니다.</Line>
          <Line styles={styles}>▶ 위치 기반 데이터(핀/경로)는 서버로 전송·저장하지 않으며, 이용자 기기 내에만 저장됩니다.</Line>

          <Sub styles={styles}>7.2 백그라운드 위치 사용 여부</Sub>
          <Line styles={styles}>▶ 서비스는 백그라운드 위치(항상 허용) 권한을 필수로 요구하지 않으며, 기본적으로 앱 사용 중에만 위치를 사용합니다.</Line>
          <Line styles={styles}>▶ 서비스는 앱이 백그라운드 상태일 때 이용자 위치를 지속적으로 수집·저장하지 않습니다.</Line>

          <Sub styles={styles}>7.3 권한 요청 및 동의 절차</Sub>
          <Line styles={styles}>▶ 서비스는 위치 기능이 필요한 시점에 위치 권한을 요청하며, 권한을 거부해도 위치 기반 기능을 제외한 나머지 기능은 이용할 수 있습니다.</Line>
          <Line styles={styles}>▶ 이용자는 기기 설정에서 위치 권한(정확한 위치 포함)을 언제든 허용/거부/변경할 수 있습니다.</Line>
        </Card>

        <Card styles={styles} title="8. 개인정보 보호책임자">
          <Line styles={styles}>▶ 개인정보 보호책임자: RiderNote 운영 담당자 손성현</Line>
          <Line styles={styles}>▷ 이메일: ppicassor@gmail.com</Line>
        </Card>

        <Card styles={styles} title="9. 처리방침 변경 및 고지">
          <Line styles={styles}>▶ 본 처리방침은 법령, 서비스 기능 변경, 정책 변경에 따라 개정될 수 있습니다.</Line>
          <Line styles={styles}>▷ 중요한 변경이 있는 경우 앱 내 공지 등 합리적인 방법으로 고지합니다.</Line>
        </Card>

        <Text style={styles.footerText}>문의/요청은 프로필의 문의하기를 이용해주세요.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ title, children, styles }: { title: string; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Sub({ children, styles }: { children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return <Text style={styles.subTitle}>{children}</Text>;
}

function Line({ children, styles }: { children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return <Text style={styles.line}>{children}</Text>;
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.rootBg },

    header: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 10,
      backgroundColor: theme.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    headerRow: { height: 36, alignItems: "center", justifyContent: "center" },
    headerBackBtn: {
      position: "absolute",
      left: 8,
      height: 36,
      minWidth: 36,
      alignItems: "flex-start",
      justifyContent: "center"
    },
    headerBackText: { color: theme.text, fontSize: 24, fontWeight: "700" },
    headerTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
    headerCloseBtn: {
      position: "absolute",
      right: 8,
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

    content: { paddingHorizontal: 16, paddingTop: 14 },

    heroCard: {
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 14
    },
    heroTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
    heroSub: { color: theme.textSub2, fontSize: 13, marginTop: 6, lineHeight: 18 },

    badgeRow: { marginTop: 14, flexDirection: "row" },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1
    },
    badgeOff: { borderColor: theme.accentBorder, backgroundColor: theme.accentBg },
    badgeTxt: { fontSize: 12, fontWeight: "700" },
    badgeTxtOff: { color: theme.accentText },

    card: {
      backgroundColor: theme.surfaceBg,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 12
    },
    cardTitle: { color: theme.text, fontSize: 14, fontWeight: "700", marginBottom: 10 },
    cardBody: { gap: 6 },

    subTitle: { marginTop: 4, color: theme.text, fontSize: 12, fontWeight: "700" },
    line: { color: theme.textSub, fontSize: 12, lineHeight: 18 },

    footerText: {
      color: theme.textSub2,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 14,
      marginBottom: 6
    }
  });
}
