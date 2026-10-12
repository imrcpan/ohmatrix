import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { t, detectLocale } from "@ohmatrix/i18n";

/**
 * Last line of defence: if any screen throws while rendering, show a calm message with a way out instead of a
 * blank page. Deliberately built from plain primitives, with no theme or app state (they may be what failed).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onReload?: (() => void) | undefined }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("render failed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const locale = detectLocale((globalThis as { navigator?: { language?: string } }).navigator?.language);
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#FFFFFF" }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: "#000000" }}>{t(locale, "error.title")}</Text>
        <Text style={{ fontSize: 15, color: "#8E8E93", textAlign: "center", maxWidth: 340 }}>{t(locale, "error.body")}</Text>
        <View style={{ width: 220, gap: 8, marginTop: 6 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => this.setState({ failed: false })}
            style={{ height: 46, borderRadius: 12, backgroundColor: "#3390EC", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#FFFFFF" }}>{t(locale, "error.retry")}</Text>
          </Pressable>
          {this.props.onReload && (
            <Pressable accessibilityRole="button" onPress={this.props.onReload} style={{ height: 40, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "500", color: "#3390EC" }}>{t(locale, "error.reload")}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }
}
