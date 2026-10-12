import { createContext, useContext, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import { resolveTheme, type ThemeDefinition } from "./themes.js";

/**
 * Design language: Telegram's information density and chat chrome, Apple's grouped surfaces,
 * continuous large radii and hairline separators, and Fluent's hover/selection behaviour on desktop.
 * Deliberately NOT Material: no elevation shadows, no ripple, no FABs, no uppercase buttons.
 * Colours come from the active theme (see themes.ts).
 */
export type Theme = ThemeDefinition;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
/** Soft drop shadow that lifts popovers (menus) off the page; deeper on dark themes. */
export const popoverShadow = (dark: boolean) =>
  ({ boxShadow: dark ? "0 6px 22px rgba(0,0,0,0.55)" : "0 4px 18px rgba(0,0,0,0.16), 0 0 1px rgba(0,0,0,0.12)" }) as object;

export const radius = { control: 10, bubble: 18, bubbleTight: 5, pill: 999 } as const;

/** System UI fonts: SF on Apple, Segoe UI (Variable) on Windows, platform default elsewhere. */
export const fontFamily = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, "Helvetica Neue", sans-serif',
  default: undefined,
});

const Ctx = createContext<Theme | null>(null);

/** `themeId` is a registered theme id or "system" (follow the OS). */
export function ThemeProvider(props: { themeId?: string; children: ReactNode }) {
  const system = useColorScheme();
  return <Ctx.Provider value={resolveTheme(props.themeId ?? "system", system)}>{props.children}</Ctx.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(Ctx);
  if (!t) throw new Error("useTheme outside ThemeProvider");
  return t;
}

/** Telegram-style deterministic per-user accent colours (names, avatars). */
const PEER_COLORS = ["#E17076", "#E5A346", "#A695E7", "#7BC862", "#6EC9CB", "#65AADD", "#EE7AAE"];
export function peerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length]!;
}
