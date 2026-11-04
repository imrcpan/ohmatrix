import { useEffect, useState } from "react";
import type { SharedContent } from "@ohmatrix/core";

/** What another app has shared to this one, until it is sent to the chats the person chooses or given up. */
let content: SharedContent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export const shareInbox = {
  /** Something has come; a newer one replaces one that was not placed. */
  offer(next: SharedContent) {
    content = next;
    changed();
  },
  current: (): SharedContent | null => content,
  /** It was sent, or the person gave it up. */
  clear() {
    content = null;
    changed();
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  },
};

/** Re-renders when what is waiting in the inbox changes. */
export function useShareInbox() {
  const [, bump] = useState(0);
  useEffect(() => shareInbox.subscribe(() => bump((n) => n + 1)), []);
  return shareInbox;
}
