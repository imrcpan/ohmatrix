import { View } from "react-native";
import { InsetsContext, ScaleProvider, Spinner, ThemeProvider, useTheme, useUnzoom } from "@ohmatrix/ui";
import type { ReactNode } from "react";
import { useStore } from "zustand";
import type { AppServices } from "@ohmatrix/core";
import type { AccountManager } from "@ohmatrix/state";
import { AppProviders, useAccountManager, useAccountsState, useAppState, useController, useT } from "./context.js";
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
  const manager = useAccountManager();
  const t = useT();
  const adding = useAccountsState((s) => s.adding && s.accounts.length > 0);
  // Another account that is there to go to, when the one showing has no sign-in of its own to offer (it could not start).
  const other = useAccountsState((s) => s.accounts.find((a) => a.userId !== s.currentKey)?.userId);
  if (auth === "signedIn")
    return (
      <>
        <BackBridge />
        <MainScreen />
      </>
    );
  if (auth === "booting") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <Spinner />
      </View>
    );
  }
  // Never a dead end while there is another account: adding one has a way back to the account that was showing, and an account
  // that could not start (no network, a store that would not open) has a way over to another one.
  const back = adding
    ? { label: t("back"), onPress: () => manager.cancelAdd() }
    : other
      ? { label: t("switchAccount"), onPress: () => manager.switchTo(other) }
      : undefined;
  return <LoginScreen defaultHomeserver={props.defaultHomeserver} back={back} />;
}

/**
 * Shared application shell (screens, navigation, wiring). Platform apps only choose the engine,
 * build the platform services and an `AccountManager` (and `start()` it), and render this.
 */
export function App(props: {
  manager: AccountManager;
  services: AppServices;
  defaultHomeserver?: string;
  onReload?: () => void;
  /** Room the platform takes for itself, in px of the window: what it draws over the app (system bars, the keyboard). */
  insets?: Insets | undefined;
}) {
  return (
    <ErrorBoundary onReload={props.onReload} copyText={props.services.copyText}>
      <Showing manager={props.manager} services={props.services}>
        <Themed>
          <Framed insets={props.insets}>
            <Root defaultHomeserver={props.defaultHomeserver ?? ""} />
          </Framed>
        </Themed>
      </Showing>
    </ErrorBoundary>
  );
}

/**
 * The account on screen. Switching accounts gives everything below a new controller and mounts it afresh (keyed), so
 * nothing open in one account (a chat, a draft, a panel) carries over into another.
 */
function Showing(props: { manager: AccountManager; services: AppServices; children: ReactNode }) {
  const key = useStore(props.manager.store, (s) => s.currentKey);
  return (
    <AppProviders key={key} controller={props.manager.current()} manager={props.manager} services={props.services}>
      {/* Outside the screens, so any account can notify whatever is showing, the sign-in screen of a new account included. */}
      <NotificationsBridge />
      {props.children}
    </AppProviders>
  );
}

/** Before the app is there (a phone is still reading its accounts): the theme's background and a big circle in its colour. */
export function BootScreen() {
  return (
    <ThemeProvider themeId="system">
      <Booting />
    </ThemeProvider>
  );
}

function Booting() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <Spinner />
    </View>
  );
}

/** Space around the app that something else covers. All sides in the window's px. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** Of `bottom`, what is a gesture bar the app is drawn under (the screens leave room for it themselves). */
  navBottom?: number;
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
  const inner = { top: un(i.top), right: un(i.right), bottom: un(i.bottom), left: un(i.left), navBottom: un(i.navBottom ?? 0) };
  return (
    <InsetsContext.Provider value={inner}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: inner.top,
          paddingRight: inner.right,
          paddingBottom: inner.bottom - inner.navBottom,
          paddingLeft: inner.left,
        }}
      >
        {props.children}
      </View>
    </InsetsContext.Provider>
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
