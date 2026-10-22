import { createContext, useContext } from "react";

/**
 * The ids of the messages pinned in the open chat. A message's own `pinned` flag is not trusted for this: an engine may not set it (the
 * phone's does not), while this list is what the room says, and it is the one the pinned bar shows.
 */
export const PinnedContext = createContext<ReadonlySet<string>>(new Set());

export const usePinnedSet = () => useContext(PinnedContext);
