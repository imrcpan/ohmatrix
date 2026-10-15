import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import type { MatrixEngine, PlatformServices } from "@ohmatrix/core";
import { MockEngine } from "@ohmatrix/engine-mock";
import { createAppController, type AppController } from "@ohmatrix/state";
import { App as SharedApp } from "@ohmatrix/app";
import { createSessionStore, databasePassphrase, pathOfFileUri } from "./secureStorage.js";
import { shellInsets } from "./shellInsets.js";
import { useKeyboardHeight } from "./useKeyboardHeight.js";

// The session goes in the Android Keystore (iOS Keychain), through expo-secure-store.
const sessionStore = createSessionStore(SecureStore);
const services: PlatformServices = { sessionStore };

/**
 * The engine: matrix-rust-sdk through the native module, or the in-memory mock (EXPO_PUBLIC_ENGINE=mock) for working on
 * the screens without the native library. The Rust one is loaded only when used, so a build without it still starts.
 */
async function createEngine(): Promise<MatrixEngine> {
  if (process.env["EXPO_PUBLIC_ENGINE"] === "mock") return new MockEngine();
  const { RustEngine } = await import("@ohmatrix/engine-rust");
  return new RustEngine({
    dataDir: pathOfFileUri(Paths.document.uri),
    cacheDir: pathOfFileUri(Paths.cache.uri),
    passphrase: () => databasePassphrase(SecureStore, (n) => Crypto.getRandomBytes(n)),
  });
}

let started: Promise<AppController> | null = null;
const controller = () =>
  (started ??= createEngine().then((engine) => {
    const c = createAppController(engine, services);
    void c.bootstrap();
    return c;
  }));

function Boot() {
  const [c, setC] = useState<AppController | null>(null);
  const system = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  useEffect(() => {
    void controller().then(setC);
  }, []);
  if (!c)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  // EXPO_PUBLIC_DEFAULT_HOMESERVER: a development server to offer on the sign-in screen (the way the web app does).
  return (
    <SharedApp
      controller={c}
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
