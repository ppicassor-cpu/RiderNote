// FILE: C:\RiderNote\src\components\GoogleMap.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  useColorScheme
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NaverMapView, NaverMapMarkerOverlay, NaverMapPathOverlay } from "@mj-studio/react-native-naver-map";
import * as Location from "expo-location";

type LatLng = { latitude: number; longitude: number };
type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

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
  isNightModeEnabled?: boolean;
  route?: RoutePoint[];
  memoPins?: MemoPin[];
  onDeleteMemoPin?: (pin: MemoPin) => void | Promise<void>;
  onUpdateMemoPin?: (pin: MemoPin, nextText: string) => void | Promise<void>;
  showCenterMarker?: boolean;
  autoFit?: boolean;
  fitSessionId?: string | null;
  onCenterChange?: (newCenter: Center) => void;
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

type RouteSeg = { coords: LatLng[]; color: string };

type MapLayerProps = {
  initialRegion: Region;
  routeSegments: RouteSeg[];
  pins: MemoPin[];
  shouldShowCenterMarker: boolean;
  center: Center;
  isNightModeEnabled?: boolean;
  myLocation: { lat: number; lng: number; acc?: number } | null;
  onInitialized: () => void | Promise<void>;
  onTapMap: () => void;
  onCameraChanged: (e: any) => void;
  onCameraIdle: (camera: any) => void;
  onTapPin: (pin: MemoPin) => void;
};

const NaverMapLayer = React.memo(
  React.forwardRef<any, MapLayerProps>(function NaverMapLayerInner(
    { initialRegion, routeSegments, pins, shouldShowCenterMarker, center, isNightModeEnabled, myLocation, onInitialized, onTapMap, onCameraChanged, onCameraIdle, onTapPin },
    ref
  ) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";

    return (
      <NaverMapView
        ref={ref}
        style={styles.map}
        initialRegion={initialRegion}
        mapType={isDark ? "Navi" : "Basic"}
        isNightModeEnabled={!!isNightModeEnabled}
        locationOverlay={
          myLocation && isValidLatLng(myLocation.lat, myLocation.lng)
            ? {
                isVisible: true,
                position: { latitude: myLocation.lat, longitude: myLocation.lng },
                image: { httpUri: "https://twemoji.maxcdn.com/v/latest/72x72/1f6f5.png" },
                imageWidth: 28,
                imageHeight: 28,
                anchor: { x: 0.5, y: 0.5 },
                circleRadius: 0,
                circleColor: "transparent",
                circleOutlineWidth: 0,
                circleOutlineColor: "transparent"
              }
            : { isVisible: false }
        }
        onInitialized={onInitialized}
        onTapMap={onTapMap}
        onCameraChanged={onCameraChanged}
        onCameraIdle={onCameraIdle}
      >
        {routeSegments.map((seg, i) => (
          <NaverMapPathOverlay key={`route_seg_${i}`} coords={seg.coords as any} width={3} color={seg.color} />
        ))}

        {pins.map((pin) => (
          <NaverMapMarkerOverlay
            key={pin.id}
            latitude={pin.lat}
            longitude={pin.lng}
            onTap={() => onTapPin(pin)}
          />
        ))}

        {shouldShowCenterMarker && isValidLatLng(center.lat, center.lng) && (
          <NaverMapMarkerOverlay latitude={center.lat} longitude={center.lng} image={{ symbol: "lightblue" }} />
        )}
      </NaverMapView>
    );
  })
);

