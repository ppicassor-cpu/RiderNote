// FILE: C:\RiderNote\src\theme\ThemeProvider.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, useColorScheme } from "react-native";
import * as NavigationBar from "expo-navigation-bar";

export type ThemeMode = "light" | "dark";
export type ThemePref = "system" | ThemeMode;

export type Theme = {
  mode: ThemeMode;

  rootBg: string;
  headerBg: string;
  surfaceBg: string;

  border: string;

  text: string;
  textSub: string;
  textSub2: string;
  textMuted: string;

  mapBg: string;

  accentBg: string;
  accentBorder: string;
  accentText: string;

  startBg: string;
  startBorder: string;

  stopBg: string;
  stopBorder: string;

  primaryTextOnColor: string;

  dimBg: string;

  gateBoxBg: string;
  gateBoxBorder: string;
  gateTitle: string;
  gateDesc: string;
  gateLabel: string;
  gateHint: string;

  popupBoxBg: string;
  popupBoxBorder: string;
  popupTitle: string;
  popupMsg: string;

  popupPrimaryBg: string;
  popupPrimaryBorder: string;

  popupSecondaryBg: string;
  popupSecondaryBorder: string;

  popupPrimaryText: string;
  popupSecondaryText: string;

  ok: string;
  bad: string;

  statusBarBg: string;
  icon: string;
};

export const THEME_MODE_KEY = "RIDERNOTE_THEME_MODE";
const LEGACY_THEME_PREF_KEY = "ridernote_theme_pref_v1";

const LIGHT_THEME: Theme = {
  mode: "light",

  rootBg: "#F7FAFF",
  headerBg: "#FFFFFF",
  surfaceBg: "#FFFFFF",

  border: "rgba(29,44,59,0.10)",

  text: "#1D2C3B",
  textSub: "rgba(29,44,59,0.70)",
  textSub2: "rgba(29,44,59,0.52)",
  textMuted: "rgba(29,44,59,0.55)",

  mapBg: "#EAF4FF",

  accentBg: "#D9FFF2",
  accentBorder: "rgba(47, 183, 163, 0.45)",
  accentText: "#13443D",

  startBg: "#BDEBFF",
  startBorder: "rgba(120, 190, 255, 0.55)",

  stopBg: "#FFD6E7",
  stopBorder: "rgba(255, 0, 111, 0.81)",

  primaryTextOnColor: "#18324A",

  dimBg: "rgba(29,44,59,0.28)",

  gateBoxBg: "#FFF7FB",
  gateBoxBorder: "rgba(255, 182, 213, 0.85)",
  gateTitle: "#3B2A3F",
  gateDesc: "rgba(59,42,63,0.75)",
  gateLabel: "rgba(59,42,63,0.85)",
  gateHint: "rgba(59,42,63,0.65)",

  popupBoxBg: "#F3FBFF",
  popupBoxBorder: "rgba(170, 219, 255, 0.9)",
  popupTitle: "#1D2C3B",
  popupMsg: "rgba(29,44,59,0.78)",

  popupPrimaryBg: "#FFD6E7",
  popupPrimaryBorder: "rgba(255, 140, 190, 0.55)",

  popupSecondaryBg: "#D9FFF2",
  popupSecondaryBorder: "rgba(47, 183, 163, 0.45)",

  popupPrimaryText: "#3B2A3F",
  popupSecondaryText: "#13443D",

  ok: "#2FB7A3",
  bad: "#FF5D7A",

  statusBarBg: "#FFFFFF",
  icon: "#13443D"
};

