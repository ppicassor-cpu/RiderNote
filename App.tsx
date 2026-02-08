// FILE: C:\RiderNote\App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AppState,
  AppStateStatus,
  BackHandler,
  Linking,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

const TextAny: any = Text;
TextAny.defaultProps = TextAny.defaultProps || {};
TextAny.defaultProps.allowFontScaling = false;
TextAny.defaultProps.maxFontSizeMultiplier = 1;

const TextInputAny: any = TextInput;
TextInputAny.defaultProps = TextInputAny.defaultProps || {};
TextInputAny.defaultProps.allowFontScaling = false;
TextInputAny.defaultProps.maxFontSizeMultiplier = 1;
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import GoogleMap, { MemoPin, RoutePoint } from "./src/components/GoogleMap";
import Tracker, { MemoItem, ManualLocationState } from "./src/native/NativeTracker";
import MemoHistoryScreen from "./src/screens/MemoHistoryScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import { ThemeProvider, useAppTheme, Theme as AppTheme } from "./src/theme/ThemeProvider";

import Purchases from "react-native-purchases";
import mobileAds, {
  BannerAd,
  BannerAdSize,
  MaxAdContentRating,
  useInterstitialAd,
  useRewardedInterstitialAd
} from "react-native-google-mobile-ads";

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

type AppStyles = ReturnType<typeof createStyles>;

