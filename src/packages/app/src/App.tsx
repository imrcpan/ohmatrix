import { ActivityIndicator, View } from "react-native";
import { ThemeProvider, useTheme } from "@ohmatrix/ui";
import type { ReactNode } from "react";
import type { PlatformServices } from "@ohmatrix/core";
import type { AppController } from "@ohmatrix/state";
import { AppProviders, useAppState } from "./context.js";
import { LoginScreen } from "./LoginScreen.js";
import { MainScreen } from "./MainScreen.js";
import { NotificationsBridge } from "./NotificationsBridge.js";

function Root(props: { defaultHomeserver: string }) {
  const { colors } = useTheme();
  const auth = useAppState((s) => s.auth);
  if (auth === "signedIn")
    return (
      <>
        <NotificationsBridge />
        <MainScreen />
      </>
    );
  if (auth === "booting") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }
  return <LoginScreen defaultHomeserver={props.defaultHomeserver} />;
}

/**
 * Shared application shell (screens, navigation, wiring). Platform apps only choose the engine,
 * build `PlatformServices`, call `controller.bootstrap()`, and render this.
 */
export function App(props: { controller: AppController; services: PlatformServices; defaultHomeserver?: string }) {
  return (
    <AppProviders controller={props.controller} services={props.services}>
      <Themed>
        <Root defaultHomeserver={props.defaultHomeserver ?? ""} />
      </Themed>
    </AppProviders>
  );
}

function Themed({ children }: { children: ReactNode }) {
  const themeId = useAppState((s) => s.prefs.theme);
  return <ThemeProvider themeId={themeId}>{children}</ThemeProvider>;
}
