import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { installLog, type AppServices } from "@ohmatrix/core";
import { setStreamRenderer, setVideoRenderer } from "@ohmatrix/ui";
import { MockEngine } from "@ohmatrix/engine-mock";
import { createAccountManager, type AccountManager } from "@ohmatrix/state";
import { App as SharedApp, BootScreen } from "@ohmatrix/app";
import { createAccountStore, createSessionStore, databaseKey, inAccountDir, pathOfFileUri } from "./secureStorage.js";
import { retireOldStores } from "./storeFormat.js";
import { phoneServices } from "./platform.js";
import { createPushSync, notifyingAccountStore, type PushNative } from "./pushState.js";
import { requireOptionalNativeModule } from "expo";
import { shellInsets } from "./shellInsets.js";
import { webrtcCalls, type RtcLib } from "./webrtcCalls.js";
import { streamRendererFrom } from "./StreamViewNative.js";
import { videoRendererFrom } from "./videoRenderer.js";
import { useKeyboardHeight } from "./useKeyboardHeight.js";

// The accounts go in the Android Keystore (iOS Keychain), through expo-secure-store. The one session saved before there were
// several accounts is read once, by `legacySessions`, and becomes the first account.
// The log the app shows in Settings > Advanced options starts here, before anything else of the app runs.
installLog();

const baseAccounts = createAccountStore(SecureStore);
const legacySessions = createSessionStore(SecureStore);

// What the push service needs while the app is not running (modules/ohmatrix-push) is handed over after each change of the accounts. A
// build without the module (iOS, development without a native build) has nothing to hand it to.
const pushNative = requireOptionalNativeModule<PushNative>("OhMatrixPush");
const pushSync = pushNative
  ? createPushSync(pushNative, baseAccounts, () => SecureStore.getItemAsync("ohmatrix.db-key.v2").catch(() => null), {
      documents: Paths.document.uri,
      cache: Paths.cache.uri,
    })
  : null;
const accounts = pushSync ? notifyingAccountStore(baseAccounts, () => pushSync.refresh()) : baseAccounts;
const services: AppServices = phoneServices();

// The phone's audio mode for a call (modules/ohmatrix-call-audio): without it a call is heard at media volume from the loudspeaker.
const callAudioNative = requireOptionalNativeModule<{ start(speaker: boolean): void; setSpeaker(on: boolean): void; stop(): void }>("OhMatrixCallAudio");
const callAudio = callAudioNative
  ? {
      start: (speaker: boolean) => callAudioNative.start(speaker),
      setSpeaker: (on: boolean) => callAudioNative.setSpeaker(on),
      stop: () => callAudioNative.stop(),
    }
  : undefined;

// A call's picture and sound on the phone are drawn by react-native-webrtc's own view, which is loaded with the library when the first call
// is made (the module is native, and the app starts without it).
// Where react-native-webrtc is read from: the first call, not the start of the app.
// (A synchronous `require`, on purpose: Metro loads the module at this call, where an `import()` would be asynchronous.)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadRtc = (): RtcLib & { RTCView: unknown } => require("react-native-webrtc") as RtcLib & { RTCView: unknown };
setStreamRenderer(streamRendererFrom(loadRtc));

// A video is played by expo-video's view, read the first time a video is opened (the module is native, and an older build lacks it).
// (A synchronous `require`, as above.)
// eslint-disable-next-line @typescript-eslint/no-require-imports
setVideoRenderer(videoRendererFrom(() => (require("./VideoPlayerNative.js") as typeof import("./VideoPlayerNative.js")).VideoPlayer));

/** The databases of the accounts of earlier versions: the files of the first account (in the roots themselves) and the folders of the others. */
function deleteOldStores(): void {
  for (const root of [Paths.document, Paths.cache]) {
    for (const item of root.list()) {
      try {
        if (item instanceof Directory ? /^acct-/.test(item.name) : /^matrix-sdk-/.test(item.name)) item.delete();
      } catch {
        /* one that cannot be deleted is left; a new database never opens it */
      }
    }
  }
}

/** An account's folder inside one of the app's roots (documents: the SDK's database; cache: its media), made if it is not there yet. */
function accountFolder(root: string, dir: string | undefined): string {
  if (dir) {
    const folder = new Directory(root, dir);
    if (!folder.exists) folder.create({ intermediates: true });
  }
  return pathOfFileUri(inAccountDir(root, dir));
}

