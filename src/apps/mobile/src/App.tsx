import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import type { AppServices } from "@ohmatrix/core";
import { MockEngine } from "@ohmatrix/engine-mock";
import { createAccountManager, type AccountManager } from "@ohmatrix/state";
import { App as SharedApp } from "@ohmatrix/app";
import { createAccountStore, createSessionStore, databasePassphrase, inAccountDir, pathOfFileUri } from "./secureStorage.js";
import { phoneServices } from "./platform.js";
import { shellInsets } from "./shellInsets.js";
import { useKeyboardHeight } from "./useKeyboardHeight.js";

// The accounts go in the Android Keystore (iOS Keychain), through expo-secure-store. The one session saved before there were
// several accounts is read once, by `legacySessions`, and becomes the first account.
const accounts = createAccountStore(SecureStore);
const legacySessions = createSessionStore(SecureStore);
const services: AppServices = phoneServices();

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
            passphrase: () => databasePassphrase(SecureStore, (n) => Crypto.getRandomBytes(n)),
            readFile: (path) => new File(`file://${path}`).arrayBuffer(),
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
  if (!manager)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
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
