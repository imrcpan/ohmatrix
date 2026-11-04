import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, View, useWindowDimensions } from "react-native";
import { InsetsContext, KeyboardHoldContext, ScaleProvider, setUiFont, Spinner, ThemeProvider, useTheme, useUnzoom } from "@ohmatrix/ui";
import { useStore } from "zustand";
import type { AppServices } from "@ohmatrix/core";
import type { AccountManager } from "@ohmatrix/state";
import { AppProviders, useAccountManager, useAccountsState, useAppState, useController, useT } from "./context.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { LoginScreen } from "./LoginScreen.js";
import { VerificationSheet } from "./VerificationSheet.js";
import { MainScreen } from "./MainScreen.js";
import { SharePage } from "./ShareReceiver.js";
import { useShareInbox } from "./shareInbox.js";
import { useIncomingShare } from "./useIncomingShare.js";
import { NotificationsBridge } from "./NotificationsBridge.js";
import { useBackHandler } from "./useBackHandler.js";
import { NoticeProvider } from "./useNotice.js";
import { CallScreen } from "./CallScreen.js";

/** The platform's back closes the topmost layer of the app, and only leaves the app when there is none. */
function BackBridge() {
  const controller = useController();
  useBackHandler(() => controller.back());
  return null;
}

/**
 * The add-account screen drops in from the top and, when it is left by going back, goes up again. It is only for adding: a sign-in
 * that is the first screen of the app, or one that ends in an account, is just swapped.
 */
function useDrop(active: boolean) {
  const height = useWindowDimensions().height;
  const y = useRef(new Animated.Value(active ? -height : 0)).current;
  const going = useRef(false);
  const mounted = useRef(true);
  const native = Platform.OS !== "web";
  useEffect(() => {
    mounted.current = true;
    if (active) Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const leave = (done: () => void) => {
    if (going.current) return;
    going.current = true;
    Animated.timing(y, { toValue: -height, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: native }).start(() => {
      done();
      // Going back can be refused (the sign-in is still going on): then the screen has to come back down.
      setTimeout(() => {
        if (!mounted.current) return;
        going.current = false;
        Animated.timing(y, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
      }, 60);
    });
  };
  return { y, leave };
}

function Root(props: { defaultHomeserver: string }) {
  const { colors } = useTheme();
  const auth = useAppState((s) => s.auth);
  const manager = useAccountManager();
  const t = useT();
  const adding = useAccountsState((s) => s.adding && s.accounts.length > 0);
  const drop = useDrop(adding);
  // Another account that is there to go to, when the one showing has no sign-in of its own to offer (it could not start).
  const other = useAccountsState((s) => s.accounts.find((a) => a.userId !== s.currentKey)?.userId);
  // Never a dead end while there is another account: adding one has a way back to the account that was showing, and an account
  // that could not start (no network, a store that would not open) has a way over to another one.
  const back = adding
    ? { label: t("back"), onPress: () => drop.leave(() => manager.cancelAdd()) }
    : other
      ? { label: t("switchAccount"), onPress: () => manager.switchTo(other) }
      : undefined;
  // The platform's back takes the same way out as the button on the screen, rather than leaving the app.
  useBackHandler(auth !== "signedIn" && back ? () => (back.onPress(), true) : null);
  // Something shared by another app: the page that asks which chats it is for is the first screen then, and the rest of the app is drawn only when it
  // is done (it is not drawn behind it, to be jumped away from); once the app has been drawn the page is a layer over it.
  const looked = useIncomingShare();
  const sharing = !!useShareInbox().current();
  const drawn = useRef(false);
  if (auth === "booting" || (auth === "signedIn" && !looked)) {
    return sharing ? (
      <SharePage />
    ) : (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <Spinner />
      </View>
    );
  }
  if (auth === "signedIn") {
    if (!sharing) drawn.current = true;
    return (
      <>
        <BackBridge />
        {(!sharing || drawn.current) && <MainScreen />}
        {sharing && <SharePage />}
        <VerificationSheet />
      </>
    );
  }
  const login = <LoginScreen defaultHomeserver={props.defaultHomeserver} back={back} />;
  return adding ? <Animated.View style={{ flex: 1, transform: [{ translateY: drop.y }] }}>{login}</Animated.View> : login;
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
            <NoticeProvider>
              <Root defaultHomeserver={props.defaultHomeserver ?? ""} />
              {/* Inside the theme and the notices, over whatever is showing. */}
              <CallScreen />
            </NoticeProvider>
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
  /** From the bottom of the window to the top of the keyboard; 0 when it is hidden. */
  keyboard?: number;
  /** What `bottom` and `navBottom` are when the keyboard is hidden. */
  resting?: { bottom: number; navBottom: number };
}

/**
 * Keeps the app out from under what the platform draws over it. It is inside the theme, so the strip behind the status
 * bar is the theme's colour, and inside the zoom, so it is the size it is meant to be (the insets are in the window's px).
 * Where there are none (the web) it is not there.
 */
function Framed(props: { insets: Insets | undefined; children: ReactNode }) {
  const { colors } = useTheme();
  const un = useUnzoom();
  const [holds, setHolds] = useState(0);
  const hold = useMemo(
    () => ({
      acquire: () => {
        setHolds((n) => n + 1);
        return () => setHolds((n) => n - 1);
      },
    }),
    [],
  );
  const i = props.insets;
  // Once the last dialog is gone the screens stay put until the keyboard is down too (it goes down a moment after the dialog does: lifting
  // them in between made the page jump up), or for a second if it is not going down (a field behind the dialog has the focus now).
  const [latched, setLatched] = useState(false);
  const keyboardUp = (i?.keyboard ?? 0) > 0;
  useEffect(() => {
    if (holds > 0) return setLatched(true);
    if (!latched) return;
    if (!keyboardUp) return setLatched(false);
    const timer = setTimeout(() => setLatched(false), 1000);
    return () => clearTimeout(timer);
  }, [holds, latched, keyboardUp]);
  if (!i) return <>{props.children}</>;
  const inner = { top: un(i.top), right: un(i.right), bottom: un(i.bottom), left: un(i.left), navBottom: un(i.navBottom ?? 0), keyboard: un(i.keyboard ?? 0) };
  // A dialog with a field of its own is open: the screens behind stay where they were, and the dialog keeps clear of the keyboard itself.
  const held = (holds > 0 || latched) && !!i.resting && keyboardUp;
  const bottom = held ? un(i.resting!.bottom) : inner.bottom;
  const navBottom = held ? un(i.resting!.navBottom) : inner.navBottom;
  return (
    <InsetsContext.Provider value={inner}>
      <KeyboardHoldContext.Provider value={hold}>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.bg,
            paddingTop: inner.top,
            paddingRight: inner.right,
            paddingBottom: bottom - navBottom,
            paddingLeft: inner.left,
          }}
        >
          {props.children}
        </View>
      </KeyboardHoldContext.Provider>
    </InsetsContext.Provider>
  );
}

function Themed({ children }: { children: ReactNode }) {
  const themeId = useAppState((s) => s.prefs.theme);
  const scale = useAppState((s) => s.zoomTrial?.to ?? s.prefs.uiScale);
  const font = useAppState((s) => s.prefs.font);
  useEffect(() => setUiFont(font), [font]);
  return (
    <ThemeProvider themeId={themeId}>
      <ScaleProvider scale={scale}>{children}</ScaleProvider>
    </ThemeProvider>
  );
}
