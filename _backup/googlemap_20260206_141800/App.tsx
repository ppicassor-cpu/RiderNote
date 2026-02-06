import Constants from "expo-constants";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import KakaoMap from "./src/components/KakaoMap";
import Tracker from "./src/native/NativeTracker";

type Center = { lat: number; lng: number };

function Main() {
  const insets = useSafeAreaInsets();

  const kakaoJsKey = useMemo(() => {
    const extra: any = (Constants.expoConfig as any)?.extra ?? {};
    return (extra.kakaoJavaScriptKey ?? "").toString();
  }, []);

  const [status, setStatus] = useState<string>("대기");
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [center, setCenter] = useState<Center>({ lat: 37.5665, lng: 126.9780 });

  const pollRef = useRef<any>(null);

  useEffect(() => {
    if (!isTracking) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const last = await Tracker.getLastLocation();
        if (last && last.lat && last.lng) {
          setCenter({ lat: last.lat, lng: last.lng });
        }
      } catch {}
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isTracking]);

  async function ensurePermissions(): Promise<boolean> {
    if (Platform.OS !== "android") return true;

    const req: string[] = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
    ];

    if (Number(Platform.Version) >= 33) {
      req.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }

    const res = await PermissionsAndroid.requestMultiple(req);
    const ok = Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    if (!ok) return false;

    if (Number(Platform.Version) >= 29) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
    }

    return true;
  }

  async function onStart() {
    try {
      setStatus("권한 확인 중...");
      const ok = await ensurePermissions();
      if (!ok) {
        setStatus("대기");
        Alert.alert("권한 필요", "위치 권한을 허용해야 시작할 수 있습니다.");
        return;
      }

      setStatus("오버레이 권한 확인 중...");
      const canOverlay = await Tracker.canDrawOverlays();
      if (!canOverlay) {
        setStatus("대기");
        Alert.alert(
          "다른 앱 위에 표시 권한 필요",
          "클립보드 저장 버튼(오버레이)을 띄우려면 권한이 필요합니다. 설정 화면으로 이동합니다."
        );
        await Tracker.openOverlaySettings();
        return;
      }

      setStatus("세션 시작 중...");
      const r = await Tracker.startSession();
      setSessionId(r.sessionId);
      setIsTracking(true);
      setStatus("기록 중");
    } catch (e: any) {
      setStatus("대기");
      Alert.alert("시작 실패", String(e?.message ?? e));
    }
  }

  async function onStop() {
    try {
      setStatus("종료 중...");
      const r = await Tracker.stopSession();
      setIsTracking(false);
      setSessionId(null);
      setStatus("대기");
      Alert.alert("종료됨", `세션 종료: ${r.sessionId}`);
    } catch (e: any) {
      setStatus("기록 중");
      Alert.alert("종료 실패", String(e?.message ?? e));
    }
  }

  const bottomPad = insets.bottom + 12;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <View style={styles.header}>
        <Text style={styles.title}>RiderMemoTracker</Text>
        <Text style={styles.sub}>
          {isTracking ? `세션: ${sessionId ?? "-"}` : "세션 없음"}  {status}
        </Text>
      </View>

      <View style={styles.mapWrap}>
        <KakaoMap kakaoJsKey={kakaoJsKey} center={center} style={StyleSheet.absoluteFill} />
      </View>

      <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={isTracking ? onStop : onStart}
          style={[styles.btn, isTracking ? styles.btnStop : styles.btnStart]}
        >
          <Text style={styles.btnText}>{isTracking ? "종료" : "시작"}</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          시작 버튼이 시스템 내비게이션바에 겹치지 않도록 하단 인셋({insets.bottom})을 반영했습니다.
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)"
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  sub: { marginTop: 4, color: "rgba(255,255,255,0.75)", fontSize: 12 },

  mapWrap: { flex: 1, backgroundColor: "#000" },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    zIndex: 9999,
    elevation: 50
  },

  btn: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  btnStart: { backgroundColor: "#18c2ff" },
  btnStop: { backgroundColor: "#ff3b3b" },
  btnText: { color: "#000", fontSize: 16, fontWeight: "800" },

  hint: { marginTop: 8, marginBottom: 6, color: "rgba(255,255,255,0.5)", fontSize: 11 }
});
