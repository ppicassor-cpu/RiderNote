// FILE: C:\RiderNote\App.tsx 
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AppState,
  AppStateStatus,
  Linking,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import GoogleMap, { MemoPin, RoutePoint } from "./src/components/GoogleMap";
import Tracker, { MemoItem, ManualLocationState } from "./src/native/NativeTracker";
import MemoHistoryScreen from "./src/screens/MemoHistoryScreen";

// ------------------------------------------------------------------
// 1. Types & Utilities
// ------------------------------------------------------------------
type Center = { lat: number; lng: number };

type PermState = {
  locationFg: boolean;
  locationBg: boolean;
  overlay: boolean;
  notifications: boolean;
};

type PopupButton = {
  text: string;
  onPress?: () => void | Promise<void>;
  variant?: "primary" | "secondary";
};

type PopupState = {
  visible: boolean;
  title: string;
  message: string;
  buttons: PopupButton[];
};

type MapViewState = {
  zoom?: number;
  latDelta?: number;
  lngDelta?: number;
};

type SessionSnapshot = {
  sessionId: string | null;
  startedAt: number | null;
  endedAt: number;
  memos: MemoItem[];
  route: RoutePoint[];
};

type SessionSlots = {
  slot1: SessionSnapshot | null; // 최신
  slot2: SessionSnapshot | null; // 직전
  slot3: SessionSnapshot | null; // 그 전
};

function fmtTime(ms?: number) {
  const t = typeof ms === "number" && ms > 0 ? ms : 0;
  if (!t) return "-";
  try {
    return new Date(t).toLocaleString("ko-KR", { hour12: false });
  } catch {
    return String(t);
  }
}

