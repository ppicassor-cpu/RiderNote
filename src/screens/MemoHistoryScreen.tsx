import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, StyleSheet, Text, TouchableOpacity, View, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import type { RoutePoint } from "../components/GoogleMap";
import type { MemoItem } from "../native/NativeTracker";

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
  if (total <= 1) return "rgb(0,0,0)";
  const r = index / (total - 1);
  const g = Math.round(200 - r * 200);
  const gg = clamp(g, 0, 200);
  return `rgb(${gg},${gg},${gg})`;
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

  // slots wrapper
  if (raw && typeof raw === "object" && raw.slots) raw = raw.slots;

  // array: [slot1, slot2, slot3]
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

  const memosRaw = Array.isArray(v.memos) ? v.memos : Array.isArray(v.memo) ? v.memo : Array.isArray(v.items) ? v.items : null;
  const routeRaw = Array.isArray(v.route) ? v.route : Array.isArray(v.routes) ? v.routes : Array.isArray(v.path) ? v.path : null;

  const memos = memosRaw ? (memosRaw as MemoItem[]) : undefined;
  const route = routeRaw ? (routeRaw as RoutePoint[]) : undefined;

  // 슬롯이 "완전 빈 객체"인 경우 null로 취급
  const hasAny = Boolean(sessionId) || Boolean(startedAt) || Boolean(endedAt) || (memos?.length ?? 0) > 0 || (route?.length ?? 0) > 0;
  if (!hasAny) return null;

  return { sessionId, startedAt, endedAt, memos, route };
}

export default function MemoHistoryScreen({ memos, route, sessionId, onClose }: Props) {
  const insets = useSafeAreaInsets();

  // ✅ callback ref 금지: 객체 ref로 고정 (TS 2322/2769 방지)
  const mapRef = useRef<MapView | null>(null);
  const listRef = useRef<FlatList<ListItem> | null>(null);

  const SESSION_SLOTS_KEY = "session_slots_v1";

  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [slot1, setSlot1] = useState<SlotData | null>(null);
  const [slot2, setSlot2] = useState<SlotData | null>(null);
  const [slot3, setSlot3] = useState<SlotData | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotIndex>(1);

  const hasAnySlots = useMemo(() => {
    return Boolean(slot1 || slot2 || slot3);
  }, [slot1, slot2, slot3]);

  const loadSlots = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(SESSION_SLOTS_KEY);
      if (!s) {
        setSlotsLoaded(true);
        setSlot1(null);
        setSlot2(null);
        setSlot3(null);
        return;
      }
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

  // 슬롯이 있으면 슬롯 데이터 우선, 없으면 기존 props 유지
  const memosSource: MemoItem[] = useMemo(() => {
    if (currentSlotData?.memos) return currentSlotData.memos;
    if (slotsLoaded && hasAnySlots) return [];
    return memos || [];
  }, [currentSlotData, slotsLoaded, hasAnySlots, memos]);

  const routeSource: RoutePoint[] = useMemo(() => {
    if (currentSlotData?.route) return currentSlotData.route;
    if (slotsLoaded && hasAnySlots) return [];
    return route || [];
  }, [currentSlotData, slotsLoaded, hasAnySlots, route]);

  const activeSessionId = useMemo(() => {
    // 슬롯 모드에서는 slot.sessionId 우선
    const fromSlot = currentSlotData?.sessionId;
    if (typeof fromSlot === "string" && fromSlot) return fromSlot;

    // 기존 props 로직 유지
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

  // 슬롯 변경 시 선택/피팅 리셋
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

  // 슬롯/세션 변화 시 fit 재시도
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
        mapRef.current?.fitToCoordinates(coords, {
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
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.2, animated: true });
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
        mapRef.current?.animateCamera(
          { center: { latitude: it.lat, longitude: it.lng }, zoom: 16 },
          { duration: 350 }
        );
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

  const showSlotsUI = true;

  return (
    <View style={[styles.pageRoot, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>메모 기록</Text>

        <View style={styles.headerRight}>
          {showSlotsUI ? (
            <View style={styles.slotRow}>
              {[1, 2, 3].map((n) => {
                const idx = n as SlotIndex;
                const selected = selectedSlot === idx;
                const empty = slotButtonMeta[idx]?.empty;

                return (
                  <TouchableOpacity
                    key={`slot_${idx}`}
                    activeOpacity={0.88}
                    onPress={() => setSelectedSlot(idx)}
                    style={[
                      styles.slotBtn,
                      selected ? styles.slotBtnActive : null,
                      empty ? styles.slotBtnEmpty : null
                    ]}
                  >
                    <Text style={[styles.slotText, selected ? styles.slotTextActive : null]}>
                      {idx === 1 ? "최근" : String(idx)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <TouchableOpacity activeOpacity={0.88} onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.mapBox}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          >
            {routeSegments.map(seg => (
              <Polyline
                key={seg.key}
                coordinates={seg.coords}
                strokeWidth={4}
                strokeColor={seg.color}
              />
            ))}

            {pinItems.map((p) => (
              <Marker
                key={p.id}
                coordinate={{ latitude: p.lat, longitude: p.lng }}
                onPress={() => onPinPress(p.id)}
              />
            ))}
          </MapView>
        </View>

        <View style={[styles.listBox, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>시간순 기록</Text>
            <Text style={styles.listCount}>{items.length}개</Text>
          </View>

          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(it) => it.id}
            contentContainerStyle={styles.listContent}
            getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              const preview = (item.text ?? "").replace(/\s+/g, " ").trim();
              return (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => onListPress(item)}
                  style={[
                    styles.card,
                    selected ? styles.cardSelected : null
                  ]}
                >
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
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#F7FAFF" },

  header: {
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(29,44,59,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerTitle: { color: "#1D2C3B", fontSize: 16, fontWeight: "900" },

  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  slotRow: { flexDirection: "row", alignItems: "center", gap: 6 },

  slotBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29,44,59,0.06)",
    borderWidth: 1,
    borderColor: "rgba(29,44,59,0.10)"
  },
  slotBtnActive: {
    backgroundColor: "rgba(47, 183, 163, 0.12)",
    borderColor: "rgba(47, 183, 163, 0.38)"
  },
  slotBtnEmpty: {
    opacity: 0.45
  },
  slotText: { color: "rgba(29,44,59,0.78)", fontSize: 11, fontWeight: "900" },
  slotTextActive: { color: "rgba(19,68,61,0.95)" },

  closeBtn: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29,44,59,0.06)"
  },
  closeBtnText: { color: "rgba(29,44,59,0.78)", fontSize: 12, fontWeight: "900" },

  body: { flex: 1, paddingHorizontal: 14, paddingTop: 12, gap: 12 },

  mapBox: {
    flex: 1.05,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#EAF4FF",
    borderWidth: 1,
    borderColor: "rgba(29,44,59,0.08)"
  },

  listBox: {
    flex: 0.95,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(29,44,59,0.10)",
    overflow: "hidden"
  },
  listHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(29,44,59,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  listTitle: { color: "#1D2C3B", fontSize: 13, fontWeight: "900" },
  listCount: { color: "rgba(29,44,59,0.55)", fontSize: 11, fontWeight: "800" },

  listContent: { padding: 14, gap: 10 },

  card: {
    height: 84,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(29,44,59,0.08)",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: "rgba(47, 183, 163, 0.65)"
  },
  time: { color: "#1D2C3B", fontSize: 12, fontWeight: "900" },
  text: { marginTop: 6, color: "rgba(29,44,59,0.78)", fontSize: 12, lineHeight: 18 }
});
