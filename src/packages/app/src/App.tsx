import { ActivityIndicator, View } from "react-native";
import { ScaleProvider, ThemeProvider, useTheme, useUnzoom } from "@ohmatrix/ui";
import type { ReactNode } from "react";
import type { PlatformServices } from "@ohmatrix/core";
import type { AppController } from "@ohmatrix/state";
import { AppProviders, useAppState, useController } from "./context.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { LoginScreen } from "./LoginScreen.js";
import { MainScreen } from "./MainScreen.js";
import { NotificationsBridge } from "./NotificationsBridge.js";
import { useBackHandler } from "./useBackHandler.js";

/** The platform's back closes the topmost layer of the app, and only leaves the app when there is none. */
function BackBridge() {
  const controller = useController();
  useBackHandler(() => controller.back());
  return null;
}

function Root(props: { defaultHomeserver: string }) {
  const { colors } = useTheme();
  const auth = useAppState((s) => s.auth);
  if (auth === "signedIn")
    return (
      <>
        <NotificationsBridge />
        <BackBridge />
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
export function App(props: {
  controller: AppController;
  services: PlatformServices;
  defaultHomeserver?: string;
  onReload?: () => void;
  /** Room the platform takes for itself, in px of the window: what it draws over the app (system bars, the keyboard). */
  insets?: Insets | undefined;
}) {
  return (
    <ErrorBoundary onReload={props.onReload}>
      <AppProviders controller={props.controller} services={props.services}>
        <Themed>
          <Framed insets={props.insets}>
            <Root defaultHomeserver={props.defaultHomeserver ?? ""} />
          </Framed>
        </Themed>
      </AppProviders>
    </ErrorBoundary>
  );
}

/** Space around the app that something else covers. All sides in the window's px. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Keeps the app out from under what the platform draws over it. It is inside the theme, so the strip behind the status
 * bar is the theme's colour, and inside the zoom, so it is the size it is meant to be (the insets are in the window's px).
 * Where there are none (the web) it is not there.
 */
function Framed(props: { insets: Insets | undefined; children: ReactNode }) {
  const { colors } = useTheme();
  const un = useUnzoom();
  const i = props.insets;
  if (!i) return <>{props.children}</>;
  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: un(i.top), paddingRight: un(i.right), paddingBottom: un(i.bottom), paddingLeft: un(i.left) }}
    >
      {props.children}
    </View>
  );
}

function Themed({ children }: { children: ReactNode }) {
  const themeId = useAppState((s) => s.prefs.theme);
  const scale = useAppState((s) => s.prefs.uiScale);
  return (
    <ThemeProvider themeId={themeId}>
      <ScaleProvider scale={scale}>{children}</ScaleProvider>
    </ThemeProvider>
  );
}
