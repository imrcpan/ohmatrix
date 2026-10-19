import type { AppServices } from "@ohmatrix/core";

/** What the native module (modules/ohmatrix-app-icon) offers. */
export interface AppIconNative {
  getIcon(): string;
  setIcon(id: string): void;
}

type Choice = { id: string; preview: number; svg?: string };

/**
 * The icons to choose from: only when this build has both the list (made when the app is built, from the logo: .generated/appIcons.ts)
 * and the native module that changes the icon. With either missing (an app built before icons could be chosen, a checkout that has not
 * made them) there is nothing to choose and Settings leaves the row out.
 */
export function createAppIcons(list: readonly Choice[] | null | undefined, native: AppIconNative | null | undefined): AppServices["appIcons"] | undefined {
  if (!list?.length || !native) return undefined;
  const known = new Set(list.map((i) => i.id));
  return {
    list: () => [...list],
    current: () => {
      try {
        const id = native.getIcon();
        return known.has(id) ? id : (list[0]?.id ?? "");
      } catch {
        return list[0]?.id ?? "";
      }
    },
    set: (id) => {
      if (!known.has(id)) throw new Error(`unknown icon '${id}'`);
      native.setIcon(id);
    },
  };
}

declare const require: (id: string) => unknown;

/** The list made at build time. Read in a try, which Metro takes as optional: no file, no list, and the app still starts. */
export function generatedList(): Choice[] | null {
  try {
    return (require("../.generated/appIcons") as { APP_ICONS?: Choice[] }).APP_ICONS ?? null;
  } catch {
    return null;
  }
}

/** The logo to draw in the app: the plain (not full-square) logo of the icon that is showing; nothing when this build has no list. */
export function appLogoOf(list: readonly Choice[] | null | undefined, icons: AppServices["appIcons"] | undefined): string | undefined {
  if (!list?.length || !icons) return undefined;
  const id = icons.current();
  return (list.find((i) => i.id === id) ?? list[0])?.svg;
}

/** With the native module found by the caller (`requireOptionalNativeModule("OhMatrixAppIcon")` in the phone's services). */
export function phoneAppIcons(native: AppIconNative | null | undefined): AppServices["appIcons"] | undefined {
  return createAppIcons(generatedList(), native);
}
