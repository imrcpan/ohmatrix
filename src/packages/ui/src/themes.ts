/**
 * Theme system. A theme is plain data (`ThemeDefinition`); the UI only ever reads tokens from
 * `useTheme()`. To add a theme, call `defineTheme({...})` with a few seed colours and pass the
 * result to `registerTheme()` — nothing else in the codebase needs to change, and the Settings
 * picker lists whatever is registered.
 */

export interface ColorTokens {
  bg: string; // primary surface (lists, headers)
  bgSecondary: string; // grouped / inset surfaces, search field
  chatBg: string; // chat wallpaper
  separator: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  onAccent: string;
  danger: string;
  bubbleIn: string;
  bubbleInText: string;
  bubbleOut: string;
  bubbleOutText: string;
  bubbleOutMeta: string;
  hover: string; // desktop row hover
  selected: string; // desktop selected row
  onSelected: string;
  onSelectedSecondary: string;
  badge: string;
  badgeMuted: string;
  serviceChip: string;
  serviceChipText: string;
  overlay: string;
  /** Background of an @mention pill. */
  mentionBg: string;
  /** Background of a highlighted message that mentions me. */
  mentionHighlight: string;
}

export interface ThemeDefinition {
  id: string;
  /** Display names by locale; falls back to `en`, then to `id`. */
  label: Record<string, string> & { en: string };
  dark: boolean;
  colors: ColorTokens;
}