function numOrNull(x: any): number | null {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------
// 2. Sub-Components
// ------------------------------------------------------------------

const AlertPopup = ({
  state,
  onClose
}: {
  state: PopupState;
  onClose: () => void;
}) => {
  return (
    <View pointerEvents={state.visible ? "auto" : "none"} style={[StyleSheet.absoluteFill, { zIndex: state.visible ? 40000 : -1 }]}>
      {state.visible ? (
        <View style={styles.popupDim}>
          <View style={styles.popupBox}>
            <Text style={styles.popupTitle}>{state.title}</Text>
            <Text style={styles.popupMsg}>{state.message}</Text>
            <View style={styles.popupBtns}>
              {state.buttons.map((b, idx) => (
                <TouchableOpacity
                  key={`${b.text}_${idx}`}
                  activeOpacity={0.88}
                  style={[styles.popupBtn, b.variant === "secondary" ? styles.popupBtnSecondary : styles.popupBtnPrimary]}
                  onPress={async () => {
                    try { await b.onPress?.(); } finally { onClose(); }
                  }}
                >
                  <Text style={[styles.popupBtnText, b.variant === "secondary" ? styles.popupBtnTextSecondary : styles.popupBtnTextPrimary]}>
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
};

const PermissionGate = ({
  perm,
  onFix
}: {
  perm: PermState;
  onFix: () => void;
}) => {
  return (
    <View style={styles.gateRoot} pointerEvents="auto">
      <View style={styles.gateBox}>
        <Text style={[styles.gateTitle, { textAlign: "center", alignSelf: "stretch" }]}>필수 권한을 켜야 시작할 수 있어요 🌸</Text>
        <Text style={[styles.gateDesc, { textAlign: "center", alignSelf: "stretch" }]}>아래 항목을 “항상 허용”으로 바꾼 뒤 다시 시작해 주세요.</Text>

        <View style={styles.gateRow}>
          <Text style={styles.gateLabel}>📍 위치(포그라운드)</Text>
          <Text style={[styles.gateValue, perm.locationFg ? styles.ok : styles.bad]}>
            {perm.locationFg ? "허용됨" : "필수"}
          </Text>
        </View>

        {Number(Platform.Version) >= 29 && (
          <View style={styles.gateRow}>
            <Text style={styles.gateLabel}>🌙 위치(백그라운드)</Text>
            <Text style={[styles.gateValue, perm.locationBg ? styles.ok : styles.bad]}>
              {perm.locationBg ? "허용됨" : "필수"}
            </Text>
          </View>
        )}

        <View style={styles.gateRow}>
          <Text style={styles.gateLabel}>🧷 다른 앱 위에 표시</Text>
          <Text style={[styles.gateValue, perm.overlay ? styles.ok : styles.bad]}>
            {perm.overlay ? "허용됨" : "필수"}
          </Text>
        </View>

        {Number(Platform.Version) >= 33 && (
          <View style={styles.gateRow}>
            <Text style={styles.gateLabel}>🔔 알림</Text>
            <Text style={[styles.gateValue, perm.notifications ? styles.ok : styles.bad]}>
              {perm.notifications ? "허용됨" : "필수"}
            </Text>
          </View>
        )}

        <TouchableOpacity activeOpacity={0.88} onPress={onFix} style={styles.gateBtn}>
          <Text style={styles.gateBtnText}>권한 켜러 가기</Text>
        </TouchableOpacity>

        <Text style={[styles.gateHint, { textAlign: "center", alignSelf: "stretch" }]}>
          설정 화면에서 권한을 켠 뒤 앱으로 돌아오면 자동으로 확인하고 시작 가능 상태로 바뀝니다.
        </Text>
      </View>
    </View>
  );
};

// ------------------------------------------------------------------
// 3. Main Logic & Layout
// ------------------------------------------------------------------

function Main() {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + 12;
  const bottomBarReserve = bottomPad + 106;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pollRef = useRef<any>(null);

  const MAP_VIEW_KEY = "map_view_state_v1";

  // ✅ 최근 3개 세션 슬롯 저장 키
  const SESSION_SLOTS_KEY = "session_slots_v1";

  const [status, setStatus] = useState<string>("대기");
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [center, setCenter] = useState<Center>({ lat: 37.5665, lng: 126.978 });
  const [updateReady, setUpdateReady] = useState<boolean>(false);

  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [manual, setManual] = useState<ManualLocationState>({ enabled: false, lat: 0, lng: 0, acc: 0 });

  const [historyVisible, setHistoryVisible] = useState<boolean>(false);
  const [permGateVisible, setPermGateVisible] = useState<boolean>(false);
  const [perm, setPerm] = useState<PermState>({ locationFg: false, locationBg: false, overlay: false, notifications: false });
  const [popup, setPopup] = useState<PopupState>({ visible: false, title: "", message: "", buttons: [] });

  const [mapView, setMapView] = useState<MapViewState>({ zoom: 17 });

  const centerRef = useRef<Center>(center);
  const memoSigRef = useRef<string>("");
  const routeSigRef = useRef<string>("");
  const autoCenteredRef = useRef<boolean>(false);

  const mapViewLoadedRef = useRef<boolean>(false);
  const mapViewSaveRef = useRef<any>(null);
  const mapViewRef = useRef<MapViewState>(mapView);

  const lastClipRef = useRef<string>("");
  const clipPollRef = useRef<any>(null);

  // ✅ 세션 시작/종료 시간(스냅샷 route 필터용)
  const sessionStartedAtRef = useRef<number | null>(null);

  const readSessionSlots = useCallback(async (): Promise<SessionSlots> => {
    try {
      const s = await AsyncStorage.getItem(SESSION_SLOTS_KEY);
      if (!s) return { slot1: null, slot2: null, slot3: null };
      const v = JSON.parse(s);
      return {
        slot1: v?.slot1 ?? null,
        slot2: v?.slot2 ?? null,
        slot3: v?.slot3 ?? null
      };
    } catch {
      return { slot1: null, slot2: null, slot3: null };
    }
  }, []);

  const writeSessionSlots = useCallback(async (slots: SessionSlots) => {
    try {
      await AsyncStorage.setItem(SESSION_SLOTS_KEY, JSON.stringify(slots));
    } catch {}
  }, []);

  const pushSessionSnapshot = useCallback(async (snap: SessionSnapshot) => {
    try {
      const prev = await readSessionSlots();
      const next: SessionSlots = {
        slot1: snap,
        slot2: prev.slot1 ?? null,
        slot3: prev.slot2 ?? null
      };
      await writeSessionSlots(next);
    } catch {}
  }, [readSessionSlots, writeSessionSlots]);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    mapViewRef.current = mapView;
  }, [mapView]);

  useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(MAP_VIEW_KEY);
        if (s) {
          const v = JSON.parse(s);
          const z = numOrNull(v?.zoom);
          const ld = numOrNull(v?.latDelta);
          const gd = numOrNull(v?.lngDelta);
          const next: MapViewState = {};
          if (z !== null) next.zoom = z;
          if (ld !== null) next.latDelta = ld;
          if (gd !== null) next.lngDelta = gd;
          if (Object.keys(next).length) setMapView(next);
        }
      } catch {}
      mapViewLoadedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!mapViewLoadedRef.current) return;
    if (mapViewSaveRef.current) clearTimeout(mapViewSaveRef.current);
    mapViewSaveRef.current = setTimeout(async () => {
      try {
        const v = mapViewRef.current;
        await AsyncStorage.setItem(MAP_VIEW_KEY, JSON.stringify(v ?? {}));
      } catch {}
    }, 350);
    return () => {
      if (mapViewSaveRef.current) clearTimeout(mapViewSaveRef.current);
      mapViewSaveRef.current = null;
    };
  }, [mapView]);

  const setCenterStable = useCallback((lat: number, lng: number, force = false) => {
    const prev = centerRef.current;
    if (!force) {
      const dLat = Math.abs(prev.lat - lat);
      const dLng = Math.abs(prev.lng - lng);
      if (dLat < 0.00005 && dLng < 0.00005) return;
    }
    setCenter({ lat, lng });
  }, []);

  const handleMapViewChange = useCallback((payload: any) => {
    try {
      const z = numOrNull(payload?.zoom ?? payload?.camera?.zoom ?? payload?.nativeEvent?.zoom);
      const ld = numOrNull(
        payload?.latitudeDelta ??
        payload?.latDelta ??
        payload?.region?.latitudeDelta ??
        payload?.nativeEvent?.latitudeDelta
      );
      const gd = numOrNull(
        payload?.longitudeDelta ??
        payload?.lngDelta ??
        payload?.region?.longitudeDelta ??
        payload?.nativeEvent?.longitudeDelta
      );

      if (z === null && (ld === null || gd === null)) return;

      setMapView(prev => {
        const next: MapViewState = { ...prev };
        let changed = false;

        if (z !== null && next.zoom !== z) { next.zoom = z; changed = true; }
        if (ld !== null && next.latDelta !== ld) { next.latDelta = ld; changed = true; }
        if (gd !== null && next.lngDelta !== gd) { next.lngDelta = gd; changed = true; }

        return changed ? next : prev;
      });
    } catch {}
  }, []);

  const closePopup = useCallback(() => setPopup(p => ({ ...p, visible: false })), []);

  const openPopup = useCallback((title: string, message: string, buttons?: PopupButton[]) => {
    const btns: PopupButton[] = buttons?.length
      ? buttons
      : [{ text: "확인", variant: "primary", onPress: closePopup }];

    setPopup({ visible: true, title, message, buttons: btns });
  }, [closePopup]);

  const checkPermissions = useCallback(async (): Promise<PermState> => {
    if (Platform.OS !== "android") return { locationFg: true, locationBg: true, overlay: true, notifications: true };
    const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const coarse = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
    let locationBg = true;
    if (Number(Platform.Version) >= 29) locationBg = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
    let notifications = true;
    if (Number(Platform.Version) >= 33) notifications = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    let overlay = false;
    try { overlay = await Tracker.canDrawOverlays(); } catch { overlay = false; }
    return { locationFg: fine || coarse, locationBg, overlay, notifications };
  }, []);

  const requestAllRequiredPermissions = useCallback(async (): Promise<{ ok: boolean; hardDenied: boolean }> => {
    if (Platform.OS !== "android") return { ok: true, hardDenied: false };
    const fgRes = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
    ]);
    const fgValues = Object.values(fgRes);
    if (!fgValues.some(v => v === PermissionsAndroid.RESULTS.GRANTED)) {
      return { ok: false, hardDenied: fgValues.some(v => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) };
    }
    if (Number(Platform.Version) >= 29) {
      const bgRes = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
      if (bgRes !== PermissionsAndroid.RESULTS.GRANTED) return { ok: false, hardDenied: bgRes === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN };
    }
    if (Number(Platform.Version) >= 33) {
      const nRes = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (nRes !== PermissionsAndroid.RESULTS.GRANTED) return { ok: false, hardDenied: nRes === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN };
    }
    return { ok: true, hardDenied: false };
  }, []);

  const ensureAllRequired = useCallback(async (): Promise<boolean> => {
    setStatus("권한 확인 중...");
    const now = await checkPermissions();
    setPerm(now);
    const need = !now.locationFg || (Number(Platform.Version) >= 29 && !now.locationBg) ||
                 (Number(Platform.Version) >= 33 && !now.notifications) || !now.overlay;
    if (!need) return true;
    setPermGateVisible(true);
    setStatus("대기");
    return false;
  }, [checkPermissions]);

  const readClipboardText = useCallback(async (): Promise<string> => {
    try {
      const t = await (Tracker as any).getClipboardText?.();
      if (typeof t === "string") return t;
    } catch {}
    try {
      const t = await (Tracker as any).readClipboardText?.();
      if (typeof t === "string") return t;
    } catch {}
    try {
      const t = await (Tracker as any).getClipboard?.();
      if (typeof t === "string") return t;
    } catch {}
    try {
      const t = await (Tracker as any).getSavedClipboard?.();
      if (typeof t === "string") return t;
    } catch {}
    return "";
  }, []);

  const writeSavedClipboard = useCallback(async (text: string) => {
    const fns = [
      (Tracker as any).setSavedClipboard,
      (Tracker as any).setClipboardCache,
      (Tracker as any).saveClipboardCache,
      (Tracker as any).cacheClipboardText,
      (Tracker as any).saveClipboardText
    ];
    for (const fn of fns) {
      if (typeof fn === "function") {
        try { await fn(text); } catch {}
      }
    }
  }, []);

  const cacheClipboardNow = useCallback(async () => {
    try {
      if (typeof (Tracker as any).cacheClipboard === "function") {
        try { await (Tracker as any).cacheClipboard(); } catch {}
      }
      const t = (await readClipboardText())?.toString?.() ?? "";
      const text = t.trim();
      if (!text) return;
      if (lastClipRef.current === text) return;
      lastClipRef.current = text;
      await writeSavedClipboard(text);
    } catch {}
  }, [readClipboardText, writeSavedClipboard]);

  const saveFromClipboard = useCallback(async () => {
    try {
      await cacheClipboardNow();
      const t = (await readClipboardText())?.toString?.() ?? "";
      const text = t.trim();
      if (!text) {
        openPopup("저장 실패", "클립보드에 저장할 내용이 없습니다.");
        return;
      }

      const noArg = [
        (Tracker as any).saveFromClipboard,
        (Tracker as any).saveMemoFromClipboard,
        (Tracker as any).saveNoteFromClipboard,
        (Tracker as any).saveClipboardMemo
      ];
      for (const fn of noArg) {
        if (typeof fn === "function") {
          try { await fn(); return; } catch {}
        }
      }

      const withArg = [
        (Tracker as any).saveMemoText,
        (Tracker as any).saveNoteText,
        (Tracker as any).saveMemo,
        (Tracker as any).saveNote,
        (Tracker as any).saveTextMemo
      ];
      for (const fn of withArg) {
        if (typeof fn === "function") {
          try { await fn(text); return; } catch {}
        }
      }

      openPopup("저장 실패", "저장 동작을 처리할 함수가 연결되어 있지 않습니다.");
    } catch (e: any) {
      openPopup("저장 실패", String(e?.message ?? e));
    }
  }, [cacheClipboardNow, openPopup, readClipboardText]);

  const autoCenterOnce = useCallback(async () => {
    if (manual.enabled) return;
    if (autoCenteredRef.current) return;

    let did = false;
    const setOnce = (lat: number, lng: number) => {
      did = true;
      autoCenteredRef.current = true;
      setCenterStable(lat, lng, true);
    };

    try {
      const geo: any = (globalThis as any).navigator?.geolocation;
      if (geo && typeof geo.getCurrentPosition === "function") {
        await new Promise<void>((resolve) => {
          geo.getCurrentPosition(
            (pos: any) => {
              const lat = numOrNull(pos?.coords?.latitude);
              const lng = numOrNull(pos?.coords?.longitude);
              if (lat !== null && lng !== null) setOnce(lat, lng);
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        });
      }
    } catch {}

    if (did) return;

    try {
      const last = await Tracker.getLastLocation();
      if (last && typeof last.lat === "number" && typeof last.lng === "number") {
        setOnce(last.lat, last.lng);
      }
    } catch {}
  }, [manual.enabled, setCenterStable]);

  const runPermissionFixFlow = useCallback(async () => {
    setStatus("권한 요청 중...");
    const req = await requestAllRequiredPermissions();
    if (!req.ok) {
      setStatus("대기");
      openPopup("필수 권한이 필요해요 🌸", req.hardDenied ? "설정으로 이동해서 권한을 켜주세요." : "권한을 허용해 주세요.", [
        { text: "설정으로 이동", variant: "primary", onPress: async () => { try { await Linking.openSettings(); } catch {} } }
      ]);
      return;
    }
    let overlayOk = false;
    try { overlayOk = await Tracker.canDrawOverlays(); } catch {
      setStatus("대기"); openPopup("오류", "오버레이 권한 확인 불가"); return;
    }
    if (!overlayOk) {
      setStatus("오버레이 권한 설정 이동...");
      openPopup("다른 앱 위에 표시가 필요해요 📝", "설정 화면에서 ‘허용’으로 바꿔 주세요.", [
        { text: "설정으로 이동", variant: "primary", onPress: async () => await Tracker.openOverlaySettings() }
      ]);
      setStatus("대기");
      return;
    }
    const again = await checkPermissions();
    setPerm(again);
    const allOk = again.locationFg && (Number(Platform.Version) < 29 || again.locationBg) &&
                  (Number(Platform.Version) < 33 || again.notifications) && again.overlay;
    setPermGateVisible(!allOk);
    if (again.locationFg) await autoCenterOnce();
    setStatus("대기");
  }, [checkPermissions, openPopup, requestAllRequiredPermissions, autoCenterOnce]);

  const refreshMemosSilent = useCallback(async () => {
    try {
      const arr = await Tracker.getMemos();
      const sorted = [...(arr || [])].sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
      const head = sorted[0];
      const tail = sorted[sorted.length - 1];
      const sig = `${sorted.length}_${Number(head?.savedAt || 0)}_${Number(tail?.savedAt || 0)}`;
      if (sig === memoSigRef.current) return;
      memoSigRef.current = sig;
      setMemos(sorted);
    } catch {}
  }, []);

  const refreshRouteSilent = useCallback(async () => {
    try {
      const arr: any[] = await Tracker.getRoute();
      const next = (arr || [])
        .filter(p => typeof p?.lat === "number" && typeof p?.lng === "number")
        .map(p => ({ lat: p.lat, lng: p.lng, t: p.t, acc: p.acc }));

      const last = next[next.length - 1];
      const lastSig = last ? `${Number(last.lat).toFixed(6)}_${Number(last.lng).toFixed(6)}_${Number(last.t || 0)}` : "none";
      const sig = `${next.length}_${lastSig}`;
      if (sig === routeSigRef.current) return;
      routeSigRef.current = sig;

      setRoute(next);
    } catch { setRoute([]); }
  }, []);

  const refreshManual = useCallback(async () => {
    try {
      const s = await Tracker.getManualLocation();
      setManual(s);
      if (s?.enabled && typeof s.lat === "number" && typeof s.lng === "number") {
        setCenterStable(s.lat, s.lng, true);
      }
    } catch { setManual({ enabled: false, lat: 0, lng: 0, acc: 0 }); }
  }, [setCenterStable]);

  const refreshAll = useCallback(async (withError = false) => {
    try {
      await refreshMemosSilent();
      await refreshRouteSilent();
      await refreshManual();
    } catch (e: any) {
      if (withError) openPopup("데이터 로드 실패 🥲", String(e?.message ?? e));
    }
  }, [refreshManual, refreshMemosSilent, refreshRouteSilent, openPopup]);

  useEffect(() => {
    let mounted = true;
    const ranRef = { current: false };
    (async () => {
      try {
        if (ranRef.current || !Updates.isEnabled) return;
        ranRef.current = true;
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) { await Updates.fetchUpdateAsync(); if (mounted) setUpdateReady(true); }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!updateReady || isTracking || permGateVisible || popup.visible || historyVisible) return;
    (async () => { try { await Updates.reloadAsync(); } catch {} })();
  }, [updateReady, isTracking, permGateVisible, popup.visible, historyVisible]);

  useEffect(() => {
    (async () => {
      const p = await checkPermissions();
      setPerm(p);
      const need = !p.locationFg || (Number(Platform.Version) >= 29 && !p.locationBg) ||
                   (Number(Platform.Version) >= 33 && !p.notifications) || !p.overlay;
      if (need) setPermGateVisible(true);
      await refreshAll();
      if (p.locationFg) await autoCenterOnce();
    })();
  }, [checkPermissions, refreshAll, autoCenterOnce]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        const p = await checkPermissions();
        setPerm(p);
        const allOk = p.locationFg && (Number(Platform.Version) < 29 || p.locationBg) &&
                      (Number(Platform.Version) < 33 || p.notifications) && p.overlay;
        setPermGateVisible(!allOk);
        await refreshAll();
        if (p.locationFg) await autoCenterOnce();
      }
    });
    return () => sub.remove();
  }, [checkPermissions, refreshAll, autoCenterOnce]);

  useEffect(() => {
    const start = async () => {
      if (clipPollRef.current) return;
      await cacheClipboardNow();
      clipPollRef.current = setInterval(async () => {
        await cacheClipboardNow();
      }, 1200);
    };
    const stop = () => {
      if (clipPollRef.current) clearInterval(clipPollRef.current);
      clipPollRef.current = null;
    };

    const sub = AppState.addEventListener("change", async (next) => {
      if (next === "active") await start();
      else stop();
    });

    if (AppState.currentState === "active") {
      (async () => { await start(); })();
    }

    return () => {
      sub.remove();
      stop();
    };
  }, [cacheClipboardNow]);

  useEffect(() => {
    const handleUrl = async (url: string) => {
      try {
        if (!url) return;
        const u = url.toLowerCase();
        if (u.includes("save") || u.includes("clipboard")) {
          await saveFromClipboard();
          await refreshAll();
        }
      } catch {}
    };

    const sub = Linking.addEventListener("url", async (ev: any) => {
      await handleUrl(ev?.url ?? "");
    });

    (async () => {
      try {
        const u = await Linking.getInitialURL();
        if (u) await handleUrl(u);
      } catch {}
    })();

    return () => {
      try { (sub as any).remove?.(); } catch {}
    };
  }, [refreshAll, saveFromClipboard]);

  useEffect(() => {
    try {
      const sub = Tracker.onNoteSaved(async (ev) => {
        await refreshMemosSilent(); await refreshRouteSilent();
        const lat = numOrNull((ev as any)?.lat);
        const lng = numOrNull((ev as any)?.lng);
        if (lat !== null && lng !== null && !manual.enabled) setCenterStable(lat, lng);
      });
      return () => sub.remove();
    } catch { return; }
  }, [manual.enabled, refreshMemosSilent, refreshRouteSilent, setCenterStable]);

  useEffect(() => {
    if (!isTracking) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        if (!manual.enabled) {
          const last = await Tracker.getLastLocation();
          if (last && typeof last.lat === "number" && typeof last.lng === "number") {
            setCenterStable(last.lat, last.lng);
          }
        }
      } catch {}
      await refreshMemosSilent(); await refreshRouteSilent();
    }, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };
  }, [isTracking, manual.enabled, refreshMemosSilent, refreshRouteSilent, setCenterStable]);

  const onStart = async () => {
    try {
      const ok = await ensureAllRequired();
      if (!ok) return;
      setStatus("세션 시작 중...");
      const r = await Tracker.startSession();
      const startedAt = r.startTime;
      sessionStartedAtRef.current = startedAt;
      setSessionId(r.sessionId);
      setIsTracking(true);
      setStatus("기록 중");
      await refreshAll();
    } catch (e: any) {
      setStatus("대기"); openPopup("시작이 안 됐어요 🥲", String(e?.message ?? e));
    }
  };

  const onStop = async () => {
    try {
      setStatus("종료 중...");

      const endedSessionId = sessionId;
      const startedAt = sessionStartedAtRef.current;

      const r: any = await Tracker.stopSession();
      const endedAt = r.endTime;
      setIsTracking(false);
      setSessionId(null);
      setStatus("대기");

      let memoCount = 0;
      let allMemos: MemoItem[] = [];
      try {
        const arr = await Tracker.getMemos();
        allMemos = (arr || []) as MemoItem[];
        memoCount = allMemos.length;
      } catch {
        memoCount = 0;
        allMemos = [];
      }

      // ✅ 세션 스냅샷 생성 및 슬롯 저장(최신=slot1)
      try {
        const sessionMemos = endedSessionId
          ? allMemos.filter((m: any) => (m as any)?.sessionId === endedSessionId)
          : [];

        let rawRoute: any[] = [];
        try {
          rawRoute = (await Tracker.getRoute()) as any[];
        } catch {
          rawRoute = [];
        }

        let sessionRoute: RoutePoint[] = (rawRoute || [])
          .filter(p => typeof p?.lat === "number" && typeof p?.lng === "number")
          .map(p => ({ lat: p.lat, lng: p.lng, t: p.t, acc: p.acc }));

        if (typeof startedAt === "number") {
          const filtered = sessionRoute.filter((p: any) => {
            const tt = numOrNull((p as any)?.t);
            if (tt === null) return false;
            return tt >= startedAt && tt <= endedAt;
          });
          if (filtered.length >= 2) sessionRoute = filtered;
        }

        if (sessionRoute.length < 2 && route.length >= 2) {
          sessionRoute = route;
        }

        const snap: SessionSnapshot = {
          sessionId: endedSessionId,
          startedAt: typeof startedAt === "number" ? startedAt : null,
          endedAt,
          memos: sessionMemos,
          route: sessionRoute
        };

        await pushSessionSnapshot(snap);
      } catch {}

      sessionStartedAtRef.current = null;

      const km = typeof r.totalKm === "number" ? r.totalKm : (r.totalMeters || r.distanceMeters || 0) / 1000;
      const min = typeof r.totalMinutes === "number" ? r.totalMinutes : (r.totalSeconds ? r.totalSeconds / 60 : (r.durationMs || 0) / 60000);
      const lines = [`총 거리: ${km.toFixed(2)}km`, `총 시간: ${min.toFixed(1)}분`, `총 메모: ${memoCount}개`];

      await refreshAll();
      openPopup("오늘 기록 완료", lines.join("\n"), [{ text: "확인", variant: "primary" }]);
    } catch (e: any) {
      setStatus("기록 중"); openPopup("종료가 안 됐어요 🥲", String(e?.message ?? e));
    }
  };

  const memoPinMeta = useMemo(() => {
    return memos
      .filter(m => typeof m?.lat === "number" && typeof m?.lng === "number")
      .map((m, i) => {
        const id = `${m.sessionId ?? "s"}_${m.savedAt ?? 0}_${i}`;
        const fullText = (m.text ?? "").toString();
        const oneLine = fullText.replace(/\s+/g, " ").trim();
        const previewText = oneLine.length > 24 ? oneLine.slice(0, 24) + "…" : oneLine;

        return {
          id,
          lat: m.lat as number,
          lng: m.lng as number,
          previewText,
          fullText,
          savedAt: typeof m.savedAt === "number" ? m.savedAt : undefined,
          sessionId: m.sessionId
        };
      });
  }, [memos]);

  const memoPins: MemoPin[] = useMemo(() => {
    return memoPinMeta.map(p => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      text: p.previewText,
      savedAt: p.savedAt,
      sessionId: p.sessionId
    }));
  }, [memoPinMeta]);

  const memoSummary = useMemo(() => {
    return `총 메모 ${memos.length}개`;
  }, [memos.length]);

  const fitSessionKey = useMemo(() => {
    if (!sessionId) return undefined;
    const enough = route.length >= 2 || memoPins.length >= 2;
    return enough ? sessionId : undefined;
  }, [sessionId, route.length, memoPins.length]);

  const statusLabel = useMemo(() => {
    if (isTracking) return "기록중입니다.";
    if (status === "대기") return "대기중입니다.";
    return "대기중입니다.";
  }, [isTracking, status]);

  const GoogleMapAny = GoogleMap as any;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={styles.root.backgroundColor as any} />

      {historyVisible ? (
        <MemoHistoryScreen
          memos={memos}
          route={route}
          sessionId={sessionId}
          onClose={() => setHistoryVisible(false)}
        />
      ) : (
        <>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Text style={styles.headerStatus} numberOfLines={1} ellipsizeMode="tail">
                {statusLabel}
              </Text>

              <View style={styles.headerRightRow}>
                <Text style={styles.memoCountText} numberOfLines={1} ellipsizeMode="tail">
                  {memoSummary}
                </Text>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={async () => { await refreshAll(true); setHistoryVisible(true); }}
                  style={styles.headerMemoBtn}
                >
                  <Text style={styles.headerMemoBtnText}>메모</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={[styles.mapWrap, { marginBottom: bottomBarReserve }]}>
            <GoogleMapAny
              center={center}
              style={StyleSheet.absoluteFill}
              route={route}
              memoPins={memoPins}
              fitSessionId={fitSessionKey}
              zoom={mapView.zoom}
              initialZoom={mapView.zoom}
              latDelta={mapView.latDelta}
              lngDelta={mapView.lngDelta}
              onViewStateChange={handleMapViewChange}
              onZoomChanged={handleMapViewChange}
              onCameraChanged={handleMapViewChange}
              onRegionChangeComplete={handleMapViewChange}
            />
          </View>

          <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
            <View style={styles.bottomRow}>
              <TouchableOpacity activeOpacity={0.88} onPress={isTracking ? onStop : onStart} style={[styles.btn, isTracking ? styles.btnStop : styles.btnStart]}>
                <Text style={styles.btnText}>{isTracking ? "기록완료" : "기록시작"}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>홈 지도에 핀이 계속 표시됩니다. 핀을 탭하면 지도에서 바로 메모를 확인할 수 있어요. (경로/핀은 자동으로 화면에 맞춰집니다)</Text>
          </View>
        </>
      )}

      {permGateVisible && <PermissionGate perm={perm} onFix={runPermissionFixFlow} />}
      <AlertPopup state={popup} onClose={closePopup} />
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

