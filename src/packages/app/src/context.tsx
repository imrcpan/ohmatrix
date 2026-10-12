import { createContext, useContext, useMemo, type ReactNode } from "react";
import type React from "react";
import { useStore } from "zustand";
import { detectLocale, t, type Locale, type MessageKey } from "@ohmatrix/i18n";
import type { PlatformServices } from "@ohmatrix/core";
import type { AppController, AppState } from "@ohmatrix/state";

/**
 * One context object per page, however many times this module is evaluated. A development server that hot-reloads
 * can briefly run two copies of this file (new provider, old consumer); with copy-local contexts the consumer then
 * finds no provider ("useController outside AppProviders"). Keeping them on globalThis makes the copies agree.
 */
const shared = <T,>(name: string, make: () => React.Context<T>): React.Context<T> => {
  const g = globalThis as unknown as Record<string, React.Context<T> | undefined>;
  return (g[`__ohmatrix_ctx_${name}`] ??= make());
};
const Ctx = shared<AppController | null>("controller", () => createContext<AppController | null>(null));
const LocaleCtx = shared<Locale>("locale", () => createContext<Locale>("en"));
const ServicesCtx = shared<PlatformServices | null>("services", () => createContext<PlatformServices | null>(null));

export function AppProviders(props: { controller: AppController; services: PlatformServices; children: ReactNode }) {
  const preferred = useStore(props.controller.store, (s) => s.prefs.locale);
  const locale: Locale =
    preferred ?? detectLocale((globalThis as { navigator?: { language?: string } }).navigator?.language ?? Intl.DateTimeFormat().resolvedOptions().locale);
  return (
    <Ctx.Provider value={props.controller}>
      <ServicesCtx.Provider value={props.services}>
        <LocaleCtx.Provider value={locale}>{props.children}</LocaleCtx.Provider>
      </ServicesCtx.Provider>
    </Ctx.Provider>
  );
}

export function useController(): AppController {
  const c = useContext(Ctx);
  if (!c) throw new Error("useController outside AppProviders");
  return c;
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useStore(useController().store, selector);
}

export function useLocale(): Locale {
  return useContext(LocaleCtx);
}

export function useT() {
  const locale = useLocale();
  return useMemo(() => (key: MessageKey, params?: Record<string, string | number>) => t(locale, key, params), [locale]);
}

export function useServices(): PlatformServices {
  const s = useContext(ServicesCtx);
  if (!s) throw new Error("useServices outside AppProviders");
  return s;
}