const AlertPopup = ({
  state,
  onClose,
  styles
}: {
  state: PopupState;
  onClose: () => void;
  styles: AppStyles;
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
                    try {
                      await b.onPress?.();
                    } finally {
                      onClose();
                    }
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
  onFix,
  styles
}: {
  perm: PermState;
  onFix: () => void;
  styles: AppStyles;
}) => {
  return (
    <View style={styles.gateRoot} pointerEvents="auto">
      <View style={styles.gateBox}>
        <Text style={[styles.gateTitle, { textAlign: "center", alignSelf: "stretch" }]}>필수 권한을 켜야 시작할 수 있어요 🌸</Text>
        <Text style={[styles.gateDesc, { textAlign: "center", alignSelf: "stretch" }]}>아래 항목을 “항상 허용”으로 바꾼 뒤 다시 시작해 주세요.</Text>

        <View style={styles.gateRow}>
          <Text style={styles.gateLabel}>📍 위치(포그라운드)</Text>
          <Text style={[styles.gateValue, perm.locationFg ? styles.ok : styles.bad]}>{perm.locationFg ? "허용됨" : "필수"}</Text>
        </View>

        {Number(Platform.Version) >= 29 && (
          <View style={styles.gateRow}>
            <Text style={styles.gateLabel}>🌙 위치(백그라운드)</Text>
            <Text style={[styles.gateValue, perm.locationBg ? styles.ok : styles.bad]}>{perm.locationBg ? "허용됨" : "필수"}</Text>
          </View>
        )}

        <View style={styles.gateRow}>
          <Text style={styles.gateLabel}>🧷 다른 앱 위에 표시</Text>
          <Text style={[styles.gateValue, perm.overlay ? styles.ok : styles.bad]}>{perm.overlay ? "허용됨" : "필수"}</Text>
        </View>

        {Number(Platform.Version) >= 33 && (
          <View style={styles.gateRow}>
            <Text style={styles.gateLabel}>🔔 알림</Text>
            <Text style={[styles.gateValue, perm.notifications ? styles.ok : styles.bad]}>{perm.notifications ? "허용됨" : "필수"}</Text>
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

const ADMOB_BANNER_UNIT_ID = "ca-app-pub-5144004139813427/4269745317";
const ADMOB_REWARDED_INTERSTITIAL_UNIT_ID = "ca-app-pub-5144004139813427/5478993004";
// ⚠️ 일반 전면광고(Interstitial) 광고 단위는 별도로 생성한 뒤 여기만 교체하세요.
const ADMOB_INTERSTITIAL_UNIT_ID = "ca-app-pub-5144004139813427/1707268955";

const REVCAT_ANDROID_API_KEY = "goog_mKQRTZhRVngtfitlRSyQlhjKAnC";
const REVCAT_ENTITLEMENT_ID = "RiderNote Premium";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const BANNER_H = 50;
const BANNER_GAP = 10;

function Main() {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + 12;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pollRef = useRef<any>(null);

  const MAP_VIEW_KEY = "map_view_state_v1";

  const SESSION_SLOTS_KEY = "session_slots_v1";
  const MEMO_DELETED_KEY = "memo_deleted_savedat_v1";
  const MEMO_TEXT_OVERRIDES_KEY = "memo_text_overrides_v1";

  const { theme, reloadThemePref } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const statusBarStyle = theme.mode === "dark" ? "light-content" : "dark-content";

  const [status, setStatus] = useState<string>("대기");
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [center, setCenter] = useState<Center>({ lat: 37.5665, lng: 126.978 });
  const [updateReady, setUpdateReady] = useState<boolean>(false);

  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [isTrial, setIsTrial] = useState<boolean>(false);

  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [homeSlot1, setHomeSlot1] = useState<SessionSnapshot | null>(null);
  const [manual, setManual] = useState<ManualLocationState>({ enabled: false, lat: 0, lng: 0, acc: 0 });

  const [historyVisible, setHistoryVisible] = useState<boolean>(false);
  const [profileVisible, setProfileVisible] = useState<boolean>(false);
  const [permGateVisible, setPermGateVisible] = useState<boolean>(false);
  const [perm, setPerm] = useState<PermState>({ locationFg: false, locationBg: false, overlay: false, notifications: false });
  const [popup, setPopup] = useState<PopupState>({ visible: false, title: "", message: "", buttons: [] });

  const [mapView, setMapView] = useState<MapViewState>({ zoom: 17 });

  const centerRef = useRef<Center>(center);
  const memoSigRef = useRef<string>("");
  const routeSigRef = useRef<string>("");
  const autoCenteredRef = useRef<boolean>(false);
  const deletedMemoRef = useRef<Set<number>>(new Set());
  const memoTextOverridesRef = useRef<Record<string, string>>({});

  const mapViewLoadedRef = useRef<boolean>(false);
  const mapViewSaveRef = useRef<any>(null);
  const mapViewRef = useRef<MapViewState>(mapView);

  const lastClipRef = useRef<string>("");
  const clipPollRef = useRef<any>(null);

  // ✅ 세션 시작/종료 시간(스냅샷 route 필터용)
  const sessionStartedAtRef = useRef<number | null>(null);

  const sessionLimitAtRef = useRef<number | null>(null);
  const extendModalLockRef = useRef<boolean>(false);
  const pendingInterstitialActionRef = useRef<null | "start" | "history">(null);
  const pendingRewardExtendRef = useRef<boolean>(false);

  const showAds = !isPremium; // 무료 + 무료체험(TRIAL) = 광고 노출
  const limitSession = !isPremium && !isTrial; // 무료만 2시간 제한
  const bottomBarReserve = bottomPad + 106 + (showAds ? BANNER_H + BANNER_GAP : 0);

  const interstitial = useInterstitialAd(ADMOB_INTERSTITIAL_UNIT_ID, { requestNonPersonalizedAdsOnly: true });
  const rewardedInterstitial = useRewardedInterstitialAd(ADMOB_REWARDED_INTERSTITIAL_UNIT_ID, { requestNonPersonalizedAdsOnly: true });

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

  const pushSessionSnapshot = useCallback(
    async (snap: SessionSnapshot) => {
      try {
        const prev = await readSessionSlots();
        const next: SessionSlots = {
          slot1: snap,
          slot2: prev.slot1 ?? null,
          slot3: prev.slot2 ?? null
        };
        await writeSessionSlots(next);
      } catch {}
    },
    [readSessionSlots, writeSessionSlots]
  );

  useEffect(() => {
    (async () => {
      try {
        const slots = await readSessionSlots();
        setHomeSlot1(slots.slot1);
      } catch {}
      try {
        const s = await AsyncStorage.getItem(MEMO_DELETED_KEY);
        const arr = s ? JSON.parse(s) : [];
        const set = new Set<number>();
        if (Array.isArray(arr)) {
          for (const v of arr) {
            const n = numOrNull(v);
            if (n !== null) set.add(n);
          }
        }
        deletedMemoRef.current = set;
      } catch {}
      try {
        const s = await AsyncStorage.getItem(MEMO_TEXT_OVERRIDES_KEY);
        const v = s ? JSON.parse(s) : {};
        if (v && typeof v === "object") memoTextOverridesRef.current = v;
      } catch {}
    })();
  }, [readSessionSlots]);

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
        payload?.latitudeDelta ?? payload?.latDelta ?? payload?.region?.latitudeDelta ?? payload?.nativeEvent?.latitudeDelta
      );
      const gd = numOrNull(
        payload?.longitudeDelta ?? payload?.lngDelta ?? payload?.region?.longitudeDelta ?? payload?.nativeEvent?.longitudeDelta
      );

      if (z === null && (ld === null || gd === null)) return;

      setMapView(prev => {
        const next: MapViewState = { ...prev };
        let changed = false;

        if (z !== null && next.zoom !== z) {
          next.zoom = z;
          changed = true;
        }
        if (ld !== null && next.latDelta !== ld) {
          next.latDelta = ld;
          changed = true;
        }
        if (gd !== null && next.lngDelta !== gd) {
          next.lngDelta = gd;
          changed = true;
        }

        return changed ? next : prev;
      });
    } catch {}
  }, []);

  const closePopup = useCallback(() => setPopup(p => ({ ...p, visible: false })), []);

  const openPopup = useCallback(
    (title: string, message: string, buttons?: PopupButton[]) => {
      const btns: PopupButton[] = buttons?.length ? buttons : [{ text: "확인", variant: "primary", onPress: closePopup }];

      setPopup({ visible: true, title, message, buttons: btns });
    },
    [closePopup]
  );

  const checkPermissions = useCallback(async (): Promise<PermState> => {
    if (Platform.OS !== "android") return { locationFg: true, locationBg: true, overlay: true, notifications: true };
    const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const coarse = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
    let locationBg = true;
    if (Number(Platform.Version) >= 29) locationBg = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
    let notifications = true;
    if (Number(Platform.Version) >= 33) notifications = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    let overlay = false;
    try {
      overlay = await Tracker.canDrawOverlays();
    } catch {
      overlay = false;
    }
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
    const need =
      !now.locationFg ||
      (Number(Platform.Version) >= 29 && !now.locationBg) ||
      (Number(Platform.Version) >= 33 && !now.notifications) ||
      !now.overlay;
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
        try {
          await fn(text);
        } catch {}
      }
    }
  }, []);

  const cacheClipboardNow = useCallback(async () => {
  try {
    if (typeof (Tracker as any).cacheClipboard === "function") {
      try {
        await (Tracker as any).cacheClipboard();
      } catch {}
    }
    const t = (await readClipboardText())?.toString?.() ?? "";
    const text = t.trim();
    if (!text) return;
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
          try {
            await fn();
            return;
          } catch {}
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
          try {
            await fn(text);
            return;
          } catch {}
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
        await new Promise<void>(resolve => {
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
        {
          text: "설정으로 이동",
          variant: "primary",
          onPress: async () => {
            try {
              await Linking.openSettings();
            } catch {}
          }
        }
      ]);
      return;
    }
    let overlayOk = false;
    try {
      overlayOk = await Tracker.canDrawOverlays();
    } catch {
      setStatus("대기");
      openPopup("오류", "오버레이 권한 확인 불가");
      return;
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
    const allOk =
      again.locationFg &&
      (Number(Platform.Version) < 29 || again.locationBg) &&
      (Number(Platform.Version) < 33 || again.notifications) &&
      again.overlay;
    setPermGateVisible(!allOk);
    if (again.locationFg) await autoCenterOnce();
    setStatus("대기");
  }, [checkPermissions, openPopup, requestAllRequiredPermissions, autoCenterOnce]);

  const refreshMemosSilent = useCallback(async () => {
    try {
      const arr = await Tracker.getMemos();
      const del = deletedMemoRef.current;

      const filtered = (arr || []).filter((m: any) => {
        const t = numOrNull(m?.savedAt);
        if (t === null) return true;
        return !del.has(t);
      });

      const ov = memoTextOverridesRef.current;
      const patched = (filtered || []).map((m: any) => {
        const t = numOrNull(m?.savedAt);
        if (t === null) return m;
        const key = String(t);
        const nextText = ov?.[key];
        if (typeof nextText !== "string") return m;
        return { ...(m as any), text: nextText };
      });

      const sorted = [...patched].sort((a, b) => Number((b as any)?.savedAt || 0) - Number((a as any)?.savedAt || 0));
      const head = sorted[0];
      const tail = sorted[sorted.length - 1];
      const sig = `${sorted.length}_${Number((head as any)?.savedAt || 0)}_${Number((tail as any)?.savedAt || 0)}`;
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
    } catch {
      setRoute([]);
    }
  }, []);

  const refreshManual = useCallback(async () => {
    try {
      const s = await Tracker.getManualLocation();
      setManual(s);
      if (s?.enabled && typeof s.lat === "number" && typeof s.lng === "number") {
        setCenterStable(s.lat, s.lng, true);
      }
    } catch {
      setManual({ enabled: false, lat: 0, lng: 0, acc: 0 });
    }
  }, [setCenterStable]);

    const refreshAll = useCallback(
    async (withError = false) => {
      try {
        await refreshMemosSilent();
        await refreshRouteSilent();
        await refreshManual();
      } catch (e: any) {
        if (withError) openPopup("데이터 로드 실패 🥲", String(e?.message ?? e));
      }
    },
    [refreshManual, refreshMemosSilent, refreshRouteSilent, openPopup]
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onBackPress = () => {
      if (popup.visible) {
        closePopup();
        return true;
      }

      if (historyVisible) {
        setHistoryVisible(false);
        (async () => {
          try {
            const slots = await readSessionSlots();
            setHomeSlot1(slots.slot1);
          } catch {}
          await refreshAll();
        })();
        return true;
      }

      if (profileVisible) {
        return false;
      }

      openPopup("종료하시겠습니까?", "앱을 종료할까요?", [
        { text: "취소", variant: "secondary" },
        { text: "종료", variant: "primary", onPress: () => BackHandler.exitApp() }
      ]);
      return true;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [closePopup, historyVisible, openPopup, popup.visible, profileVisible, readSessionSlots, refreshAll]);

  const handleDeleteMemoPin = useCallback(
    async (pin: MemoPin) => {
      const t = numOrNull((pin as any)?.savedAt);
      if (t === null) return;

      try {
        const nextSet = new Set<number>(deletedMemoRef.current);
        nextSet.add(t);
        deletedMemoRef.current = nextSet;
        try {
          await AsyncStorage.setItem(MEMO_DELETED_KEY, JSON.stringify(Array.from(nextSet)));
        } catch {}

        try {
          const slots = await readSessionSlots();
          const prune = (s: SessionSnapshot | null) => {
            if (!s) return s;
            const prev = s.memos || [];
            const next = prev.filter((m: any) => Number((m as any)?.savedAt || 0) !== t);
            return next.length === prev.length ? s : { ...s, memos: next };
          };

          const nextSlots: SessionSlots = {
            slot1: prune(slots.slot1),
            slot2: prune(slots.slot2),
            slot3: prune(slots.slot3)
          };

          await writeSessionSlots(nextSlots);
          setHomeSlot1(nextSlots.slot1);
        } catch {}

        setMemos(prev => prev.filter((m: any) => Number((m as any)?.savedAt || 0) !== t));
      } catch (e: any) {
        openPopup("삭제 실패", String(e?.message ?? e));
      }
    },
    [openPopup, readSessionSlots, writeSessionSlots]
  );

  const handleUpdateMemoPin = useCallback(
    async (pin: MemoPin, nextTextRaw: string) => {
      const t = numOrNull((pin as any)?.savedAt);
      if (t === null) return;

      const nextText = (nextTextRaw ?? "").toString();

      try {
        const fns = [
          (Tracker as any).updateMemoText,
          (Tracker as any).updateMemo,
          (Tracker as any).editMemoText,
          (Tracker as any).setMemoText,
          (Tracker as any).updateNoteText,
          (Tracker as any).updateNote,
          (Tracker as any).editNoteText,
          (Tracker as any).setNoteText
        ];

        for (const fn of fns) {
          if (typeof fn !== "function") continue;
          try {
            await fn(t, nextText);
            break;
          } catch {}
          try {
            await fn({ savedAt: t, text: nextText });
            break;
          } catch {}
        }

        try {
          const key = String(t);
          memoTextOverridesRef.current = { ...(memoTextOverridesRef.current || {}), [key]: nextText };
          await AsyncStorage.setItem(MEMO_TEXT_OVERRIDES_KEY, JSON.stringify(memoTextOverridesRef.current));
        } catch {}

        setMemos(prev =>
          prev.map((m: any) => {
            const mt = numOrNull((m as any)?.savedAt);
            if (mt !== null && mt === t) return { ...(m as any), text: nextText };
            return m;
          })
        );

        try {
          const slots = await readSessionSlots();
          const patch = (s: SessionSnapshot | null) => {
            if (!s) return s;
            const prev = s.memos || [];
            let changed = false;
            const next = prev.map((m: any) => {
              const mt = numOrNull((m as any)?.savedAt);
              if (mt !== null && mt === t) {
                changed = true;
                return { ...(m as any), text: nextText };
              }
              return m;
            });
            return changed ? { ...s, memos: next } : s;
          };

          const nextSlots: SessionSlots = {
            slot1: patch(slots.slot1),
            slot2: patch(slots.slot2),
            slot3: patch(slots.slot3)
          };

          await writeSessionSlots(nextSlots);
          setHomeSlot1(nextSlots.slot1);
        } catch {}
      } catch (e: any) {
        openPopup("수정 실패", String(e?.message ?? e));
      }
    },
    [openPopup, readSessionSlots, writeSessionSlots]
  );

  useEffect(() => {
    let mounted = true;
    const ranRef = { current: false };
    (async () => {
      try {
        if (ranRef.current || !Updates.isEnabled) return;
        ranRef.current = true;
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          await Updates.fetchUpdateAsync();
          if (mounted) setUpdateReady(true);
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await mobileAds().setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.G,
          tagForUnderAgeOfConsent: true
        });
        await mobileAds().initialize();
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        Purchases.configure({ apiKey: REVCAT_ANDROID_API_KEY });
        const info: any = await Purchases.getCustomerInfo();
        const ent = info?.entitlements?.active?.[REVCAT_ENTITLEMENT_ID];
        const periodType = (ent as any)?.periodType;
        const trial = periodType === "TRIAL";
        const active = !!ent;

        setIsTrial(active && trial);
        setIsPremium(active && !trial);
      } catch {
        setIsTrial(false);
        setIsPremium(false);
      }
    })();

    const listener = (info: any) => {
      try {
        const ent = info?.entitlements?.active?.[REVCAT_ENTITLEMENT_ID];
        const periodType = (ent as any)?.periodType;
        const trial = periodType === "TRIAL";
        const active = !!ent;

        setIsTrial(active && trial);
        setIsPremium(active && !trial);
      } catch {}
    };

    try {
      (Purchases as any).addCustomerInfoUpdateListener?.(listener);
    } catch {}

    return () => {
      try {
        (Purchases as any).removeCustomerInfoUpdateListener?.(listener);
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (!showAds) return;
    try {
      interstitial.load();
    } catch {}
    try {
      rewardedInterstitial.load();
    } catch {}
  }, [showAds]);

  useEffect(() => {
    if (!showAds) return;
    if (interstitial.isClosed) {
      try {
        interstitial.load();
      } catch {}
      const act = pendingInterstitialActionRef.current;
      if (!act) return;
      pendingInterstitialActionRef.current = null;

      if (act === "start") {
        (async () => {
          await onStart();
        })();
        return;
      }

      if (act === "history") {
        (async () => {
          await refreshAll(true);
          setHistoryVisible(true);
        })();
      }
    }
  }, [showAds, interstitial.isClosed]);

  useEffect(() => {
    if (!showAds) return;

    if (rewardedInterstitial.isClosed) {
      try {
        rewardedInterstitial.load();
      } catch {}

      if (pendingRewardExtendRef.current && !rewardedInterstitial.isEarnedReward) {
        pendingRewardExtendRef.current = false;
        extendModalLockRef.current = false;
      }
    }

    if (pendingRewardExtendRef.current && rewardedInterstitial.isEarnedReward) {
      pendingRewardExtendRef.current = false;
      sessionLimitAtRef.current = Date.now() + TWO_HOURS_MS;
      extendModalLockRef.current = false;
    }
  }, [showAds, rewardedInterstitial.isClosed, rewardedInterstitial.isEarnedReward]);

  useEffect(() => {
    if (!isTracking || !limitSession) {
      extendModalLockRef.current = false;
      return;
    }

    const id = setInterval(() => {
      const limitAt = sessionLimitAtRef.current;
      if (!limitAt) return;

      if (Date.now() >= limitAt && !extendModalLockRef.current) {
        extendModalLockRef.current = true;

        openPopup("2시간이 지났어요", "전면 광고를 보고 2시간 연장할까요?", [
          {
            text: "종료",
            variant: "secondary",
            onPress: async () => {
              await onStop();
            }
          },
          {
            text: "연장",
            variant: "primary",
            onPress: async () => {
              if (!rewardedInterstitial.isLoaded) {
                try {
                  rewardedInterstitial.load();
                } catch {}
                extendModalLockRef.current = false;
                return;
              }

              pendingRewardExtendRef.current = true;

              try {
                rewardedInterstitial.show();
              } catch {
                pendingRewardExtendRef.current = false;
                extendModalLockRef.current = false;
              }
            }
          }
        ]);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [isTracking, limitSession, openPopup, onStop, rewardedInterstitial.isLoaded]);


  useEffect(() => {
    if (!updateReady || isTracking || permGateVisible || popup.visible || historyVisible) return;
    (async () => {
      try {
        await Updates.reloadAsync();
      } catch {}
    })();
  }, [updateReady, isTracking, permGateVisible, popup.visible, historyVisible]);

  useEffect(() => {
    (async () => {
      const p = await checkPermissions();
      setPerm(p);
      const need =
        !p.locationFg ||
        (Number(Platform.Version) >= 29 && !p.locationBg) ||
        (Number(Platform.Version) >= 33 && !p.notifications) ||
        !p.overlay;
      if (need) setPermGateVisible(true);
      await refreshAll();
      const slots = await readSessionSlots();
      setHomeSlot1(slots.slot1 ?? null);
      if (p.locationFg) await autoCenterOnce();
    })();
  }, [checkPermissions, refreshAll, autoCenterOnce, readSessionSlots]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async next => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        await reloadThemePref();

        const p = await checkPermissions();
        setPerm(p);
        const allOk =
          p.locationFg &&
          (Number(Platform.Version) < 29 || p.locationBg) &&
          (Number(Platform.Version) < 33 || p.notifications) &&
          p.overlay;
        setPermGateVisible(!allOk);
        await refreshAll();
        const slots = await readSessionSlots();
        setHomeSlot1(slots.slot1 ?? null);
        if (p.locationFg) await autoCenterOnce();
      }
    });
    return () => sub.remove();
  }, [checkPermissions, refreshAll, autoCenterOnce, reloadThemePref, readSessionSlots]);

  useEffect(() => {
    const start = async () => {
      if (clipPollRef.current) return;
      await cacheClipboardNow();
      clipPollRef.current = setInterval(async () => {
        await cacheClipboardNow();
      }, 60000);
    };
    const stop = () => {
      if (clipPollRef.current) clearInterval(clipPollRef.current);
      clipPollRef.current = null;
    };

    const sub = AppState.addEventListener("change", async next => {
      if (next === "active") await start();
      else stop();
    });

    if (AppState.currentState === "active") {
      (async () => {
        await start();
      })();
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
      try {
        (sub as any).remove?.();
      } catch {}
    };
  }, [refreshAll, saveFromClipboard]);

  useEffect(() => {
    try {
      const sub = Tracker.onNoteSaved(async ev => {
        await refreshMemosSilent();
        await refreshRouteSilent();
        const lat = numOrNull((ev as any)?.lat);
        const lng = numOrNull((ev as any)?.lng);
        if (lat !== null && lng !== null && !manual.enabled) setCenterStable(lat, lng);
      });
      return () => sub.remove();
    } catch {
      return;
    }
  }, [manual.enabled, refreshMemosSilent, refreshRouteSilent, setCenterStable]);

  useEffect(() => {
    if (!isTracking) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }

    const FAST_MS = 2500;
    const SLOW_MS = 10000;

    const modeRef = { current: "fast" as "fast" | "slow" };
    const candidateRef = { current: null as null | "fast" | "slow" };
    const candidateSinceRef = { current: 0 };
    const lastLocRef = { current: null as null | { lat: number; lng: number; t: number } };
    let currentIntervalMs = FAST_MS;

    const toRad = (d: number) => (d * Math.PI) / 180;
    const haversineM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371000;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const s1 = Math.sin(dLat / 2);
      const s2 = Math.sin(dLng / 2);
      const aa = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
      const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
      const d = R * c;
      return Number.isFinite(d) ? d : 0;
    };

    const tick = async () => {
      let desired: "fast" | "slow" | null = null;
      const nowMs = Date.now();

      try {
        if (!manual.enabled) {
          const last = await Tracker.getLastLocation();
          if (last && typeof last.lat === "number" && typeof last.lng === "number") {
            const curT = numOrNull((last as any)?.t) ?? nowMs;
            const prev = lastLocRef.current;

            if (prev) {
              const distM = haversineM(prev, { lat: last.lat, lng: last.lng });
              const dtS = Math.max(0.001, (curT - prev.t) / 1000);
              const speedMps = distM / dtS;

              if (speedMps >= 1.2 || distM >= 15) desired = "fast";
              else if (speedMps <= 0.3 && distM <= 5) desired = "slow";
            }

            lastLocRef.current = { lat: last.lat, lng: last.lng, t: curT };

            setCenterStable(last.lat, last.lng);
          }
        }
      } catch {}

      try {
        if (desired && desired !== modeRef.current) {
          if (candidateRef.current !== desired) {
            candidateRef.current = desired;
            candidateSinceRef.current = nowMs;
          } else {
            const needMs = desired === "slow" ? 12000 : 5000;
            if (nowMs - candidateSinceRef.current >= needMs) {
              modeRef.current = desired;
              candidateRef.current = null;
              candidateSinceRef.current = 0;

              const nextMs = modeRef.current === "slow" ? SLOW_MS : FAST_MS;
              if (nextMs !== currentIntervalMs) {
                currentIntervalMs = nextMs;
                if (pollRef.current) clearInterval(pollRef.current);
                pollRef.current = setInterval(tick, currentIntervalMs);
              }
            }
          }
        } else {
          candidateRef.current = null;
          candidateSinceRef.current = 0;
        }
      } catch {}

      await refreshMemosSilent();
      await refreshRouteSilent();
    };

    pollRef.current = setInterval(tick, currentIntervalMs);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isTracking, manual.enabled, refreshMemosSilent, refreshRouteSilent, setCenterStable]);

  const hideBubble = useCallback(async () => {
    const fns = [
      (Tracker as any).hideBubble,
      (Tracker as any).removeBubble,
      (Tracker as any).dismissBubble,
      (Tracker as any).hideFloatingButton,
      (Tracker as any).removeFloatingButton,
      (Tracker as any).hideOverlay,
      (Tracker as any).removeOverlay,
      (Tracker as any).stopOverlay,
      (Tracker as any).stopOverlayService,
      (Tracker as any).stopBubbleService
    ];
    for (const fn of fns) {
      if (typeof fn !== "function") continue;
      try {
        await fn();
        continue;
      } catch {}
      try {
        await fn(false);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!isTracking) {
      hideBubble();
    }
  }, [hideBubble, isTracking]);

  const onStart = async () => {
    try {
      const ok = await ensureAllRequired();
      if (!ok) return;
      setStatus("세션 시작 중...");
      const r = await Tracker.startSession();
      const startedAt = r.startTime;
      sessionStartedAtRef.current = startedAt;

      sessionLimitAtRef.current = limitSession ? startedAt + TWO_HOURS_MS : null;
      extendModalLockRef.current = false;

      setSessionId(r.sessionId);
      setIsTracking(true);
      setStatus("기록 중");
      await refreshAll();
    } catch (e: any) {
      setStatus("대기");
      openPopup("시작이 안 됐어요 🥲", String(e?.message ?? e));
    }
  };

    async function onStop() {
    try {
      setStatus("종료 중...");

      const endedSessionId = sessionId;
      const startedAt = sessionStartedAtRef.current;

      const r: any = await Tracker.stopSession();
      const endedAt = r.endTime;

      sessionLimitAtRef.current = null;
      extendModalLockRef.current = false;
      pendingRewardExtendRef.current = false;

      setIsTracking(false);
      setSessionId(null);
      setStatus("대기");
      await hideBubble();

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

      try {
        const sessionMemos = endedSessionId ? allMemos.filter((m: any) => (m as any)?.sessionId === endedSessionId) : [];

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
        setHomeSlot1(snap);
      } catch {}

      sessionStartedAtRef.current = null;

      const calcKm = (pts: RoutePoint[]) => {
        const R = 6371;
        const toRad = (d: number) => (d * Math.PI) / 180;
        let sum = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const dLat = toRad(b.lat - a.lat);
          const dLng = toRad(b.lng - a.lng);
          const s1 = Math.sin(dLat / 2);
          const s2 = Math.sin(dLng / 2);
          const aa = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
          const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
          const d = R * c;
          if (Number.isFinite(d)) sum += d;
        }
        return sum;
      };

      const basePts = (route || []).filter(p => typeof p?.lat === "number" && typeof p?.lng === "number");
      const startedAtMs = typeof startedAt === "number" ? startedAt : null;
      const endedAtMs = typeof endedAt === "number" ? endedAt : numOrNull(endedAt) ?? 0;

      const pts =
        startedAtMs !== null
          ? (() => {
              const filtered = basePts.filter(p => {
                const tt = numOrNull((p as any)?.t);
                if (tt === null) return false;
                return tt >= startedAtMs && tt <= endedAtMs;
              });
              return filtered.length >= 2 ? filtered : basePts;
            })()
          : basePts;

      const km = pts.length >= 2 ? calcKm(pts) : 0;
      const min = startedAtMs !== null && endedAtMs > startedAtMs ? (endedAtMs - startedAtMs) / 60000 : 0;
      const lines = [`총 거리: ${km.toFixed(2)}km`, `총 시간: ${min.toFixed(1)}분`, `총 메모: ${memoCount}개`];

      await refreshAll();
      openPopup("오늘 기록 완료", lines.join("\n"), [{ text: "확인", variant: "primary" }]);
    } catch (e: any) {
      setStatus("기록 중");
      openPopup("종료가 안 됐어요 🥲", String(e?.message ?? e));
    }
  }

  const homeRoute = useMemo(() => {
    if (isTracking) return route;
    const r = homeSlot1?.route;
    if (Array.isArray(r) && r.length) return r;
    return route;
  }, [isTracking, route, homeSlot1]);

  const homeMemos = useMemo(() => {
    if (isTracking && sessionId) {
      return memos.filter((m: any) => (m as any)?.sessionId === sessionId);
    }
    const sm = homeSlot1?.memos;
    if (Array.isArray(sm) && sm.length) return sm;
    return memos;
  }, [isTracking, sessionId, memos, homeSlot1]);

    const displayMemos = useMemo(() => {
    return isTracking ? memos : homeSlot1?.memos ?? [];
  }, [isTracking, memos, homeSlot1]);

  const displayRoute = useMemo(() => {
    return isTracking ? route : homeSlot1?.route ?? [];
  }, [isTracking, route, homeSlot1]);

  const displaySessionId = useMemo(() => {
    return isTracking ? sessionId : homeSlot1?.sessionId ?? null;
  }, [isTracking, sessionId, homeSlot1]);

  const memoPinMeta = useMemo(() => {
    return displayMemos
      .filter(m => typeof (m as any)?.lat === "number" && typeof (m as any)?.lng === "number")
      .map((m: any, i: number) => {
        const id = `${m.sessionId ?? "s"}_${m.savedAt ?? 0}_${i}`;
        const fullText = (m.text ?? "").toString();
        const oneLine = fullText.replace(/\s+/g, " ").trim();
        const previewText = oneLine.length > 24 ? oneLine.slice(0, 24) + "…" : oneLine;

        return {
          id,
          lat: m.lat as number,
          lng: m.lng as number,
          text: fullText,
          previewText,
          fullText,
          savedAt: typeof m.savedAt === "number" ? m.savedAt : undefined,
          sessionId: m.sessionId
        };
      });
  }, [displayMemos]);

  const memoPins = useMemo(() => memoPinMeta as unknown as MemoPin[], [memoPinMeta]);

  const memoSummary = useMemo(() => {
    return `총 메모 ${displayMemos.length}개`;
  }, [displayMemos.length]);

  const fitSessionKey = useMemo(() => {
    if (!displaySessionId) return undefined;
    const enough = displayRoute.length >= 2 || memoPins.length >= 2;
    return enough ? displaySessionId : undefined;
  }, [displaySessionId, displayRoute.length, memoPins.length]);


  const statusLabel = useMemo(() => {
    if (isTracking) return "기록중입니다.";
    if (status === "대기") return "대기중입니다.";
    return "대기중입니다.";
  }, [isTracking, status]);

  const GoogleMapAny = GoogleMap as any;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={theme.statusBarBg} />

      {profileVisible ? (
        <ProfileScreen
          onClose={async () => {
            setProfileVisible(false);
            await reloadThemePref();
          }}
        />
      ) : historyVisible ? (
        <View style={{ flex: 1, paddingBottom: showAds ? BANNER_H + BANNER_GAP + insets.bottom : 0 }}>
          <MemoHistoryScreen
            memos={memos}
            route={route}
            sessionId={sessionId}
            onClose={() => {
              setHistoryVisible(false);
              (async () => {
                try {
                  const slots = await readSessionSlots();
                  setHomeSlot1(slots.slot1);
                } catch {}
                await refreshAll();
              })();
            }}
          />

          {showAds ? (
            <View style={[styles.bannerDock, { paddingBottom: insets.bottom }]}>
              <BannerAd
                unitId={ADMOB_BANNER_UNIT_ID}
                size={BannerAdSize.BANNER}
                requestOptions={{ requestNonPersonalizedAdsOnly: true }}
              />
            </View>
          ) : null}
        </View>
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
                  onPress={async () => {
                    if (showAds && interstitial.isLoaded) {
                      pendingInterstitialActionRef.current = "history";
                      try {
                        interstitial.show();
                        return;
                      } catch {}
                    }
                    await refreshAll(true);
                    setHistoryVisible(true);
                  }}
                  style={styles.headerMemoBtn}
                >
                  <Text style={styles.headerMemoBtnText}>메 모</Text>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.88} onPress={() => setProfileVisible(true)} style={styles.headerGearBtn}>
                  <Ionicons name="settings-outline" size={20} color={theme.icon} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={[styles.mapWrap, { marginBottom: bottomBarReserve }]}>
            <GoogleMapAny
              center={center}
              style={StyleSheet.absoluteFill}
              route={displayRoute}
              memoPins={memoPins}
              onDeleteMemoPin={handleDeleteMemoPin}
              onUpdateMemoPin={handleUpdateMemoPin}
              fitSessionId={fitSessionKey}
              zoom={mapView.zoom}
              initialZoom={mapView.zoom}
              latDelta={mapView.latDelta}
              lngDelta={mapView.lngDelta}
              onViewStateChange={handleMapViewChange}
              onZoomChanged={handleMapViewChange}
              onCameraChanged={handleMapViewChange}
              onRegionChangeComplete={handleMapViewChange}
              customMapStyle={theme.mode === "dark" ? DARK_MAP_STYLE : undefined}
            />
          </View>

          <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
            <View style={styles.bottomRow}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={async () => {
                  if (isTracking) {
                    await onStop();
                    return;
                  }

                  if (showAds && interstitial.isLoaded) {
                    pendingInterstitialActionRef.current = "start";
                    try {
                      interstitial.show();
                      return;
                    } catch {}
                  }

                  await onStart();
                }}
                style={[styles.btn, isTracking ? styles.btnStop : styles.btnStart]}
              >
                <Text style={styles.btnText}>{isTracking ? "기록완료" : "기록시작"}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              홈 지도에 핀이 계속 표시됩니다. 핀을 탭하면 지도에서 바로 메모를 확인할 수 있어요. (경로/핀은 자동으로 화면에 맞춰집니다)
            </Text>

            {showAds ? (
              <View style={styles.bannerWrap}>
                <BannerAd
                  unitId={ADMOB_BANNER_UNIT_ID}
                  size={BannerAdSize.BANNER}
                  requestOptions={{ requestNonPersonalizedAdsOnly: true }}
                />
              </View>
            ) : null}
          </View>
        </>
      )}

      {permGateVisible && <PermissionGate perm={perm} onFix={runPermissionFixFlow} styles={styles} />}
      <AlertPopup state={popup} onClose={closePopup} styles={styles} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <Main />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

