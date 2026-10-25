import { useSyncExternalStore } from "react";
import type { MxcUri } from "@ohmatrix/core";

/** A room being joined that is slow enough to be shown in the chat list. */
export interface Joining {
  id: string;
  name: string;
  avatar?: MxcUri | undefined;
  /** When the join was started (ms since 1970): the row counts the seconds from it. */
  since: number;
}

let items: readonly Joining[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function addJoining(j: Joining): void {
  items = [...items.filter((x) => x.id !== j.id), j];
  emit();
}

export function removeJoining(id: string): void {
  if (!items.some((x) => x.id === id)) return;
  items = items.filter((x) => x.id !== id);
  emit();
}

/** The rooms being joined now, in the order they were started. */
export function useJoining(): readonly Joining[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => items,
    () => items,
  );
}