// ------------------------------------------------------------------
// 4. Styles
// ------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7FAFF" },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "rgba(29,44,59,0.10)" },
  title: { color: "#1D2C3B", fontSize: 18, fontWeight: "900" },
  sub: { marginTop: 4, color: "rgba(29,44,59,0.70)", fontSize: 12, fontWeight: "700" },
  sub2: { marginTop: 2, color: "rgba(29,44,59,0.52)", fontSize: 11 },
  mapWrap: { flex: 1, backgroundColor: "#EAF4FF" },

  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerTextCol: { flex: 1 },
  headerStatus: { color: "#1D2C3B", fontSize: 14, fontWeight: "900", flex: 1 },

  headerRightRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  memoCountText: { color: "rgba(29,44,59,0.70)", fontSize: 12, fontWeight: "900" },

  headerMemoBtn: { paddingHorizontal: 18, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#D9FFF2", borderWidth: 1, borderColor: "rgba(47, 183, 163, 0.45)" },
  headerMemoBtnText: { color: "#13443D", fontSize: 13, fontWeight: "900" },

  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.96)", borderTopWidth: 1, borderTopColor: "rgba(29,44,59,0.10)", zIndex: 9999, elevation: 50 },
  bottomRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  btn: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  btnStart: { backgroundColor: "#BDEBFF", borderColor: "rgba(120, 190, 255, 0.55)" },
  btnStop: { backgroundColor: "#FFD6E7", borderColor: "rgba(255, 140, 190, 0.55)" },
  btnText: { color: "#18324A", fontSize: 16, fontWeight: "900" },
  btnMini: { width: 76, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#D9FFF2", borderWidth: 1, borderColor: "rgba(47, 183, 163, 0.45)" },
  btnMiniText: { color: "#13443D", fontSize: 13, fontWeight: "900" },
  hint: { marginTop: 8, marginBottom: 6, color: "rgba(29,44,59,0.55)", fontSize: 11, lineHeight: 15 },

  gateRoot: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(29,44,59,0.28)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16, zIndex: 20000 },
  gateBox: { width: "100%", maxWidth: 390, backgroundColor: "#FFF7FB", borderRadius: 22, borderWidth: 1, borderColor: "rgba(255, 182, 213, 0.85)", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 },
  gateTitle: { color: "#3B2A3F", fontSize: 15, fontWeight: "900", marginBottom: 6 },
  gateDesc: { color: "rgba(59,42,63,0.75)", fontSize: 12, marginBottom: 10, lineHeight: 16 },
  gateRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  gateLabel: { color: "rgba(59,42,63,0.85)", fontSize: 12, fontWeight: "700" },
  gateValue: { fontSize: 12, fontWeight: "900" },
  ok: { color: "#2FB7A3" },
  bad: { color: "#FF5D7A" },
  gateBtn: { marginTop: 12, height: 48, borderRadius: 16, backgroundColor: "#BDEBFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(120, 190, 255, 0.55)" },
  gateBtnText: { color: "#18324A", fontSize: 14, fontWeight: "900" },
  gateHint: { marginTop: 10, color: "rgba(59,42,63,0.65)", fontSize: 11, lineHeight: 16 },

  popupDim: { flex: 1, backgroundColor: "rgba(29,44,59,0.28)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  popupBox: { width: "100%", maxWidth: 380, backgroundColor: "#F3FBFF", borderRadius: 22, borderWidth: 1, borderColor: "rgba(170, 219, 255, 0.9)", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  popupTitle: { color: "#1D2C3B", fontSize: 15, fontWeight: "900" },
  popupMsg: { marginTop: 8, color: "rgba(29,44,59,0.78)", fontSize: 12, lineHeight: 18 },
  popupBtns: { marginTop: 12, gap: 10 },
  popupBtn: { height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  popupBtnPrimary: { backgroundColor: "#FFD6E7", borderColor: "rgba(255, 140, 190, 0.55)" },
  popupBtnSecondary: { backgroundColor: "#D9FFF2", borderColor: "rgba(47, 183, 163, 0.45)" },
  popupBtnText: { fontSize: 13, fontWeight: "900" },
  popupBtnTextPrimary: { color: "#3B2A3F" },
  popupBtnTextSecondary: { color: "#13443D" },
  popupStickerRow: { marginTop: 10, flexDirection: "row", justifyContent: "center", gap: 10 },
  popupSticker: { fontSize: 16 }
});
