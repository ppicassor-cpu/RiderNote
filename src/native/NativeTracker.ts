import { DeviceEventEmitter, EmitterSubscription, NativeEventEmitter, NativeModules } from "react-native";

export type StartResult = {
  sessionId: string;
  startTime: number;
};

export type StopResult = {
  sessionId: string;
  endTime: number;
  totalKm?: number;
  totalMinutes?: number;
  totalMeters?: number;
  distanceMeters?: number;
  totalSeconds?: number;
  durationMs?: number;
};

export type LastLoc = {
  lat: number;
  lng: number;
  t: number;
  acc?: number;
};

export type RoutePoint = {
  lat: number;
  lng: number;
  t?: number;
  acc?: number;
};

export type CaptureNoteResult = {
  saved?: boolean;
  noteId?: string;
  sessionId?: string;
  text?: string;
  lat?: number;
  lng?: number;
  acc?: number;
  t?: number;
  error?: string;
  reason?: string;
};

export type NoteSavedEvent = {
  noteId?: string;
  sessionId?: string;
  text?: string;
  lat?: number;
  lng?: number;
  acc?: number;
  t?: number;
  source?: "overlay" | "app";
};

export type MemoItem = {
  sessionId?: string;
  text?: string;
  savedAt?: number;
  lat?: number;
  lng?: number;
  acc?: number;
  locT?: number;
  override?: boolean;
};

export type ManualLocationState = {
  enabled: boolean;
  lat: number;
  lng: number;
  acc: number;
};

const MODULE_CANDIDATES = ["Tracker", "TrackerModule", "NativeTracker", "RiderTracker", "RiderNoteTracker"] as const;

type AnyNative = Record<string, any>;

function resolveNativeModule(): AnyNative | null {
  for (const name of MODULE_CANDIDATES) {
    const m = (NativeModules as AnyNative)?.[name];
    if (m) return m as AnyNative;
  }
  return null;
}

function listNativeModuleKeys(): string[] {
  try {
    return Object.keys(NativeModules || {}).sort();
  } catch {
    return [];
  }
}

function assertModule(mod: AnyNative | null): asserts mod is AnyNative {
  if (!mod) {
    const keys = listNativeModuleKeys();
    throw new Error(
      `Native Tracker 모듈을 찾을 수 없습니다. (prebuild 후 재빌드 필요)\n` +
        `시도한 이름: ${MODULE_CANDIDATES.join(", ")}\n` +
        `현재 NativeModules 키 일부: ${keys.slice(0, 30).join(", ")}`
    );
  }
}

function resolveFnName(mod: AnyNative, candidates: string[], usageLabel: string): string {
  for (const name of candidates) {
    if (typeof mod[name] === "function") return name;
  }
  const fnKeys = Object.keys(mod).sort();
  throw new Error(
    `Native Tracker.${usageLabel} 함수가 없습니다. (prebuild 후 재빌드 필요)\n` +
      `시도한 함수명: ${candidates.join(", ")}\n` +
      `모듈 함수/프로퍼티 목록: ${fnKeys.join(", ")}`
  );
}

async function callNative<T>(candidates: string[], usageLabel: string, ...args: any[]): Promise<T> {
  const M = resolveNativeModule();
  assertModule(M);
  const fnName = resolveFnName(M, candidates, usageLabel);
  const out = M[fnName](...args);
  return (await Promise.resolve(out)) as T;
}

function getEmitter(): {
  addListener: (eventName: string, handler: (...args: any[]) => void) => EmitterSubscription;
} {
  const M = resolveNativeModule();
  if (M) {
    try {
      const emitter = new NativeEventEmitter();
      return { addListener: (eventName, handler) => emitter.addListener(eventName, handler) };
    } catch {}
  }
  return { addListener: (eventName, handler) => DeviceEventEmitter.addListener(eventName, handler) };
}

const Tracker = {
  getNativeModuleName(): string | null {
    for (const name of MODULE_CANDIDATES) {
      if ((NativeModules as AnyNative)?.[name]) return name;
    }
    return null;
  },

  getNativeModuleKeys(): string[] {
    const M = resolveNativeModule();
    if (!M) return [];
    try {
      return Object.keys(M).sort();
    } catch {
      return [];
    }
  },

  async canDrawOverlays(): Promise<boolean> {
    return await callNative<boolean>(["canDrawOverlays"], "canDrawOverlays");
  },

  async openOverlaySettings(): Promise<void> {
    await callNative<void>(["openOverlaySettings"], "openOverlaySettings");
  },

  async startSession(): Promise<StartResult> {
    return await callNative<StartResult>(["startSession"], "startSession");
  },

  async stopSession(): Promise<StopResult> {
    return await callNative<StopResult>(["stopSession"], "stopSession");
  },

  async getLastLocation(): Promise<LastLoc> {
    return await callNative<LastLoc>(["getLastLocation", "getLastLoc"], "getLastLocation");
  },

  async getRoute(): Promise<RoutePoint[]> {
    return await callNative<RoutePoint[]>(
      ["getRoute", "getRoutePoints", "getTrackPoints", "getRoutePoints"],
      "getRoute"
    );
  },

  async clearRoute(): Promise<void> {
    await callNative<void>(["clearRoute"], "clearRoute");
  },

  async getMemos(): Promise<MemoItem[]> {
    return await callNative<MemoItem[]>(["getMemos"], "getMemos");
  },

  async clearMemos(): Promise<void> {
    await callNative<void>(["clearMemos"], "clearMemos");
  },

  async setManualLocation(lat: number, lng: number, acc: number = 0): Promise<void> {
    await callNative<void>(["setManualLocation"], "setManualLocation", lat, lng, acc);
  },

  async clearManualLocation(): Promise<void> {
    await callNative<void>(["clearManualLocation"], "clearManualLocation");
  },

  async getManualLocation(): Promise<ManualLocationState> {
    return await callNative<ManualLocationState>(["getManualLocation"], "getManualLocation");
  },

  async isOverlayRunning(): Promise<boolean> {
    return await callNative<boolean>(
      ["isOverlayRunning", "isOverlayServiceRunning", "isServiceRunning"],
      "isOverlayRunning"
    );
  },

  async startOverlay(): Promise<void> {
    await callNative<void>(["startOverlay", "startOverlayService", "startService"], "startOverlay");
  },

  async stopOverlay(): Promise<void> {
    await callNative<void>(["stopOverlay", "stopOverlayService", "stopService"], "stopOverlay");
  },

  async captureNoteFromClipboard(): Promise<CaptureNoteResult> {
    return await callNative<CaptureNoteResult>(
      ["captureNoteFromClipboard", "saveNoteFromClipboard", "captureClipboardNote"],
      "captureNoteFromClipboard"
    );
  },

  onNoteSaved(handler: (ev: NoteSavedEvent) => void): { remove: () => void } {
    const emitter = getEmitter();
    const sub = emitter.addListener("RiderNoteNoteSaved", handler);
    return { remove: () => sub.remove() };
  }
};

export default Tracker;
