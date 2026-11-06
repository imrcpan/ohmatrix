import { useEffect, useState } from "react";
import { createMemoryAccountStore, installLog, type AppServices } from "@ohmatrix/core";
import { MockEngine } from "@ohmatrix/engine-mock";
import { createAccountManager, type AccountManager } from "@ohmatrix/state";
import { App as SharedApp, BootScreen } from "@ohmatrix/app";

// The log the app shows in Settings > Advanced options starts here, before anything else of the app runs.
installLog();

// First step: the shared app on the in-memory engine, with nothing of the system behind it yet (no key store, no files, no notifications).
const services: AppServices = {};

function createManager(): Promise<AccountManager> {
  const manager = createAccountManager({
    accounts: createMemoryAccountStore(),
    services,
    makeEngine: () => new MockEngine(),
  });
  return manager.start().then(() => manager);
}

let started: Promise<AccountManager> | null = null;

export function App() {
  const [manager, setManager] = useState<AccountManager | null>(null);
  useEffect(() => {
    void (started ??= createManager()).then(setManager);
  }, []);
  if (!manager) return <BootScreen />;
  return <SharedApp manager={manager} services={services} defaultHomeserver="matrix.org" />;
}
