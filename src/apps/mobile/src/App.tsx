import { SafeAreaView } from "react-native";
import type { PlatformServices, Session, SessionStore } from "@ohmatrix/core";
import { MockEngine } from "@ohmatrix/engine-mock";
import { createAppController } from "@ohmatrix/state";
import { App as SharedApp } from "@ohmatrix/app";

// TODO: replace with Keychain/Keystore storage and the native engine (engine-rust).
let saved: Session | null = null;
const sessionStore: SessionStore = {
  load: async () => saved,
  save: async (s) => {
    saved = s;
  },
  clear: async () => {
    saved = null;
  },
};

const services: PlatformServices = { sessionStore };
const controller = createAppController(new MockEngine(), services);
void controller.bootstrap();

export function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <SharedApp controller={controller} services={services} defaultHomeserver="http://localhost:8008" />
    </SafeAreaView>
  );
}