export interface ThemeSeed {
  id: string;
  label: ThemeDefinition["label"];
  dark: boolean;
  accent: string;
  /** Optional overrides of any derived token. */
  bg?: string;
  bgSecondary?: string;
  chatBg?: string;
  bubbleIn?: string;
  bubbleOut?: string;
  text?: string;
  overrides?: Partial<ColorTokens>;
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function parse(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** Linear mix of two #rrggbb colours; `t`=0 → a, 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [parse(a), parse(b)];
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        clamp(x[i]! + (y[i]! - x[i]!) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Derives a complete token set from a handful of seed colours (Telegram-style chat chrome). */
export function defineTheme(seed: ThemeSeed): ThemeDefinition {
  const dark = seed.dark;
  const bg = seed.bg ?? (dark ? "#1C1C1E" : "#FFFFFF");
  const text = seed.text ?? (dark ? "#FFFFFF" : "#000000");
  const bgSecondary = seed.bgSecondary ?? mix(bg, dark ? "#FFFFFF" : "#000000", dark ? 0.1 : 0.05);
  const chatBg = seed.chatBg ?? (dark ? mix(bg, seed.accent, 0.12) : mix("#E8EDF2", seed.accent, 0.06));
  const bubbleIn = seed.bubbleIn ?? (dark ? mix(chatBg, "#FFFFFF", 0.1) : "#FFFFFF");
  const bubbleOut = seed.bubbleOut ?? (dark ? mix(chatBg, seed.accent, 0.45) : seed.accent);
  const grey = dark ? "#8D8E93" : "#8E8E93";
  const colors: ColorTokens = {
    bg,
    bgSecondary,
    chatBg,
    separator: dark ? "rgba(84,84,88,0.5)" : "rgba(60,60,67,0.16)",
    text,
    textSecondary: grey,
    textTertiary: dark ? "#48484A" : "#C7C7CC",
    accent: seed.accent,
    onAccent: "#FFFFFF",
    danger: dark ? "#FF453A" : "#FF3B30",
    bubbleIn,
    bubbleInText: dark ? "#FFFFFF" : "#000000",
    bubbleOut,
    bubbleOutText: "#FFFFFF",
    bubbleOutMeta: "rgba(255,255,255,0.72)",
    hover: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    selected: dark ? mix(bg, seed.accent, 0.5) : seed.accent,
    onSelected: "#FFFFFF",
    onSelectedSecondary: "rgba(255,255,255,0.78)",
    badge: seed.accent,
    badgeMuted: dark ? "#58585D" : "#C7C7CC",
    serviceChip: dark ? "rgba(20,30,45,0.6)" : "rgba(60,80,100,0.38)",
    serviceChipText: dark ? "#E6EAF0" : "#FFFFFF",
    overlay: dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.3)",
    mentionBg: dark ? "rgba(51,144,236,0.28)" : "rgba(51,144,236,0.16)",
    mentionHighlight: dark ? "rgba(51,144,236,0.16)" : "rgba(51,144,236,0.1)",
    ...seed.overrides,
  };
  return { id: seed.id, label: seed.label, dark, colors };
}

// ---- registry ----------------------------------------------------------------------------

const registry = new Map<string, ThemeDefinition>();
const order: string[] = [];

export function registerTheme(def: ThemeDefinition): void {
  if (!registry.has(def.id)) order.push(def.id);
  registry.set(def.id, def);
}

export function listThemes(): ThemeDefinition[] {
  return order.map((id) => registry.get(id)!);
}

export function getTheme(id: string): ThemeDefinition | undefined {
  return registry.get(id);
}

export const SYSTEM_THEME = "system";

/** `system` follows the OS light/dark setting; unknown ids fall back to light. */
export function resolveTheme(id: string, systemScheme: "light" | "dark" | null | undefined): ThemeDefinition {
  const effective = id === SYSTEM_THEME ? (systemScheme === "dark" ? "dark" : "light") : id;
  return registry.get(effective) ?? registry.get("light")!;
}

export function themeLabel(def: ThemeDefinition, locale: string): string {
  return def.label[locale] ?? def.label.en ?? def.id;
}

// ---- built-in themes ---------------------------------------------------------------------
registerTheme(
  defineTheme({
    id: "light",
    label: { en: "Light", "zh-CN": "浅色" },
    dark: false,
    accent: "#3390EC",
    chatBg: "#E5EBF0",
    bgSecondary: "#F2F2F7",
  }),
);
registerTheme(
  defineTheme({
    id: "dark",
    label: { en: "Dark", "zh-CN": "深色" },
    dark: true,
    accent: "#4DA3F7",
    bg: "#1C1C1E",
    bgSecondary: "#2C2C2E",
    chatBg: "#0E1621",
    bubbleIn: "#212D3B",
    bubbleOut: "#2B5278",
    overrides: { selected: "#2B5278", badge: "#3E88F7" },
  }),
);
registerTheme(
  defineTheme({
    id: "midnight",
    label: { en: "Midnight", "zh-CN": "午夜" },
    dark: true,
    accent: "#5AA9FF",
    bg: "#000000",
    bgSecondary: "#1A1A1C",
    chatBg: "#000000",
    bubbleIn: "#1C1C1E",
    bubbleOut: "#1F4E85",
  }),
);
registerTheme(
  defineTheme({
    id: "ocean",
    label: { en: "Ocean", "zh-CN": "海洋" },
    dark: true,
    accent: "#3CC4C4",
    bg: "#0F1C24",
    bgSecondary: "#17293A",
    chatBg: "#0A141B",
  }),
);
registerTheme(
  defineTheme({
    id: "dark-green",
    label: { en: "Dark Green", "zh-CN": "暗绿" },
    dark: true,
    accent: "#00BC7D",
    bubbleOut: "#078357",
    // The surfaces stay neutral: the theme shows through the accent, the bubble and the badge.
    bg: "#141414",
    bgSecondary: "#1F1F1F",
    chatBg: "#0D0D0D",
    bubbleIn: "#1F1F1F",
    overrides: {
      // A bright accent takes a dark label (contrast 7.6:1; white would be 2.5:1).
      onAccent: "#0B1F17",
      selected: "#0B8A5C",
      badge: "#02B377",
      serviceChip: "rgba(0,0,0,0.6)",
      mentionBg: "rgba(0,188,125,0.26)",
      mentionHighlight: "rgba(0,188,125,0.15)",
    },
  }),
);
registerTheme(
  defineTheme({
    id: "dark-yellow",
    label: { en: "Dark Yellow", "zh-CN": "暗黄" },
    dark: true,
    accent: "#F0B100",
    bubbleOut: "#A97C07",
    bg: "#141414",
    bgSecondary: "#1F1F1F",
    chatBg: "#0D0D0D",
    bubbleIn: "#1F1F1F",
    overrides: {
      onAccent: "#241A00",
      selected: "#B1820B",
      badge: "#E5A902",
      serviceChip: "rgba(0,0,0,0.6)",
      mentionBg: "rgba(240,177,0,0.26)",
      mentionHighlight: "rgba(240,177,0,0.15)",
    },
  }),
);
registerTheme(
  defineTheme({
    id: "dark-pink",
    label: { en: "Dark Pink", "zh-CN": "暗粉" },
    dark: true,
    accent: "#FF8CB0",
    bubbleOut: "#C46B87",
    bg: "#141414",
    bgSecondary: "#1F1F1F",
    chatBg: "#0D0D0D",
    bubbleIn: "#1F1F1F",
    overrides: {
      onAccent: "#2A1119",
      selected: "#B4627B",
      badge: "#F486A8",
      serviceChip: "rgba(0,0,0,0.6)",
      mentionBg: "rgba(255,140,176,0.26)",
      mentionHighlight: "rgba(255,140,176,0.15)",
    },
  }),
);
registerTheme(
  defineTheme({
    id: "dark-violet",
    label: { en: "Dark Violet", "zh-CN": "紫罗兰黑" },
    dark: true,
    accent: "#A695E7",
    bubbleOut: "#7F72B1",
    bg: "#141414",
    bgSecondary: "#1F1F1F",
    chatBg: "#0D0D0D",
    bubbleIn: "#1F1F1F",
    overrides: {
      // A bright accent takes a dark label (contrast 6.9:1; white would be 2.6:1).
      onAccent: "#1B1524",
      selected: "#7A6DAA",
      badge: "#9E8EDD",
      serviceChip: "rgba(0,0,0,0.6)",
      mentionBg: "rgba(166,149,231,0.26)",
      mentionHighlight: "rgba(166,149,231,0.15)",
    },
  }),
);
registerTheme(
  defineTheme({
    id: "forest",
    label: { en: "Forest", "zh-CN": "森林" },
    dark: false,
    accent: "#3E9B5F",
    chatBg: "#DDE9D8",
    bgSecondary: "#F1F5EE",
    bubbleOut: "#DCF8C6",
    overrides: { bubbleOutText: "#16311F", bubbleOutMeta: "rgba(22,49,31,0.55)" },
  }),
);
registerTheme(
  defineTheme({
    id: "sakura",
    label: { en: "Sakura", "zh-CN": "樱花" },
    dark: false,
    accent: "#E5588A",
    chatBg: "#F6E6EC",
    bgSecondary: "#FBF1F4",
  }),
);
registerTheme(
  defineTheme({
    id: "light-violet",
    label: { en: "Light Violet", "zh-CN": "紫罗兰亮色" },
    dark: false,
    // A step deeper than the violet of the dark theme, so the accent stays readable on white (4.8:1).
    accent: "#7C5CD6",
    chatBg: "#EFE9FA",
    bgSecondary: "#F5F1FC",
    bubbleOut: "#7C5CD6",
  }),
);