export default function GoogleMap({
  center,
  style,
  isNightModeEnabled,
  route,
  memoPins,
  showCenterMarker,
  autoFit,
  fitSessionId,
  onDeleteMemoPin,
  onUpdateMemoPin,
  onCenterChange
}: Props) {
  const mapRef = useRef<any>(null);

  const [mapReady, setMapReady] = useState<boolean>(false);
  const [bootRegion, setBootRegion] = useState<Region | null>(() => {
    let latitude = center.lat;
    let longitude = center.lng;
    if (!isValidLatLng(latitude, longitude)) {
      latitude = 37.5665;
      longitude = 126.978;
    }
    return {
      latitude,
      longitude,
      latitudeDelta: DEFAULT_DELTA,
      longitudeDelta: DEFAULT_DELTA
    };
  });
  const [appPulse, setAppPulse] = useState<number>(0);
  const forceSnapRef = useRef<boolean>(true);
  const resumeFollowOnceRef = useRef<boolean>(false);

  const [selectedPin, setSelectedPin] = useState<MemoPin | null>(null);
  const selectedPinRef = useRef<MemoPin | null>(null);

  const [bubblePos, setBubblePos] = useState<BubblePos | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState<boolean>(false);
  const [editVisible, setEditVisible] = useState<boolean>(false);
  const [editText, setEditText] = useState<string>("");

  const userInteractedRef = useRef<boolean>(false);
  const lastCameraReasonRef = useRef<"Developer" | "Gesture" | "Control" | "Location" | null>(null);

  const lastZoomRef = useRef<number | null>(null);
  const lastBearingRef = useRef<number | null>(null);
  const lastTiltRef = useRef<number | null>(null);

  const autoCenterDoneRef = useRef<boolean>(false);
  const appStateRef = useRef<string>(AppState.currentState);

  const [followMyLocation, setFollowMyLocation] = useState<boolean>(true);
  const followMyLocationRef = useRef<boolean>(true);

  const lastUserCoordRef = useRef<{ lat: number; lng: number; acc?: number } | null>(null);
  const lastFollowAnimAtRef = useRef<number>(0);
  const lastFollowCoordRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationWatcherRef = useRef<any>(null);

  const [myLocOverlay, setMyLocOverlay] = useState<{ lat: number; lng: number; acc?: number } | null>(null);

  const setMyLocOverlayStable = useCallback((lat: number, lng: number, acc?: number) => {
    setMyLocOverlay((prev) => {
      if (prev && Math.abs(prev.lat - lat) < 0.0000005 && Math.abs(prev.lng - lng) < 0.0000005) {
        const pAcc = typeof prev.acc === "number" ? prev.acc : -1;
        const nAcc = typeof acc === "number" ? acc : -1;
        if (Math.abs(pAcc - nAcc) < 1) return prev;
      }
      return { lat, lng, acc };
    });
  }, []);

  const deltaRef = useRef<{ latitudeDelta: number; longitudeDelta: number }>({
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA
  });
  const loadedDeltaRef = useRef<boolean>(false);
  const appliedDeltaRef = useRef<boolean>(false);
  const saveTimerRef = useRef<any>(null);

  const onCenterChangeRef = useRef<Props["onCenterChange"]>(onCenterChange);
  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  useEffect(() => {
    followMyLocationRef.current = followMyLocation;
  }, [followMyLocation]);

  useEffect(() => {
    selectedPinRef.current = selectedPin;
  }, [selectedPin]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        autoCenterDoneRef.current = false;
        forceSnapRef.current = true;
        resumeFollowOnceRef.current = true;
        setAppPulse((v) => v + 1);
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

        const latD0 = Number(obj?.latitudeDelta);
        const lngD0 = Number(obj?.longitudeDelta);

        if (Number.isFinite(latD0) && Number.isFinite(lngD0) && latD0 > 0 && lngD0 > 0) {
          deltaRef.current = {
            latitudeDelta: clamp(latD0, 0.0005, 5),
            longitudeDelta: clamp(lngD0, 0.0005, 5)
          };
          loadedDeltaRef.current = true;
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;

      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    userInteractedRef.current = false;
  }, [fitSessionId]);

  const initialRegionRef = useRef<Region | null>(null);
  if (!initialRegionRef.current) {
    let latitude = center.lat;
    let longitude = center.lng;
    if (!isValidLatLng(latitude, longitude)) {
      latitude = 37.5665;
      longitude = 126.978;
    }
    initialRegionRef.current = {
      latitude,
      longitude,
      latitudeDelta: deltaRef.current.latitudeDelta,
      longitudeDelta: deltaRef.current.longitudeDelta
    };
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const last = await Location.getLastKnownPositionAsync();
        const lat = Number(last?.coords?.latitude);
        const lng = Number(last?.coords?.longitude);
        const acc = Number(last?.coords?.accuracy);

        if (!alive) return;

        if (!isValidLatLng(lat, lng) || (Number.isFinite(acc) && acc > 2000)) return;

        lastUserCoordRef.current = { lat, lng, acc };
        setMyLocOverlayStable(lat, lng, acc);
        lastFollowCoordRef.current = { lat, lng };
        lastFollowAnimAtRef.current = Date.now();

        onCenterChangeRef.current?.({ lat, lng });
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const routeCoords: LatLng[] = useMemo(() => {
    const r = route || [];
    return r
      .filter((p) => typeof p?.lat === "number" && typeof p?.lng === "number" && isValidLatLng(p.lat, p.lng))
      .map((p) => ({ latitude: p.lat, longitude: p.lng }));
  }, [route]);

  const routeSegments: RouteSeg[] = useMemo(() => {
    const pts = (route || [])
      .filter((p) => typeof p?.lat === "number" && typeof p?.lng === "number" && isValidLatLng(p.lat, p.lng))
      .map((p) => ({
        lat: p.lat as number,
        lng: p.lng as number,
        t: typeof (p as any)?.t === "number" ? ((p as any).t as number) : undefined
      }));

    if (pts.length < 2) return [];

    const baseR = 123;
    const baseG = 228;
    const baseB = 241;

    const alphaStart = 0.25;
    const alphaEnd = 0.85;

    const hasTime = pts.some((p) => typeof p.t === "number" && Number.isFinite(p.t));
    let minT = Infinity;
    let maxT = -Infinity;

    if (hasTime) {
      for (const p of pts) {
        const tt = p.t;
        if (typeof tt === "number" && Number.isFinite(tt)) {
          if (tt < minT) minT = tt;
          if (tt > maxT) maxT = tt;
        }
      }
      if (!Number.isFinite(minT) || !Number.isFinite(maxT) || maxT <= minT) {
        minT = 0;
        maxT = 0;
      }
    }

    const segs: RouteSeg[] = [];
    const denomIdx = Math.max(1, pts.length - 2);

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];

      let ratio = 0;
      if (hasTime && typeof b.t === "number" && Number.isFinite(b.t) && maxT > minT) {
        ratio = (b.t - minT) / (maxT - minT);
      } else {
        ratio = i / denomIdx;
      }

      ratio = Math.max(0, Math.min(1, ratio));
      const alpha = alphaStart + (alphaEnd - alphaStart) * ratio;
      const color = `rgba(${baseR}, ${baseG}, ${baseB}, ${alpha.toFixed(3)})`;

      segs.push({
        coords: [
          { latitude: a.lat, longitude: a.lng },
          { latitude: b.lat, longitude: b.lng }
        ],
        color
      });
    }

    return segs;
  }, [route]);

  const routeSegmentsWithMyLoc: RouteSeg[] = useMemo(() => {
    const my = myLocOverlay;
    if (!my || !isValidLatLng(my.lat, my.lng)) return routeSegments;

    if (routeSegments.length > 0) {
      const lastSeg = routeSegments[routeSegments.length - 1];
      const lastCoords = lastSeg?.coords || [];
      const last = lastCoords[lastCoords.length - 1];
      if (!last) return routeSegments;

      return [
        ...routeSegments,
        {
          coords: [last, { latitude: my.lat, longitude: my.lng }],
          color: lastSeg.color
        }
      ];
    }

    if (routeCoords.length > 0) {
      const last = routeCoords[routeCoords.length - 1];
      return [
        {
          coords: [last, { latitude: my.lat, longitude: my.lng }],
          color: "rgba(123, 228, 241, 0.850)"
        }
      ];
    }

    return routeSegments;
  }, [routeSegments, myLocOverlay, routeCoords]);

  const pins: MemoPin[] = useMemo(() => {
    const p = memoPins || [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return p.filter(
      (x) =>
        x &&
        typeof x.lat === "number" &&
        typeof x.lng === "number" &&
        typeof x.id === "string" &&
        isValidLatLng(x.lat, x.lng) &&
        typeof x.savedAt === "number" &&
        x.savedAt > cutoff
    );
  }, [memoPins]);

  const fitPins: MemoPin[] = useMemo(() => {
    if (!fitSessionId) return pins;
    return pins.filter((p) => (p.sessionId ? p.sessionId === fitSessionId : false));
  }, [pins, fitSessionId]);

  const defaultCenterMarker = pins.length === 0 && routeCoords.length === 0;
  const shouldShowCenterMarker = typeof showCenterMarker === "boolean" ? showCenterMarker : defaultCenterMarker;

  const animateToUser = useCallback((lat: number, lng: number, ms: number) => {
    const map = mapRef.current;
    if (!map) return;

    const tryCall = (fn: any, ...args: any[]) => {
      try {
        fn?.(...args);
        return true;
      } catch {
        return false;
      }
    };

    const z = lastZoomRef.current;
    const b = lastBearingRef.current;
    const t = lastTiltRef.current;

    const camBase: any = {
      latitude: lat,
      longitude: lng,
      duration: ms,
      easing: "EaseInOut"
    };
    if (Number.isFinite(b as any)) camBase.bearing = b;
    if (Number.isFinite(t as any)) camBase.tilt = t;

    // 1) 가장 확실: cameraTo(줌 유지 시도)
    if (typeof map.animateCameraTo === "function") {
      if (tryCall(map.animateCameraTo, camBase)) return;

      const z2 = Number.isFinite(z as any) && (z as number) > 0 ? (z as number) : 16;
      if (tryCall(map.animateCameraTo, { ...camBase, zoom: z2 })) return;
    }

    // 2) 구버전/다른 시그니처 지원: animateCamera
    if (typeof map.animateCamera === "function") {
      if (tryCall(map.animateCamera, { center: { latitude: lat, longitude: lng }, duration: ms })) return;
      if (tryCall(map.animateCamera, { latitude: lat, longitude: lng, duration: ms })) return;
      if (tryCall(map.animateCamera, { lat, lng, duration: ms })) return;
      if (tryCall(map.animateCamera, { center: { lat, lng }, duration: ms })) return;
      const z2 = Number.isFinite(z as any) && (z as number) > 0 ? (z as number) : 16;
      if (tryCall(map.animateCamera, { latitude: lat, longitude: lng, zoom: z2, duration: ms })) return;
      if (tryCall(map.animateCamera, { center: { latitude: lat, longitude: lng }, zoom: z2, duration: ms })) return;
    }

    // 3) region 기반(델타 유지)
    const region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: deltaRef.current.latitudeDelta,
      longitudeDelta: deltaRef.current.longitudeDelta
    };
    if (typeof map.animateRegionTo === "function") {
      if (tryCall(map.animateRegionTo, { ...region, duration: ms })) return;
      if (tryCall(map.animateRegionTo, region, ms)) return;
    }

    // 4) 최후 폴백: two-coords로 센터 맞추기(대칭 패딩 0)
    if (typeof map.animateCameraWithTwoCoords === "function") {
      const latHalf = Math.max(0.00001, deltaRef.current.latitudeDelta / 2);
      const lngHalf = Math.max(0.00001, deltaRef.current.longitudeDelta / 2);

      const payloadNew = {
        coord1: { latitude: lat - latHalf, longitude: lng - lngHalf },
        coord2: { latitude: lat + latHalf, longitude: lng + lngHalf },
        duration: ms,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0
      };

      if (tryCall(map.animateCameraWithTwoCoords, payloadNew)) return;

      const payloadOld = {
        coord1: payloadNew.coord1,
        coord2: payloadNew.coord2,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        duration: ms
      };

      tryCall(map.animateCameraWithTwoCoords, payloadOld);
    }
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    if (!followMyLocationRef.current) return;
    if (!forceSnapRef.current) return;

    const snapQuick = (lat: number, lng: number, acc?: number) => {
      lastUserCoordRef.current = { lat, lng, acc };
      setMyLocOverlayStable(lat, lng, acc);
      lastFollowCoordRef.current = { lat, lng };
      lastFollowAnimAtRef.current = Date.now();
      forceSnapRef.current = false;
      animateToUser(lat, lng, 1);
      onCenterChangeRef.current?.({ lat, lng });
    };

    const last = lastUserCoordRef.current;
    if (last && isValidLatLng(last.lat, last.lng)) {
      snapQuick(last.lat, last.lng, last.acc);
    }

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        if (!lastUserCoordRef.current || !isValidLatLng(lastUserCoordRef.current.lat, lastUserCoordRef.current.lng)) {
          const cached = await Location.getLastKnownPositionAsync();
          const lat0 = Number(cached?.coords?.latitude);
          const lng0 = Number(cached?.coords?.longitude);
          const acc0 = Number(cached?.coords?.accuracy);

          if (isValidLatLng(lat0, lng0) && (!Number.isFinite(acc0) || acc0 <= 2000)) {
            snapQuick(lat0, lng0, acc0);
          }
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const lat = Number(loc.coords.latitude);
        const lng = Number(loc.coords.longitude);
        const acc = Number(loc.coords.accuracy);

        if (!isValidLatLng(lat, lng)) return;
        if (Number.isFinite(acc) && acc > 2000) return;

        lastUserCoordRef.current = { lat, lng, acc };
        setMyLocOverlayStable(lat, lng, acc);
        lastFollowCoordRef.current = { lat, lng };
        lastFollowAnimAtRef.current = Date.now();
        forceSnapRef.current = false;

        animateToUser(lat, lng, 450);
        onCenterChangeRef.current?.({ lat, lng });
      } catch {
        // ignore
      }
    })();
  }, [mapReady, appPulse, animateToUser]);

  const applyDeltaToCenterOnce = useCallback(() => {
    if (!mapReady) return;
    if (!loadedDeltaRef.current) return;
    if (appliedDeltaRef.current) return;

    appliedDeltaRef.current = true;

    try {
      mapRef.current?.animateRegionTo?.(
        {
          latitude:
            followMyLocationRef.current && lastUserCoordRef.current && isValidLatLng(lastUserCoordRef.current.lat, lastUserCoordRef.current.lng)
              ? lastUserCoordRef.current.lat
              : center.lat,
          longitude:
            followMyLocationRef.current && lastUserCoordRef.current && isValidLatLng(lastUserCoordRef.current.lat, lastUserCoordRef.current.lng)
              ? lastUserCoordRef.current.lng
              : center.lng,
          latitudeDelta: deltaRef.current.latitudeDelta,
          longitudeDelta: deltaRef.current.longitudeDelta
        },
        1
      );
    } catch {
      // ignore
    }
    setFollowMyLocation(true);
  }, [mapReady, center.lat, center.lng]);

  useEffect(() => {
    applyDeltaToCenterOnce();
  }, [applyDeltaToCenterOnce]);

  useEffect(() => {
    if (!mapReady) return;

    if (!followMyLocation) {
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }
      return;
    }

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        locationWatcherRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 5 },
          (loc) => {
            const lat = Number(loc.coords.latitude);
            const lng = Number(loc.coords.longitude);
            const acc = Number(loc.coords.accuracy);

            if (!isValidLatLng(lat, lng)) return;
            if (Number.isFinite(acc) && acc > 2000) return;

            lastUserCoordRef.current = { lat, lng, acc };
            setMyLocOverlayStable(lat, lng, acc);

            const now = Date.now();

            if (forceSnapRef.current) {
              forceSnapRef.current = false;
              resumeFollowOnceRef.current = false;
              lastFollowAnimAtRef.current = now;
              lastFollowCoordRef.current = { lat, lng };
              animateToUser(lat, lng, 1);
              onCenterChangeRef.current?.({ lat, lng });
              return;
            }

            if (resumeFollowOnceRef.current) {
              resumeFollowOnceRef.current = false;
              lastFollowAnimAtRef.current = now;
              lastFollowCoordRef.current = { lat, lng };
              animateToUser(lat, lng, 450);
              onCenterChangeRef.current?.({ lat, lng });
              return;
            }

            if (now - lastFollowAnimAtRef.current < 650) return;

            const prev = lastFollowCoordRef.current;
            if (prev) {
              const dLat = Math.abs(prev.lat - lat);
              const dLng = Math.abs(prev.lng - lng);
              if (dLat < 0.00002 && dLng < 0.00002) return;
            }

            lastFollowAnimAtRef.current = now;
            lastFollowCoordRef.current = { lat, lng };
            animateToUser(lat, lng, 450);
            onCenterChangeRef.current?.({ lat, lng });
          }
        );
      } catch {
        // ignore
      }
    })();

    return () => {
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }
    };
  }, [followMyLocation, mapReady, animateToUser]);

  const doFit = useCallback(() => {
    const enabled = typeof autoFit === "boolean" ? autoFit : true;
    if (!enabled) return;
    if (!mapReady) return;
    if (userInteractedRef.current) return;
    if (followMyLocationRef.current) return;

    const targets: LatLng[] = [];
    if (routeCoords.length >= 2) targets.push(...routeCoords);
    if (fitPins.length > 0) {
      for (const p of fitPins) targets.push({ latitude: p.lat, longitude: p.lng });
    }

    if (targets.length === 0) {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") return;
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const lat = Number(loc.coords.latitude);
          const lng = Number(loc.coords.longitude);
          if (isValidLatLng(lat, lng)) {
            animateToUser(lat, lng, 450);
            onCenterChangeRef.current?.({ lat, lng });
          }
        } catch {
          // ignore
        }
      })();
      return;
    }

    const pad = { top: 70, right: 50, bottom: 220, left: 50 };

    if (targets.length === 1) {
      const only = targets[0];
      try {
        mapRef.current?.animateRegionTo?.(
          {
            latitude: only.latitude,
            longitude: only.longitude,
            latitudeDelta: deltaRef.current.latitudeDelta,
            longitudeDelta: deltaRef.current.longitudeDelta
          },
          450
        );
      } catch {
        // ignore
      }
      return;
    }

    const lats = targets.map((t) => t.latitude);
    const lngs = targets.map((t) => t.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    try {
      mapRef.current?.animateCameraWithTwoCoords?.({
        coord1: { latitude: minLat, longitude: minLng },
        coord2: { latitude: maxLat, longitude: maxLng },
        padding: pad,
        duration: 450
      });
    } catch {
      // ignore
    }
  }, [autoFit, fitPins, mapReady, routeCoords, animateToUser]);

  const updateBubblePosition = useCallback(
    async (pin: MemoPin) => {
      if (!mapReady) return;
      const map = mapRef.current;
      if (typeof map?.coordinateToScreen !== "function") return;

      const getPt = async () => {
        const pt0 = await map.coordinateToScreen({ latitude: pin.lat, longitude: pin.lng });
        const x0 = Number((pt0 as any)?.x ?? (pt0 as any)?.screenX);
        const y0 = Number((pt0 as any)?.y ?? (pt0 as any)?.screenY);

        if (!Number.isFinite(x0) || !Number.isFinite(y0)) return null;
        if (x0 <= 0 && y0 <= 0) return null;

        return { x: x0, y: y0 };
      };

      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        let pt = await getPt();
        if (!pt) {
          await new Promise<void>((resolve) => setTimeout(() => resolve(), 60));
          pt = await getPt();
        }
        if (!pt) throw new Error("bad_point");

        const { width, height } = Dimensions.get("window");

        const clampedX = clamp(pt.x, BUBBLE_W / 2 + EDGE, width - BUBBLE_W / 2 - EDGE);
        const clampedY = clamp(pt.y, EDGE, height - EDGE);

        const canPlaceAbove = clampedY > BUBBLE_MAX_H + 56;
        const canPlaceBelow = height - clampedY > BUBBLE_MAX_H + 56;
        const placement: "above" | "below" = canPlaceAbove ? "above" : canPlaceBelow ? "below" : "above";

        setBubblePos({ x: clampedX, y: clampedY, placement });
      } catch {
        const { width, height } = Dimensions.get("window");
        const clampedX = width / 2;
        const ptY = height / 2;

        const canPlaceAbove = ptY > BUBBLE_MAX_H + 56;
        const canPlaceBelow = height - ptY > BUBBLE_MAX_H + 56;
        const placement: "above" | "below" = canPlaceAbove ? "above" : canPlaceBelow ? "below" : "above";

        setBubblePos({ x: clampedX, y: ptY, placement });
      }
    },
    [mapReady]
  );

  useEffect(() => {
    if (!mapReady) return;
    if (userInteractedRef.current) return;
    if (followMyLocationRef.current) return;

    const enabled = typeof autoFit === "boolean" ? autoFit : true;
    const hasTargets = routeCoords.length >= 2 || fitPins.length > 0;

    if (enabled && hasTargets) {
      requestAnimationFrame(() => doFit());
      return;
    }

    try {
      mapRef.current?.animateRegionTo?.(
        {
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: deltaRef.current.latitudeDelta,
          longitudeDelta: deltaRef.current.longitudeDelta
        },
        350
      );
    } catch {
      // ignore
    }
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
    setDeleteConfirmVisible(false);
    setEditVisible(false);
    setEditText("");
  }, []);

  const handlePressPin = useCallback(
    (pin: MemoPin) => {
      setSelectedPin(pin);
      setDeleteConfirmVisible(false);
      setEditVisible(false);
      setEditText((pin?.text ?? "").toString());
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

  const handlePressMyLocation = useCallback(async () => {
    userInteractedRef.current = false;
    setFollowMyLocation(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = Number(loc.coords.latitude);
      const lng = Number(loc.coords.longitude);
      const acc = Number(loc.coords.accuracy);

      if (isValidLatLng(lat, lng) && (!Number.isFinite(acc) || acc <= 2000)) {
        lastUserCoordRef.current = { lat, lng, acc };
        lastFollowCoordRef.current = { lat, lng };
        lastFollowAnimAtRef.current = Date.now();
        animateToUser(lat, lng, 450);
        onCenterChangeRef.current?.({ lat, lng });
        return;
      }
    } catch {
      // ignore
    }

    const last = lastUserCoordRef.current;
    if (last && isValidLatLng(last.lat, last.lng)) {
      lastFollowCoordRef.current = { lat: last.lat, lng: last.lng };
      lastFollowAnimAtRef.current = Date.now();
      animateToUser(last.lat, last.lng, 450);
      onCenterChangeRef.current?.({ lat: last.lat, lng: last.lng });
    }
  }, [animateToUser]);

  const onInitializedStable = useCallback(async () => {
    setMapReady(true);
    autoCenterDoneRef.current = false;
    forceSnapRef.current = true;
    resumeFollowOnceRef.current = true;
    setAppPulse((v) => v + 1);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = Number(loc.coords.latitude);
      const lng = Number(loc.coords.longitude);
      const acc = Number(loc.coords.accuracy);

      if (isValidLatLng(lat, lng) && (!Number.isFinite(acc) || acc <= 2000)) {
        lastUserCoordRef.current = { lat, lng, acc };

        if (!followMyLocationRef.current && !userInteractedRef.current && !autoCenterDoneRef.current) {
          autoCenterDoneRef.current = true;
          try {
            mapRef.current?.animateCamera?.({
              center: { latitude: lat, longitude: lng },
              zoom: 16,
              duration: 450
            });
            onCenterChangeRef.current?.({ lat, lng });
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const onTapMapStable = useCallback(() => closeBubble(), [closeBubble]);

  const onCameraChangedStable = useCallback((e: any) => {
    lastCameraReasonRef.current = (e?.reason as any) ?? null;

    const z = Number(e?.zoom);
    const b = Number(e?.bearing);
    const t = Number(e?.tilt);

    if (Number.isFinite(z) && z > 0) lastZoomRef.current = z;
    if (Number.isFinite(b)) lastBearingRef.current = b;
    if (Number.isFinite(t)) lastTiltRef.current = t;

    if (e?.reason === "Gesture") {
      userInteractedRef.current = true;
      if (followMyLocationRef.current) setFollowMyLocation(false);
    }
  }, []);

  const onCameraIdleStable = useCallback(
    (camera: any) => {
      const latD0 = Number(camera?.latitudeDelta);
      const lngD0 = Number(camera?.longitudeDelta);

      if (!Number.isFinite(latD0) || !Number.isFinite(lngD0) || latD0 <= 0 || lngD0 <= 0) {
        const sp = selectedPinRef.current;
        if (sp) updateBubblePosition(sp);
        return;
      }

      const latD = clamp(latD0, 0.0005, 5);
      const lngD = clamp(lngD0, 0.0005, 5);

      const prev = deltaRef.current;
      const changed =
        Math.abs(prev.latitudeDelta - latD) > 1e-12 || Math.abs(prev.longitudeDelta - lngD) > 1e-12;

      if (changed) {
        deltaRef.current = { latitudeDelta: latD, longitudeDelta: lngD };
      }

      const wasGesture = lastCameraReasonRef.current === "Gesture";
      if (wasGesture) userInteractedRef.current = true;

      if (wasGesture && followMyLocationRef.current) {
        setFollowMyLocation(false);
      }

      if (wasGesture) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          AsyncStorage.setItem(KEY_MAP_DELTA, JSON.stringify(deltaRef.current)).catch(() => {});
        }, 250);
      }

      const sp = selectedPinRef.current;
      if (sp) updateBubblePosition(sp);
    },
    [updateBubblePosition]
  );

  if (!bootRegion) {
    return (
      <View style={[styles.root, style]}>
        <View style={styles.loadingRoot}>
          <ActivityIndicator size="large" color="#FFFFFF" style={styles.loadingSpinner} />
        </View>
      </View>
    );
  }


  return (
    <View style={[styles.root, style]}>
      <NaverMapLayer
        ref={mapRef}
        initialRegion={bootRegion}
        routeSegments={routeSegmentsWithMyLoc}
        pins={pins}
        shouldShowCenterMarker={shouldShowCenterMarker}
        center={center}
        isNightModeEnabled={isNightModeEnabled}
        myLocation={myLocOverlay}
        onInitialized={onInitializedStable}
        onTapMap={onTapMapStable}
        onCameraChanged={onCameraChangedStable}
        onCameraIdle={onCameraIdleStable}
        onTapPin={handlePressPin}
      />

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <TouchableOpacity activeOpacity={0.88} onPress={handlePressMyLocation} style={styles.myLocBtn}>
          <Ionicons name="locate" size={18} color="rgba(29,44,59,0.88)" />
        </TouchableOpacity>
      </View>

      {!!selectedPin && !!bubblePos && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View pointerEvents="box-none" style={[styles.bubbleAnchor, { left: bubblePos.x, top: bubblePos.y }]}>
            <View
              pointerEvents="box-none"
              style={[styles.bubbleWrap, bubblePos.placement === "above" ? styles.bubbleAbove : styles.bubbleBelow]}
            >
              {bubblePos.placement === "below" && <View style={[styles.arrowUp]} />}

              {editVisible ? (
                <View style={[styles.bubbleBox, { maxHeight: bubbleScrollMax }]}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setEditVisible(false);
                      setDeleteConfirmVisible((v) => !v);
                    }}
                    style={styles.bubbleTrashBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="rgba(29,44,59,0.75)" />
                  </TouchableOpacity>

                  {!!bubbleTime && <Text style={styles.bubbleTime}>{bubbleTime}</Text>}

                  <TextInput
                    autoFocus
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    placeholder="(텍스트 없음)"
                    placeholderTextColor="rgba(29,44,59,0.40)"
                    style={[styles.bubbleEditInput, { maxHeight: bubbleScrollMax - 84 }]}
                  />

                  <View style={styles.bubbleConfirmRow}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        setEditVisible(false);
                        setEditText((selectedPin?.text ?? "").toString());
                      }}
                      style={[styles.bubbleConfirmBtn, styles.bubbleConfirmBtnCancel]}
                    >
                      <Text style={[styles.bubbleConfirmText, styles.bubbleConfirmTextCancel]}>취소</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={async () => {
                        const next = (editText ?? "").toString();
                        try {
                          if (selectedPin && onUpdateMemoPin) await onUpdateMemoPin(selectedPin, next);
                          setSelectedPin((p) => (p ? { ...p, text: next } : p));
                          setEditVisible(false);
                        } catch {
                          // ignore
                        }
                      }}
                      style={[styles.bubbleConfirmBtn, styles.bubbleConfirmBtnOk]}
                    >
                      <Text style={[styles.bubbleConfirmText, styles.bubbleConfirmTextOk]}>저장</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => {
                    setDeleteConfirmVisible(false);
                    setEditVisible(true);
                    setEditText((selectedPin?.text ?? "").toString());
                  }}
                  style={[styles.bubbleBox, { maxHeight: bubbleScrollMax }]}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setEditVisible(false);
                      setDeleteConfirmVisible((v) => !v);
                    }}
                    style={styles.bubbleTrashBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="rgba(29,44,59,0.75)" />
                  </TouchableOpacity>

                  {!!bubbleTime && <Text style={styles.bubbleTime}>{bubbleTime}</Text>}

                  <ScrollView style={styles.bubbleScroll} contentContainerStyle={styles.bubbleScrollContent} showsVerticalScrollIndicator>
                    <Text style={styles.bubbleText}>{bubbleText.trim() || "(텍스트 없음)"}</Text>
                  </ScrollView>

                  {deleteConfirmVisible && (
                    <View style={styles.bubbleConfirmRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setDeleteConfirmVisible(false)}
                        style={[styles.bubbleConfirmBtn, styles.bubbleConfirmBtnCancel]}
                      >
                        <Text style={[styles.bubbleConfirmText, styles.bubbleConfirmTextCancel]}>취소</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={async () => {
                          try {
                            if (selectedPin && onDeleteMemoPin) await onDeleteMemoPin(selectedPin);
                          } finally {
                            closeBubble();
                          }
                        }}
                        style={[styles.bubbleConfirmBtn, styles.bubbleConfirmBtnOk]}
                      >
                        <Text style={[styles.bubbleConfirmText, styles.bubbleConfirmTextOk]}>확인</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              )}

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

  loadingRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999999,
    elevation: 999999
  },
  loadingSpinner: {
    transform: [{ scale: 1.15 }]
  },

  myLocBtn: {
    position: "absolute",
    right: 14,
    top: 14,
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(29,44,59,0.12)",
    zIndex: 9999,
    elevation: 9999
  },

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

  bubbleEditBtn: {
    position: "absolute",
    right: 44,
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  bubbleTrashBtn: {
    position: "absolute",
    right: 10,
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  bubbleEditInput: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(29,44,59,0.90)",
    lineHeight: 17,
    padding: 0
  },
  bubbleConfirmRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8
  },
  bubbleConfirmBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1
  },
  bubbleConfirmBtnCancel: {
    backgroundColor: "rgba(29,44,59,0.05)",
    borderColor: "rgba(29,44,59,0.18)"
  },
  bubbleConfirmBtnOk: {
    backgroundColor: "rgba(29,44,59,0.92)",
    borderColor: "rgba(29,44,59,0.92)"
  },
  bubbleConfirmText: {
    fontSize: 11,
    fontWeight: "900"
  },
  bubbleConfirmTextCancel: {
    color: "rgba(29,44,59,0.80)"
  },
  bubbleConfirmTextOk: {
    color: "#FFFFFF"
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
