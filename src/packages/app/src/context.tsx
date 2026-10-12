import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useStore } from "zustand";
import { detectLocale, t, type Locale, type MessageKey } from "@ohmatrix/i18n";
import type { PlatformServices } from "@ohmatrix/core";
import type { AppController, AppState } from "@ohmatrix/state";

const Ctx = createContext<AppController | null>(null);
const LocaleCtx = createContext<Locale>("en");
const ServicesCtx = createContext<PlatformServices | null>(null);

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