/**
 * The manager of the accounts, with an engine for each: matrix-rust-sdk through the native module, or the in-memory mock
 * (EXPO_PUBLIC_ENGINE=mock) for working on the screens without the native library. The Rust module is loaded only when used,
 * so a build without it still starts. Each account has its own database folder (`dir`); the account from before there were
 * several keeps the app's own folder.
 */
async function createManager(): Promise<AccountManager> {
  // The databases of earlier versions cannot be opened with the key this version uses: the first start drops them and their accounts.
  await retireOldStores({ kv: SecureStore, accounts: baseAccounts, legacySessions, deleteFiles: deleteOldStores });
  const mock = process.env["EXPO_PUBLIC_ENGINE"] === "mock";
  const { RustEngine } = mock ? { RustEngine: null } : await import("@ohmatrix/engine-rust");
  const manager = createAccountManager({
    accounts,
    legacySessions,
    services,
    makeEngine: (dir) =>
      RustEngine
        ? new RustEngine({
            dataDir: accountFolder(Paths.document.uri, dir),
            cacheDir: accountFolder(Paths.cache.uri, dir),
            key: () => databaseKey(SecureStore, (n) => Crypto.getRandomBytes(n)),
            readFile: (path) => new File(`file://${path}`).arrayBuffer(),
            calls: webrtcCalls(loadRtc, () => Crypto.randomUUID(), callAudio),
          })
        : new MockEngine(),
    newDir: () => `acct-${[...Crypto.getRandomBytes(6)].map((b) => b.toString(16).padStart(2, "0")).join("")}`,
    // What a signed-out account left: its folders. (The first account's data sits in the app's own folder, which is not ours to empty.)
    forget: async ({ dir }) => {
      if (!dir) return;
      for (const root of [Paths.document.uri, Paths.cache.uri]) {
        const folder = new Directory(root, dir);
        if (folder.exists) folder.delete();
      }
    },
  });
  await manager.start();
  if (pushSync) {
    // The settings that decide what the service shows are the device's (every account's controller has the same), so they are read from
    // the controller that is showing, and followed from the next one when the account changes.
    let off = () => {};
    const follow = () => {
      off();
      const controller = manager.current();
      const send = () => {
        const p = controller.store.getState().prefs;
        void pushSync.prefs({ pushEnabled: p.pushEnabled, notificationPreview: p.notificationPreview, locale: p.locale });
      };
      off = controller.store.subscribe(send);
      send();
    };
    void pushSync.refresh();
    manager.store.subscribe((s, prev) => s.currentKey !== prev.currentKey && follow());
    follow();
  }
  return manager;
}

let started: Promise<AccountManager> | null = null;
const getManager = () => (started ??= createManager());

function Boot() {
  const [manager, setManager] = useState<AccountManager | null>(null);
  const system = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  useEffect(() => {
    void getManager().then(setManager);
  }, []);
  if (!manager) return <BootScreen />;
  // EXPO_PUBLIC_DEFAULT_HOMESERVER: a development server to offer on the sign-in screen (the way the web app does).
  return (
    <SharedApp
      manager={manager}
      services={services}
      defaultHomeserver={process.env["EXPO_PUBLIC_DEFAULT_HOMESERVER"] ?? "matrix.org"}
      // Drawn edge to edge: keep clear of the system bars, and lift the content above the keyboard.
      insets={shellInsets(system, keyboard, Platform.OS === "ios" ? "ios" : "android")}
    />
  );
}

/** EXPO_PUBLIC_NATIVE_SELFTEST=1: show whether the Rust library loaded, instead of the app. */
function SelfTest() {
  const [text, setText] = useState("calling the native module…");
  useEffect(() => {
    void import("@ohmatrix/engine-rust")
      .then((m) => m.nativeSelfTest())
      .then((r) => setText(`native OK\nmatrix-rust-sdk ${r.sdkGitSha}\ntransaction id ${r.transactionId}`))
      .catch((e: unknown) => setText(`native FAILED\n${e instanceof Error ? e.message : String(e)}`));
  }, []);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 18, textAlign: "center" }}>{text}</Text>
    </View>
  );
}

export function App() {
  return <SafeAreaProvider>{process.env["EXPO_PUBLIC_NATIVE_SELFTEST"] === "1" ? <SelfTest /> : <Boot />}</SafeAreaProvider>;
}
