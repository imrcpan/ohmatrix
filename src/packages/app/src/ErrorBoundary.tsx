import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, useColorScheme, View } from "react-native";
import { t, detectLocale } from "@ohmatrix/i18n";

/** Fixed light and dark looks, chosen by the system setting; no theme or app state (they may be what failed). */
const LOOKS = {
  light: { bg: "#FFFFFF", text: "#000000", muted: "#8E8E93", accent: "#3390EC" },
  dark: { bg: "#1C1C1E", text: "#FFFFFF", muted: "#8D8E93", accent: "#4DA3F7" },
} as const;

function Fallback(props: { onRetry: () => void; onReload?: (() => void) | undefined }) {
  const c = LOOKS[useColorScheme() === "dark" ? "dark" : "light"];
  const locale = detectLocale((globalThis as { navigator?: { language?: string } }).navigator?.language);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: c.text }}>{t(locale, "error.title")}</Text>
      <Text style={{ fontSize: 15, color: c.muted, textAlign: "center", maxWidth: 340 }}>{t(locale, "error.body")}</Text>
      <View style={{ width: 220, gap: 8, marginTop: 6 }}>
        <Pressable
          accessibilityRole="button"
          onPress={props.onRetry}
          style={{ height: 46, borderRadius: 12, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 17, fontWeight: "600", color: "#FFFFFF" }}>{t(locale, "error.retry")}</Text>
        </Pressable>
        {props.onReload && (
          <Pressable accessibilityRole="button" onPress={props.onReload} style={{ height: 40, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "500", color: c.accent }}>{t(locale, "error.reload")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Last line of defence: if any screen throws while rendering, show a calm message with a way out instead of a
 * blank page. "Try again" rebuilds the whole tree from scratch (new key), so no half-failed component survives.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onReload?: (() => void) | undefined }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("render failed:", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return <Fallback onReload={this.props.onReload} onRetry={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))} />;
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
