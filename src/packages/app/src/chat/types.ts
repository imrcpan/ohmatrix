import type { MessageKey } from "@ohmatrix/i18n";

/** The translate function `useT()` returns. */
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;
