import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Dimensions, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import type { LatLng, Region } from "react-native-maps";

type Center = { lat: number; lng: number };

export type RoutePoint = { lat: number; lng: number; t?: number; acc?: number };

export type MemoPin = {
  id: string;
  lat: number;
  lng: number;
  text?: string;
  savedAt?: number;
  sessionId?: string;
};

type Props = {
  center: Center;
  style?: StyleProp<ViewStyle>;

  route?: RoutePoint[];
  memoPins?: MemoPin[];

  onPressMemoPin?: (pin: MemoPin) => void;

  showCenterMarker?: boolean;

  autoFit?: boolean;

  fitSessionId?: string | null;
};

function fmtTime(ms?: number) {
  const t = typeof ms === "number" && ms > 0 ? ms : 0;
  if (!t) return "";
  try {
    return new Date(t).toLocaleString("ko-KR", { hour12: false });
  } catch {
    return String(t);
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isValidLatLng(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) > 0.001 &&
    Math.abs(lng) > 0.001
  );
}

type BubblePos = { x: number; y: number; placement: "above" | "below" };

const BUBBLE_W = 280;
const BUBBLE_MAX_H = 360;
const EDGE = 12;
const DEFAULT_DELTA = 0.02;

const KEY_MAP_DELTA = "RIDERNOTE_MAP_DELTA_V1";

