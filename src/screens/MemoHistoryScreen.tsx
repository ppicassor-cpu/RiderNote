// FILE: C:\RiderNote\src\screens\MemoHistoryScreen.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import type { RoutePoint } from "../components/GoogleMap";
import type { MemoItem } from "../native/NativeTracker";
import { useAppTheme } from "../theme/ThemeProvider";

type Props = {
  memos: MemoItem[];
  route: RoutePoint[];
  sessionId: string | null;
  onClose: () => void;
};

type ListItem = {
  id: string;
  savedAt: number;
  text: string;
  lat: number | null;
  lng: number | null;
};

type SlotData = {
  sessionId?: string | null;
  startedAt?: number | null;
  endedAt?: number | null;
  memos?: MemoItem[];
  route?: RoutePoint[];
};

type SlotIndex = 1 | 2 | 3;

type PopupButton = {
  text: string;
  onPress?: () => void | Promise<void>;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  closeOnPress?: boolean;
};

type PopupState = {
  visible: boolean;
  title: string;
  message: string;
  buttons: PopupButton[];
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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function grayColorFor(index: number, total: number) {
  if (total <= 1) return "rgba(123, 228, 241, 0.85)";
  const r = index / (total - 1);

  const r0 = 123, g0 = 228, b0 = 241;
  const r1 = 30,  g1 = 170, b1 = 185;

  const rr = Math.round(r0 + (r1 - r0) * r);
  const gg = Math.round(g0 + (g1 - g0) * r);
  const bb = Math.round(b0 + (b1 - b0) * r);

  return `rgba(${rr}, ${gg}, ${bb}, 0.85)`;
}

function downsampleRoute(points: RoutePoint[], maxPoints = 800) {
  const n = points.length;
  if (n <= maxPoints) return points;
  const step = Math.ceil(n / maxPoints);
  const out: RoutePoint[] = [];
  for (let i = 0; i < n; i += step) out.push(points[i]);
  const last = points[n - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function pickSlot(raw: any, idx: SlotIndex): any {
  if (!raw) return null;

  if (raw && typeof raw === "object" && raw.slots) raw = raw.slots;

  if (Array.isArray(raw)) return raw[idx - 1] ?? null;

  if (typeof raw === "object") {
    const a =
      raw[String(idx)] ??
      raw[`slot${idx}`] ??
      raw[`s${idx}`] ??
      raw[`S${idx}`] ??
      null;
    return a ?? null;
  }

  return null;
}

function normalizeSlotData(v: any): SlotData | null {
  if (!v || typeof v !== "object") return null;

  const sessionId = typeof v.sessionId === "string" ? v.sessionId : typeof v.id === "string" ? v.id : null;
  const startedAt = typeof v.startedAt === "number" ? v.startedAt : typeof v.startAt === "number" ? v.startAt : null;
  const endedAt = typeof v.endedAt === "number" ? v.endedAt : typeof v.endAt === "number" ? v.endAt : null;

  const memosRaw = Array.isArray(v.memos)
    ? v.memos
    : Array.isArray(v.memo)
      ? v.memo
      : Array.isArray(v.items)
        ? v.items
        : null;
  const routeRaw = Array.isArray(v.route)
    ? v.route
    : Array.isArray(v.routes)
      ? v.routes
      : Array.isArray(v.path)
        ? v.path
        : null;

  const memos = memosRaw ? (memosRaw as MemoItem[]) : undefined;
  const route = routeRaw ? (routeRaw as RoutePoint[]) : undefined;

  const hasAny =
    Boolean(sessionId) ||
    Boolean(startedAt) ||
    Boolean(endedAt) ||
    (memos?.length ?? 0) > 0 ||
    (route?.length ?? 0) > 0;
  if (!hasAny) return null;

  return { sessionId, startedAt, endedAt, memos, route };
}

type ThemePalette = {
  isDark: boolean;
  pageBg: string;
  headerBg: string;
  surfaceBg: string;
  border: string;
  border2: string;
  text: string;
  subText: string;
  muted: string;

  slotOffBg: string;
  slotOffBorder: string;
  slotOnBg: string;
  slotOnBorder: string;
  slotOnText: string;

  closeBtnBg: string;

  mapBg: string;
  mapBorder: string;

  listBg: string;
  listHeaderBorder: string;
  cardBg: string;
  cardBorder: string;
  cardSelectedBorder: string;
};

const AlertPopup = ({
  state,
  onClose,
  styles,
  bottomInset
}: {
  state: PopupState;
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
  bottomInset: number;
}) => {
  return (
    <View pointerEvents={state.visible ? "auto" : "none"} style={[StyleSheet.absoluteFill, { zIndex: state.visible ? 40000 : -1 }]}>
      {state.visible ? (
        <View style={styles.popupDim}>
          <View style={[styles.popupBox, { marginBottom: Math.max(0, bottomInset) + 24 }]}>
            <Text style={styles.popupTitle}>{state.title}</Text>
            <Text style={styles.popupMsg}>{state.message}</Text>
            <View style={styles.popupBtns}>
              {state.buttons.map((b, idx) => (
                <TouchableOpacity
                  key={`${b.text}_${idx}`}
                  activeOpacity={0.88}
                  disabled={!!b.disabled}
                  style={[
                    styles.popupBtn,
                    b.variant === "secondary" ? styles.popupBtnSecondary : styles.popupBtnPrimary,
                    b.disabled ? styles.popupBtnDisabled : null
                  ]}
                  onPress={async () => {
                    try {
                      if (b.disabled) return;
                      await b.onPress?.();
                    } finally {
                      if (b.closeOnPress !== false) onClose();
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.popupBtnText,
                      b.variant === "secondary" ? styles.popupBtnTextSecondary : styles.popupBtnTextPrimary,
                      b.disabled ? styles.popupBtnTextDisabled : null
                    ]}
                  >
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

export default function MemoHistoryScreen({ memos, route, sessionId, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const { theme } = useAppTheme();
  const palette: ThemePalette = useMemo(() => {
    const t: any = theme as any;
    const isDark = t?.mode === "dark" || t?.isDark === true;

    const pageBg = t?.rootBg ?? t?.bg ?? t?.background ?? (isDark ? "#0B0F14" : "#F7FAFF");
    const headerBg = t?.headerBg ?? t?.surfaceBg ?? t?.cardBg ?? (isDark ? "#0F141A" : "#FFFFFF");
    const surfaceBg = t?.surfaceBg ?? t?.cardBg ?? (isDark ? "#0F141A" : "#FFFFFF");

    const border = t?.border ?? t?.borderColor ?? (isDark ? "rgba(255,255,255,0.10)" : "rgba(29,44,59,0.10)");
    const border2 = t?.divider ?? t?.border2 ?? (isDark ? "rgba(255,255,255,0.08)" : "rgba(29,44,59,0.08)");

    const text = t?.text ?? t?.textColor ?? (isDark ? "#E9F0F7" : "#1D2C3B");
    const subText = t?.textSub ?? t?.subText ?? (isDark ? "rgba(233,240,247,0.78)" : "rgba(29,44,59,0.78)");
    const muted = t?.textMuted ?? t?.muted ?? (isDark ? "rgba(233,240,247,0.55)" : "rgba(29,44,59,0.55)");

    const slotOffBg = t?.chipOffBg ?? t?.pillOffBg ?? (isDark ? "rgba(255,255,255,0.06)" : "rgba(29,44,59,0.06)");
    const slotOffBorder =
      t?.chipOffBorder ?? t?.pillOffBorder ?? (isDark ? "rgba(255,255,255,0.10)" : "rgba(29,44,59,0.10)");
    const slotOnBg = t?.chipOnBg ?? t?.pillOnBg ?? "rgba(47, 183, 163, 0.12)";
    const slotOnBorder = t?.chipOnBorder ?? t?.pillOnBorder ?? "rgba(47, 183, 163, 0.38)";
    const slotOnText = t?.chipOnText ?? t?.pillOnText ?? "rgba(19,68,61,0.95)";

    const closeBtnBg = t?.buttonSecondaryBg ?? (isDark ? "rgba(255,255,255,0.06)" : "rgba(29,44,59,0.06)");

    const mapBg = t?.mapBg ?? (isDark ? "rgba(255,255,255,0.04)" : "#EAF4FF");
    const mapBorder = t?.mapBorder ?? (isDark ? "rgba(255,255,255,0.08)" : "rgba(29,44,59,0.08)");

    const listBg = t?.surfaceBg ?? t?.cardBg ?? (isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.96)");
    const listHeaderBorder = t?.divider ?? (isDark ? "rgba(255,255,255,0.08)" : "rgba(29,44,59,0.08)");

    const cardBg = t?.surfaceBg ?? t?.cardBg ?? (isDark ? "#0F141A" : "#FFFFFF");
    const cardBorder = t?.border2 ?? t?.divider ?? (isDark ? "rgba(255,255,255,0.08)" : "rgba(29,44,59,0.08)");
    const cardSelectedBorder = t?.okBorder ?? "rgba(47, 183, 163, 0.65)";

    return {
      isDark,
      pageBg,
      headerBg,
      surfaceBg,
      border,
      border2,
      text,
      subText,
      muted,
      slotOffBg,
      slotOffBorder,
      slotOnBg,
      slotOnBorder,
      slotOnText,
      closeBtnBg,
      mapBg,
      mapBorder,
      listBg,
      listHeaderBorder,
      cardBg,
      cardBorder,
      cardSelectedBorder
    };
  }, [theme]);

  const styles = useMemo(() => createStyles(palette), [palette]);
  const barStyle = palette.isDark ? "light-content" : "dark-content";

  const mapRef = useRef<MapView | null>(null);
  const listRef = useRef<FlatList<ListItem> | null>(null);

  const MapViewAny = MapView as any;
  const MarkerAny = Marker as any;
  const PolylineAny = Polyline as any;
  const FlatListAny = FlatList as any;

  const SESSION_SLOTS_KEY = "session_slots_v1";

  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [slotsMode, setSlotsMode] = useState(false);

  const [slot1, setSlot1] = useState<SlotData | null>(null);
  const [slot2, setSlot2] = useState<SlotData | null>(null);
  const [slot3, setSlot3] = useState<SlotData | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotIndex>(1);

  const [manageVisible, setManageVisible] = useState(false);
  const [popup, setPopup] = useState<PopupState>({ visible: false, title: "", message: "", buttons: [] });

  const hasAnySlots = useMemo(() => {
    return Boolean(slot1 || slot2 || slot3);
  }, [slot1, slot2, slot3]);

  const closePopup = useCallback(() => setPopup(p => ({ ...p, visible: false })), []);
  const openPopup = useCallback((title: string, message: string, buttons?: PopupButton[]) => {
    const btns: PopupButton[] = buttons?.length ? buttons : [{ text: "확인", variant: "primary", onPress: closePopup }];
    setPopup({ visible: true, title, message, buttons: btns });
  }, [closePopup]);

  const persistSlots = useCallback(
    async (s1: SlotData | null, s2: SlotData | null, s3: SlotData | null) => {
      try {
        await AsyncStorage.setItem(SESSION_SLOTS_KEY, JSON.stringify({ slot1: s1, slot2: s2, slot3: s3 }));
      } catch {}
      setSlotsMode(true);
      setSlotsLoaded(true);
      setSlot1(s1);
      setSlot2(s2);
      setSlot3(s3);
    },
    []
  );

  const loadSlots = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(SESSION_SLOTS_KEY);
      if (!s) {
        setSlotsLoaded(true);
        setSlotsMode(false);
        setSlot1(null);
        setSlot2(null);
        setSlot3(null);
        return;
      }
      setSlotsMode(true);
      const raw = JSON.parse(s);

      const s1 = normalizeSlotData(pickSlot(raw, 1));
      const s2 = normalizeSlotData(pickSlot(raw, 2));
      const s3 = normalizeSlotData(pickSlot(raw, 3));

      setSlot1(s1);
      setSlot2(s2);
      setSlot3(s3);
      setSlotsLoaded(true);
    } catch {
      setSlotsLoaded(true);
      setSlotsMode(false);
      setSlot1(null);
      setSlot2(null);
      setSlot3(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadSlots();
    })();
    return () => {
      mounted = false;
    };
  }, [loadSlots]);

  const currentSlotData = useMemo(() => {
    if (!slotsLoaded) return null;
    if (!hasAnySlots) return null;
    if (selectedSlot === 1) return slot1;
    if (selectedSlot === 2) return slot2;
    return slot3;
  }, [slotsLoaded, hasAnySlots, selectedSlot, slot1, slot2, slot3]);

  const memosSource: MemoItem[] = useMemo(() => {
    if (currentSlotData?.memos) return currentSlotData.memos;
    if (slotsLoaded && slotsMode) return [];
    return memos || [];
  }, [currentSlotData, slotsLoaded, slotsMode, memos]);

  const routeSource: RoutePoint[] = useMemo(() => {
    if (currentSlotData?.route) return currentSlotData.route;
    if (slotsLoaded && slotsMode) return [];
    return route || [];
  }, [currentSlotData, slotsLoaded, slotsMode, route]);

  const activeSessionId = useMemo(() => {
    const fromSlot = currentSlotData?.sessionId;
    if (typeof fromSlot === "string" && fromSlot) return fromSlot;

    if (sessionId) return sessionId;
    const first = memosSource.find(m => typeof (m as any)?.sessionId === "string" && (m as any).sessionId);
    return (first as any)?.sessionId ?? null;
  }, [currentSlotData, sessionId, memosSource]);

  const sessionMemos = useMemo(() => {
    const arr = [...(memosSource || [])];
    const filtered = activeSessionId ? arr.filter(m => (m as any)?.sessionId === activeSessionId) : arr;
    filtered.sort((a, b) => Number((b as any)?.savedAt || 0) - Number((a as any)?.savedAt || 0));
    return filtered;
  }, [memosSource, activeSessionId]);

  const items: ListItem[] = useMemo(() => {
    return sessionMemos.map((m: any, i: number) => {
      const id = `${m?.sessionId ?? "s"}_${m?.savedAt ?? 0}_${i}`;
      const savedAt = typeof m?.savedAt === "number" ? m.savedAt : 0;
      const text = (m?.text ?? "").toString();
      const lat = typeof m?.lat === "number" ? m.lat : null;
      const lng = typeof m?.lng === "number" ? m.lng : null;
      return { id, savedAt, text, lat, lng };
    });
  }, [sessionMemos]);

  const pinItems = useMemo(() => {
    return items.filter(it => typeof it.lat === "number" && typeof it.lng === "number") as Array<ListItem & { lat: number; lng: number }>;
  }, [items]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [selectedSlot]);

  const sampledRoute = useMemo(() => downsampleRoute(routeSource || [], 800), [routeSource]);

  const routeSegments = useMemo(() => {
    const pts = sampledRoute
      .filter(p => typeof (p as any)?.lat === "number" && typeof (p as any)?.lng === "number")
      .map(p => ({ latitude: (p as any).lat, longitude: (p as any).lng }));

    if (pts.length < 2) return [];

    const segs: Array<{ key: string; coords: { latitude: number; longitude: number }[]; color: string }> = [];
    const total = pts.length - 1;

    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({
        key: `seg_${i}`,
        coords: [pts[i], pts[i + 1]],
        color: grayColorFor(i, total)
      });
    }
    return segs;
  }, [sampledRoute]);

  const initialRegion = useMemo(() => {
    const firstRoute = sampledRoute.find(p => typeof (p as any)?.lat === "number" && typeof (p as any)?.lng === "number") as any;
    const firstPin = pinItems[0];

    const lat = firstRoute?.lat ?? firstPin?.lat ?? 37.5665;
    const lng = firstRoute?.lng ?? firstPin?.lng ?? 126.978;

    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02
    };
  }, [sampledRoute, pinItems]);

  const didFitRef = useRef<boolean>(false);

  useEffect(() => {
    didFitRef.current = false;
  }, [activeSessionId, selectedSlot]);

  useEffect(() => {
    if (didFitRef.current) return;

    const coords: { latitude: number; longitude: number }[] = [];

    for (const p of sampledRoute as any[]) {
      if (typeof p?.lat === "number" && typeof p?.lng === "number") coords.push({ latitude: p.lat, longitude: p.lng });
    }
    for (const it of pinItems) coords.push({ latitude: it.lat, longitude: it.lng });

    if (coords.length < 2) return;

    didFitRef.current = true;
    requestAnimationFrame(() => {
      try {
        (mapRef.current as any)?.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 50, bottom: 220, left: 50 },
          animated: true
        });
      } catch {}
    });
  }, [sampledRoute, pinItems]);

  const idToIndex = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it, idx) => m.set(it.id, idx));
    return m;
  }, [items]);

  const ITEM_HEIGHT = 84;

  const selectById = (id: string) => {
    setSelectedId(id);
    const idx = idToIndex.get(id);
    if (typeof idx === "number") {
      try {
        (listRef.current as any)?.scrollToIndex({ index: idx, viewPosition: 0.2, animated: true });
      } catch {}
    }
  };

  const onPinPress = (id: string) => {
    selectById(id);
  };

  const onListPress = (it: ListItem) => {
    selectById(it.id);
    if (typeof it.lat === "number" && typeof it.lng === "number") {
      try {
        (mapRef.current as any)?.animateCamera({ center: { latitude: it.lat, longitude: it.lng }, zoom: 16 }, { duration: 350 });
      } catch {}
    }
  };

  const slotButtonMeta = useMemo(() => {
    const isEmpty = (d: SlotData | null) => !d || ((d.memos?.length ?? 0) === 0 && (d.route?.length ?? 0) === 0);

    const s1Empty = isEmpty(slot1);
    const s2Empty = isEmpty(slot2);
    const s3Empty = isEmpty(slot3);

    return {
      1: { empty: s1Empty },
      2: { empty: s2Empty },
      3: { empty: s3Empty }
    } as Record<SlotIndex, { empty: boolean }>;
  }, [slot1, slot2, slot3]);

  const confirmDeleteSlot = useCallback((idx: SlotIndex) => {
    const label = idx === 1 ? "최근" : String(idx);
    openPopup("삭제", `${label} 세션 기록을 삭제할까요?`, [
      { text: "취소", variant: "secondary" },
      {
        text: "삭제",
        variant: "primary",
        onPress: async () => {
          if (idx === 1) {
            await persistSlots(null, slot2, slot3);
            if (selectedSlot === 1) setSelectedId(null);
          } else if (idx === 2) {
            await persistSlots(slot1, null, slot3);
            if (selectedSlot === 2) setSelectedId(null);
          } else if (idx === 3) {
            await persistSlots(slot1, slot2, null);
            if (selectedSlot === 3) setSelectedId(null);
          }
        }
      }
    ]);
  }, [openPopup, persistSlots, slot1, slot2, slot3, selectedSlot]);

  const confirmDeleteAllTwoStep = useCallback(() => {
    openPopup("전체삭제", "최근/2/3 세션 기록을 모두 삭제할까요?", [
      { text: "취소", variant: "secondary" },
      {
        text: "다음",
        variant: "primary",
        closeOnPress: false,
        onPress: async () => {
          Promise.resolve().then(() => {
            setPopup({
              visible: true,
              title: "전체삭제 확인",
              message: "정말로 전체삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.",
              buttons: [
                { text: "취소", variant: "secondary", onPress: closePopup },
                {
                  text: "삭제",
                  variant: "primary",
                  onPress: async () => {
                    await persistSlots(null, null, null);
                    setSelectedSlot(1);
                    setSelectedId(null);
                  }
                }
              ]
            });
          });
        }
      }
    ]);
  }, [openPopup, persistSlots, closePopup]);

  const showSlotsUI = true;

  const ManageSheet = ({
    onClose
  }: {
    onClose: () => void;
  }) => {
    const s1Empty = slotButtonMeta[1]?.empty;
    const s2Empty = slotButtonMeta[2]?.empty;
    const s3Empty = slotButtonMeta[3]?.empty;

    return (
      <View style={styles.sheetOverlay} pointerEvents="auto">
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheetBox}>
          <Text style={styles.sheetTitle}>관리</Text>

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={!!s1Empty}
            onPress={() => {
              onClose();
              confirmDeleteSlot(1);
            }}
            style={[styles.sheetItem, s1Empty ? styles.sheetItemDisabled : null]}
          >
            <Text style={[styles.sheetItemText, s1Empty ? styles.sheetItemTextDisabled : null]}>최근삭제</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={!!s2Empty}
            onPress={() => {
              onClose();
              confirmDeleteSlot(2);
            }}
            style={[styles.sheetItem, s2Empty ? styles.sheetItemDisabled : null]}
          >
            <Text style={[styles.sheetItemText, s2Empty ? styles.sheetItemTextDisabled : null]}>2 삭제</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={!!s3Empty}
            onPress={() => {
              onClose();
              confirmDeleteSlot(3);
            }}
            style={[styles.sheetItem, s3Empty ? styles.sheetItemDisabled : null]}
          >
            <Text style={[styles.sheetItemText, s3Empty ? styles.sheetItemTextDisabled : null]}>3 삭제</Text>
          </TouchableOpacity>

          <View style={styles.sheetSep} />

          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => {
              onClose();
              confirmDeleteAllTwoStep();
            }}
            style={styles.sheetItem}
          >
            <Text style={styles.sheetItemDangerText}>전체삭제</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.88} onPress={onClose} style={[styles.sheetItem, styles.sheetCancelItem]}>
            <Text style={styles.sheetItemText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.pageRoot, { paddingTop: insets.top }]}>
      <StatusBar barStyle={barStyle} backgroundColor={palette.headerBg} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>메모 기록</Text>

        <View style={styles.headerRight}>
          {showSlotsUI ? (
            <View style={styles.slotRow}>
              {[1, 2, 3].map(n => {
                const idx = n as SlotIndex;
                const selected = selectedSlot === idx;
                const empty = slotButtonMeta[idx]?.empty;

                return (
                  <TouchableOpacity
                    key={`slot_${idx}`}
                    activeOpacity={0.88}
                    onPress={() => setSelectedSlot(idx)}
                    style={[styles.slotBtn, selected ? styles.slotBtnActive : null, empty ? styles.slotBtnEmpty : null]}
                  >
                    <Text style={[styles.slotText, selected ? styles.slotTextActive : null]}>{idx === 1 ? "최근" : String(idx)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <TouchableOpacity activeOpacity={0.88} onPress={() => setManageVisible(true)} style={styles.manageBtn}>
            <Text style={styles.manageBtnText}>⋯</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.88} onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.mapBox}>
          <MapViewAny
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            customMapStyle={palette.isDark ? DARK_MAP_STYLE : undefined}
          >
            {routeSegments.map(seg => (
              <PolylineAny key={seg.key} coordinates={seg.coords} strokeWidth={3} strokeColor={seg.color} />
            ))}

            {pinItems.map(p => (
              <MarkerAny key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} onPress={() => onPinPress(p.id)} />
            ))}
          </MapViewAny>
        </View>

        <View style={[styles.listBox, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>시간순 기록</Text>
            <Text style={styles.listCount}>{items.length}개</Text>
          </View>

          <FlatListAny
            ref={listRef}
            data={items}
            keyExtractor={(it: ListItem) => it.id}
            contentContainerStyle={styles.listContent}
            getItemLayout={(_: any, index: number) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
            renderItem={({ item }: any) => {
              const selected = item.id === selectedId;
              const preview = (item.text ?? "").replace(/\s+/g, " ").trim();
              return (
                <TouchableOpacity activeOpacity={0.9} onPress={() => onListPress(item)} style={[styles.card, selected ? styles.cardSelected : null]}>
                  <Text style={styles.time}>{fmtTime(item.savedAt)}</Text>
                  <Text style={styles.text} numberOfLines={2} ellipsizeMode="tail">
                    {preview || "(텍스트 없음)"}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>

      {manageVisible ? <ManageSheet onClose={() => setManageVisible(false)} /> : null}
      <AlertPopup state={popup} onClose={closePopup} styles={styles} bottomInset={insets.bottom} />

    </View>
  );
}

function createStyles(p: ThemePalette) {
  const dim = p.isDark ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.50)";
  const dangerText = p.isDark ? "rgba(255,110,110,0.95)" : "rgba(230,46,60,0.95)";

  return StyleSheet.create({
    pageRoot: { flex: 1, backgroundColor: p.pageBg },

    header: {
      height: 56,
      paddingHorizontal: 16,
      backgroundColor: p.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    headerTitle: { color: p.text, fontSize: 16, fontWeight: "700" },

    headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    slotRow: { flexDirection: "row", alignItems: "center", gap: 6 },

    slotBtn: {
      height: 30,
      paddingHorizontal: 10,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: p.slotOffBg,
      borderWidth: 1,
      borderColor: p.slotOffBorder
    },
    slotBtnActive: {
      backgroundColor: p.slotOnBg,
      borderColor: p.slotOnBorder
    },
    slotBtnEmpty: {
      opacity: 0.45
    },
    slotText: { color: p.subText, fontSize: 11, fontWeight: "700" },
    slotTextActive: { color: p.slotOnText },

    manageBtn: {
      width: 44,
      height: 38,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: p.closeBtnBg
    },
    manageBtnText: { color: p.subText, fontSize: 18, fontWeight: "700", marginTop: -2 },

    closeBtn: {
      paddingHorizontal: 14,
      height: 38,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: p.closeBtnBg
    },
    closeBtnText: { color: p.subText, fontSize: 12, fontWeight: "700" },

    body: { flex: 1, paddingHorizontal: 14, paddingTop: 12, gap: 12 },

    mapBox: {
      flex: 1.05,
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: p.mapBg,
      borderWidth: 1,
      borderColor: p.mapBorder
    },

    listBox: {
      flex: 0.95,
      borderRadius: 20,
      backgroundColor: p.listBg,
      borderWidth: 1,
      borderColor: p.border,
      overflow: "hidden"
    },
    listHeader: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: p.listHeaderBorder,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    listTitle: { color: p.text, fontSize: 13, fontWeight: "700" },
    listCount: { color: p.muted, fontSize: 11, fontWeight: "800" },

    listContent: { padding: 14, gap: 10 },

    card: {
      height: 84,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: p.cardBorder,
      backgroundColor: p.cardBg,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10
    },
    cardSelected: {
      borderWidth: 2,
      borderColor: p.cardSelectedBorder
    },
    time: { color: p.text, fontSize: 12, fontWeight: "700" },
    text: { marginTop: 6, color: p.subText, fontSize: 12, lineHeight: 18 },

    sheetOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: dim,
      justifyContent: "flex-end",
      zIndex: 30000
    },
    sheetBox: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 14,
      backgroundColor: p.headerBg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderTopWidth: 1,
      borderColor: p.border
    },
    sheetTitle: { color: p.text, fontSize: 13, fontWeight: "700", marginBottom: 10 },
    sheetItem: {
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: p.closeBtnBg,
      borderWidth: 1,
      borderColor: p.border,
      marginBottom: 8
    },
    sheetCancelItem: {
      marginBottom: 0
    },
    sheetItemText: { color: p.subText, fontSize: 13, fontWeight: "700" },
    sheetItemDangerText: { color: dangerText, fontSize: 13, fontWeight: "700" },
    sheetItemDisabled: { opacity: 0.45 },
    sheetItemTextDisabled: { color: p.muted },
    sheetSep: { height: 1, backgroundColor: p.border2, marginVertical: 6 },

    popupDim: { flex: 1, backgroundColor: dim, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
    popupBox: {
      width: "100%",
      maxWidth: 380,
      backgroundColor: p.headerBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: p.border,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12
    },
    popupTitle: { color: p.text, fontSize: 15, fontWeight: "700" },
    popupMsg: { marginTop: 8, color: p.subText, fontSize: 12, lineHeight: 18 },
    popupBtns: { marginTop: 12, gap: 10 },
    popupBtn: { height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    popupBtnPrimary: { backgroundColor: p.closeBtnBg, borderColor: p.border },
    popupBtnSecondary: { backgroundColor: "transparent", borderColor: p.border },
    popupBtnDisabled: { opacity: 0.45 },
    popupBtnText: { fontSize: 13, fontWeight: "700" },
    popupBtnTextPrimary: { color: p.text },
    popupBtnTextSecondary: { color: p.subText },
    popupBtnTextDisabled: { color: p.muted }
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