// ------------------------------------------------------------------
// 4. Styles
// ------------------------------------------------------------------
function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.rootBg },
    header: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 10,
      backgroundColor: theme.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    title: { color: theme.text, fontSize: 18, fontWeight: "900" },
    sub: { marginTop: 4, color: theme.textSub, fontSize: 12, fontWeight: "700" },
    sub2: { marginTop: 2, color: theme.textSub2, fontSize: 11 },
    mapWrap: { flex: 1, backgroundColor: theme.mapBg },

    headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    headerTextCol: { flex: 1 },
    headerStatus: { color: theme.text, fontSize: 18, fontWeight: "700", flex: 1 },

    headerRightRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    memoCountText: { color: theme.textSub, fontSize: 12, fontWeight: "500" },

    headerMemoBtn: {
      paddingHorizontal: 18,
      height: 44,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder
    },
    headerMemoBtnText: { color: theme.accentText, fontSize: 13, fontWeight: "900" },
    headerGearBtn: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder
    },

    bottomBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: 10,
      paddingHorizontal: 16,
      backgroundColor: theme.mode === "dark" ? "rgba(15,21,28,0.94)" : "rgba(255,255,255,0.96)",
      borderTopWidth: 1,
      borderTopColor: theme.border,
      zIndex: 9999,
      elevation: 50
    },
    bottomRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    btn: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    btnStart: { backgroundColor: theme.startBg, borderColor: theme.startBorder },
    btnStop: { backgroundColor: theme.stopBg, borderColor: theme.stopBorder },
    btnText: { color: theme.primaryTextOnColor, fontSize: 16, fontWeight: "700" },
    btnMini: {
      width: 76,
      height: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accentBg,
      borderWidth: 1,
      borderColor: theme.accentBorder
    },
    btnMiniText: { color: theme.accentText, fontSize: 13, fontWeight: "700" },
    hint: { marginTop: 8, marginBottom: 6, color: theme.textMuted, fontSize: 11, lineHeight: 15 },

    bannerWrap: { marginTop: 10, alignItems: "center" },
    bannerDock: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: 10,
      alignItems: "center",
      backgroundColor: theme.mode === "dark" ? "rgba(15,21,28,0.94)" : "rgba(255,255,255,0.96)",
      borderTopWidth: 1,
      borderTopColor: theme.border,
      zIndex: 9999,
      elevation: 50
    },

    gateRoot: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: theme.dimBg,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 16,
      zIndex: 20000
    },
    gateBox: {
      width: "100%",
      maxWidth: 390,
      backgroundColor: theme.gateBoxBg,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.gateBoxBorder,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 14
    },
    gateTitle: { color: theme.gateTitle, fontSize: 15, fontWeight: "900", marginBottom: 6 },
    gateDesc: { color: theme.gateDesc, fontSize: 12, marginBottom: 10, lineHeight: 16 },
    gateRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
    gateLabel: { color: theme.gateLabel, fontSize: 12, fontWeight: "700" },
    gateValue: { fontSize: 12, fontWeight: "900" },
    ok: { color: theme.ok },
    bad: { color: theme.bad },
    gateBtn: {
      marginTop: 12,
      height: 48,
      borderRadius: 16,
      backgroundColor: theme.startBg,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.startBorder
    },
    gateBtnText: { color: theme.primaryTextOnColor, fontSize: 14, fontWeight: "900" },
    gateHint: { marginTop: 10, color: theme.gateHint, fontSize: 11, lineHeight: 16 },

    popupDim: { flex: 1, backgroundColor: theme.dimBg, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
    popupBox: {
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
    popupTitle: { color: theme.popupTitle, fontSize: 15, fontWeight: "900" },
    popupMsg: { marginTop: 8, color: theme.popupMsg, fontSize: 12, lineHeight: 18 },
    popupBtns: { marginTop: 12, gap: 10 },
    popupBtn: { height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    popupBtnPrimary: { backgroundColor: theme.popupPrimaryBg, borderColor: theme.popupPrimaryBorder },
    popupBtnSecondary: { backgroundColor: theme.popupSecondaryBg, borderColor: theme.popupSecondaryBorder },
    popupBtnText: { fontSize: 13, fontWeight: "900" },
    popupBtnTextPrimary: { color: theme.popupPrimaryText },
    popupBtnTextSecondary: { color: theme.popupSecondaryText },
    popupStickerRow: { marginTop: 10, flexDirection: "row", justifyContent: "center", gap: 10 },
    popupSticker: { fontSize: 16 }
  });
}

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#64779e" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#334e87" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#023e58" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f9ba5" }] },
  { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#023e58" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#3C7680" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#255763" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#b0d5ce" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#023e58" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "transit", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "transit.line", elementType: "geometry.fill", stylers: [{ color: "#283d6a" }] },
  { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#3a4762" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] }
];