export default function GoogleMap({
  center,
  style,
  route,
  memoPins,
  showCenterMarker,
  autoFit,
  fitSessionId
}: Props) {
  const mapRef = useRef<any>(null);
  const userInteractedRef = useRef<boolean>(false);

  const [mapReady, setMapReady] = useState<boolean>(false);
  const [selectedPin, setSelectedPin] = useState<MemoPin | null>(null);
  const [bubblePos, setBubblePos] = useState<BubblePos | null>(null);

  const [delta, setDelta] = useState<{ latitudeDelta: number; longitudeDelta: number }>({
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA
  });
  const deltaRef = useRef<{ latitudeDelta: number; longitudeDelta: number }>({
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA
  });
  const loadedDeltaRef = useRef<boolean>(false);
  const appliedDeltaRef = useRef<boolean>(false);
  const saveTimerRef = useRef<any>(null);

  const autoCenterDoneRef = useRef<boolean>(false);
  const appStateRef = useRef<string>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        autoCenterDoneRef.current = false;
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await AsyncStorage.getItem(KEY_MAP_DELTA);
        if (!alive || !s) return;
        const obj = JSON.parse(s);
        const latD = Number(obj?.latitudeDelta);
        const lngD = Number(obj?.longitudeDelta);
        if (Number.isFinite(latD) && Number.isFinite(lngD) && latD > 0 && lngD > 0) {
          const next = {
            latitudeDelta: clamp(latD, 0.0005, 5),
            longitudeDelta: clamp(lngD, 0.0005, 5)
          };
          deltaRef.current = next;
          loadedDeltaRef.current = true;
          setDelta(next);
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    userInteractedRef.current = false;
  }, [fitSessionId]);

  const initialRegion: Region = useMemo(
    () => ({
      latitude: center.lat,
      longitude: center.lng,
      latitudeDelta: delta.latitudeDelta,
      longitudeDelta: delta.longitudeDelta
    }),
    [center.lat, center.lng, delta.latitudeDelta, delta.longitudeDelta]
  );

  const routeCoords: LatLng[] = useMemo(() => {
    const r = route || [];
    return r
      .filter((p) => typeof p?.lat === "number" && typeof p?.lng === "number")
      .map((p) => ({ latitude: p.lat, longitude: p.lng }));
  }, [route]);

  const pins: MemoPin[] = useMemo(() => {
    const p = memoPins || [];
    return p.filter((x) => x && typeof x.lat === "number" && typeof x.lng === "number" && typeof x.id === "string");
  }, [memoPins]);

  const fitPins: MemoPin[] = useMemo(() => {
    if (!fitSessionId) return pins;
    return pins.filter((p) => (p.sessionId ? p.sessionId === fitSessionId : false));
  }, [pins, fitSessionId]);

  const defaultCenterMarker = pins.length === 0 && routeCoords.length === 0;
  const shouldShowCenterMarker = typeof showCenterMarker === "boolean" ? showCenterMarker : defaultCenterMarker;

  const doFit = useCallback(() => {
    const enabled = typeof autoFit === "boolean" ? autoFit : true;
    if (!enabled) return;
    if (!mapReady) return;
    if (userInteractedRef.current) return;

    const targets: LatLng[] = [];
    if (routeCoords.length >= 2) targets.push(...routeCoords);
    if (fitPins.length > 0) {
      for (const p of fitPins) targets.push({ latitude: p.lat, longitude: p.lng });
    }

    if (targets.length === 0) return;

    const pad = { top: 70, right: 50, bottom: 220, left: 50 };

    try {
      mapRef.current?.fitToCoordinates?.(targets, { edgePadding: pad, animated: true });
    } catch {}
  }, [autoFit, fitPins, mapReady, routeCoords]);

  const updateBubblePosition = useCallback(
    async (pin: MemoPin) => {
      if (!mapReady) return;
      const map = mapRef.current;
      if (!map?.pointForCoordinate) return;

      try {
        const pt = await map.pointForCoordinate({ latitude: pin.lat, longitude: pin.lng });
        const { width, height } = Dimensions.get("window");

        const clampedX = clamp(pt.x, BUBBLE_W / 2 + EDGE, width - BUBBLE_W / 2 - EDGE);

        const canPlaceAbove = pt.y > BUBBLE_MAX_H + 56;
        const canPlaceBelow = height - pt.y > BUBBLE_MAX_H + 56;

        const placement: "above" | "below" = canPlaceAbove ? "above" : canPlaceBelow ? "below" : "above";
        setBubblePos({ x: clampedX, y: pt.y, placement });
      } catch {}
    },
    [mapReady]
  );

  useEffect(() => {
    if (!mapReady) return;
    if (!loadedDeltaRef.current) return;
    if (appliedDeltaRef.current) return;

    appliedDeltaRef.current = true;

    try {
      mapRef.current?.animateToRegion?.(
        {
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: deltaRef.current.latitudeDelta,
          longitudeDelta: deltaRef.current.longitudeDelta
        },
        1
      );
    } catch {}
  }, [mapReady, center.lat, center.lng, delta.latitudeDelta, delta.longitudeDelta]);

  useEffect(() => {
    if (!mapReady) return;
    if (userInteractedRef.current) return;

    const enabled = typeof autoFit === "boolean" ? autoFit : true;
    const hasTargets = routeCoords.length >= 2 || fitPins.length > 0;

    if (enabled && hasTargets) {
      requestAnimationFrame(() => doFit());
      return;
    }

    try {
      mapRef.current?.animateToRegion?.(
        {
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: deltaRef.current.latitudeDelta,
          longitudeDelta: deltaRef.current.longitudeDelta
        },
        350
      );
    } catch {}
  }, [center.lat, center.lng, mapReady, autoFit, routeCoords.length, fitPins.length, doFit]);

  useEffect(() => {
    if (!mapReady) return;
    requestAnimationFrame(() => doFit());
  }, [mapReady, doFit]);

  useEffect(() => {
    if (!selectedPin) return;
    updateBubblePosition(selectedPin);
  }, [selectedPin, updateBubblePosition]);

  const closeBubble = useCallback(() => {
    setSelectedPin(null);
    setBubblePos(null);
  }, []);

  const handlePressPin = useCallback(
    (pin: MemoPin) => {
      setSelectedPin(pin);
      updateBubblePosition(pin);
    },
    [updateBubblePosition]
  );

  const bubbleText = useMemo(() => {
    const text = (selectedPin?.text ?? "").toString();
    return text;
  }, [selectedPin]);

  const bubbleTime = useMemo(() => fmtTime(selectedPin?.savedAt), [selectedPin?.savedAt]);

  const bubbleScrollMax = useMemo(() => {
    const { height } = Dimensions.get("window");
    return Math.min(BUBBLE_MAX_H, Math.max(180, Math.floor(height * 0.55)));
  }, []);

  return (
    <View style={[styles.root, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
        onMapReady={() => setMapReady(true)}
        onPress={closeBubble}
        onUserLocationChange={(e: any) => {
          if (!mapReady) return;
          if (userInteractedRef.current) return;
          if (autoCenterDoneRef.current) return;

          const coord = e?.nativeEvent?.coordinate;
          const lat = Number(coord?.latitude);
          const lng = Number(coord?.longitude);
          const acc = Number(coord?.accuracy);

          if (!isValidLatLng(lat, lng)) return;
          if (Number.isFinite(acc) && acc > 2000) return;

          autoCenterDoneRef.current = true;

          try {
            mapRef.current?.animateToRegion?.(
              {
                latitude: lat,
                longitude: lng,
                latitudeDelta: deltaRef.current.latitudeDelta,
                longitudeDelta: deltaRef.current.longitudeDelta
              },
              450
            );
          } catch {}
        }}
        onPanDrag={() => {
          userInteractedRef.current = true;
        }}
        onRegionChangeComplete={(region: Region, details?: any) => {
          const latD = clamp(region.latitudeDelta, 0.0005, 5);
          const lngD = clamp(region.longitudeDelta, 0.0005, 5);

          const prev = deltaRef.current;
          if (Math.abs(prev.latitudeDelta - latD) > 1e-12 || Math.abs(prev.longitudeDelta - lngD) > 1e-12) {
            const next = { latitudeDelta: latD, longitudeDelta: lngD };
            deltaRef.current = next;
            setDelta(next);
          }

          if (details?.isGesture) userInteractedRef.current = true;

          if (details?.isGesture) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
              AsyncStorage.setItem(KEY_MAP_DELTA, JSON.stringify(deltaRef.current)).catch(() => {});
            }, 250);
          }

          if (selectedPin) updateBubblePosition(selectedPin);
        }}
      >
        {routeCoords.length >= 2 && <Polyline coordinates={routeCoords} strokeWidth={4} />}

        {pins.map((pin) => (
          <Marker key={pin.id} coordinate={{ latitude: pin.lat, longitude: pin.lng }} onPress={() => handlePressPin(pin)} />
        ))}

        {shouldShowCenterMarker && <Marker coordinate={{ latitude: center.lat, longitude: center.lng }} />}
      </MapView>

      {!!selectedPin && !!bubblePos && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View pointerEvents="box-none" style={[styles.bubbleAnchor, { left: bubblePos.x, top: bubblePos.y }]}>
            <View
              pointerEvents="box-none"
              style={[styles.bubbleWrap, bubblePos.placement === "above" ? styles.bubbleAbove : styles.bubbleBelow]}
            >
              {bubblePos.placement === "below" && <View style={[styles.arrowUp]} />}

              <View style={[styles.bubbleBox, { maxHeight: bubbleScrollMax }]}>
                {!!bubbleTime && <Text style={styles.bubbleTime}>{bubbleTime}</Text>}

                <ScrollView
                  style={styles.bubbleScroll}
                  contentContainerStyle={styles.bubbleScrollContent}
                  showsVerticalScrollIndicator
                >
                  <Text style={styles.bubbleText}>{bubbleText.trim() || "(텍스트 없음)"}</Text>
                </ScrollView>
              </View>

              {bubblePos.placement === "above" && <View style={[styles.arrowDown]} />}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  bubbleAnchor: {
    position: "absolute"
  },
  bubbleWrap: {
    position: "absolute",
    width: BUBBLE_W,
    left: -BUBBLE_W / 2,
    alignItems: "center"
  },
  bubbleAbove: {
    bottom: 16
  },
  bubbleBelow: {
    top: 16
  },

  bubbleBox: {
    width: BUBBLE_W,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(29,44,59,0.12)"
  },
  bubbleTime: {
    fontSize: 11,
    fontWeight: "900",
    color: "rgba(29,44,59,0.75)",
    marginBottom: 6
  },
  bubbleScroll: {
    flexGrow: 0
  },
  bubbleScrollContent: {
    paddingBottom: 4
  },
  bubbleText: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(29,44,59,0.90)",
    lineHeight: 17
  },

  arrowDown: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF"
  },
  arrowUp: {
    width: 0,
    height: 0,
    marginBottom: -1,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF"
  }
});