const DARK_THEME: Theme = {
  mode: "dark",

  rootBg: "#0B0F14",
  headerBg: "#0F151C",
  surfaceBg: "#101821",

  border: "rgba(255,255,255,0.10)",

  text: "rgba(255,255,255,0.92)",
  textSub: "rgba(255,255,255,0.70)",
  textSub2: "rgba(255,255,255,0.55)",
  textMuted: "rgba(255,255,255,0.50)",

  mapBg: "#0B151D",

  accentBg: "rgba(47, 183, 163, 0.16)",
  accentBorder: "rgba(47, 183, 163, 0.38)",
  accentText: "rgba(210,255,247,0.92)",

  startBg: "rgba(189, 235, 255, 0.18)",
  startBorder: "rgba(120, 190, 255, 0.38)",

  stopBg: "rgba(255, 214, 231, 0.16)",
  stopBorder: "rgba(250, 24, 122, 0.6)",

  primaryTextOnColor: "rgba(255,255,255,0.90)",

  dimBg: "rgba(0,0,0,0.58)",

  gateBoxBg: "#0F151C",
  gateBoxBorder: "rgba(255,255,255,0.14)",
  gateTitle: "rgba(255,255,255,0.92)",
  gateDesc: "rgba(255,255,255,0.70)",
  gateLabel: "rgba(255,255,255,0.82)",
  gateHint: "rgba(255,255,255,0.60)",

  popupBoxBg: "#0F151C",
  popupBoxBorder: "rgba(255,255,255,0.14)",
  popupTitle: "rgba(255,255,255,0.92)",
  popupMsg: "rgba(255,255,255,0.72)",

  popupPrimaryBg: "rgba(255, 214, 231, 0.16)",
  popupPrimaryBorder: "rgba(255, 140, 190, 0.35)",

  popupSecondaryBg: "rgba(47, 183, 163, 0.14)",
  popupSecondaryBorder: "rgba(47, 183, 163, 0.34)",

  popupPrimaryText: "rgba(255,255,255,0.90)",
  popupSecondaryText: "rgba(210,255,247,0.92)",

  ok: "#2FB7A3",
  bad: "#FF5D7A",

  statusBarBg: "#0F151C",
  icon: "rgba(210,255,247,0.92)"
};

function resolveTheme(pref: ThemePref, system: ThemeMode): Theme {
  const effective: ThemeMode = pref === "system" ? system : pref;
  return effective === "dark" ? DARK_THEME : LIGHT_THEME;
}

function normalizeThemePref(raw: any): ThemePref | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "system" || s === "light" || s === "dark") return s as ThemePref;
  return null;
}

type ThemeContextValue = {
  themePref: ThemePref;
  theme: Theme;
  systemMode: ThemeMode;
  hydrated: boolean;
  setThemePref: (pref: ThemePref) => Promise<void>;
  reloadThemePref: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const systemMode: ThemeMode = scheme === "dark" ? "dark" : "light";

  const [themePref, setThemePrefState] = useState<ThemePref>("system");
  const [hydrated, setHydrated] = useState<boolean>(false);

  const reloadThemePref = useCallback(async () => {
    try {
      const pairs = await AsyncStorage.multiGet([THEME_MODE_KEY, LEGACY_THEME_PREF_KEY]);
      const current = normalizeThemePref(pairs?.[0]?.[1]);
      if (current) {
        setThemePrefState(current);
        return;
      }

      const legacy = normalizeThemePref(pairs?.[1]?.[1]);
      if (legacy) {
        try {
          await AsyncStorage.setItem(THEME_MODE_KEY, legacy);
        } catch {}
        setThemePrefState(legacy);
        return;
      }
    } catch {}

    setThemePrefState("system");
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await reloadThemePref();
      if (mounted) setHydrated(true);
    })();
    return () => {
      mounted = false;
    };
  }, [reloadThemePref]);

  const setThemePref = useCallback(async (pref: ThemePref) => {
    setThemePrefState(pref);
    try {
      await AsyncStorage.setItem(THEME_MODE_KEY, pref);
    } catch {}
  }, []);

  const theme = useMemo(() => resolveTheme(themePref, systemMode), [themePref, systemMode]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const bg = theme.mode === "dark" ? "#000000" : "#ffffff";
    const btn = theme.mode === "dark" ? "light" : "dark";
    (async () => {
      try {
        await NavigationBar.setBackgroundColorAsync(bg);
        await NavigationBar.setButtonStyleAsync(btn as any);
      } catch {}
    })();
  }, [theme.mode]);

  const value = useMemo<ThemeContextValue>(() => {
    return { themePref, theme, systemMode, hydrated, setThemePref, reloadThemePref };
  }, [themePref, theme, systemMode, hydrated, setThemePref, reloadThemePref]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within <ThemeProvider>");
  return ctx;
}
