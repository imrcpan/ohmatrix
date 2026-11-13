import { createContext, useContext } from "react";

/** Whether the chat list is the narrow strip with only the pictures (the window is wide, and the divider has been dragged in). */
export const RailContext = createContext(false);
export const useRail = () => useContext(RailContext);

/** Whether the window is wide enough for the two panes (the chat list beside the chat: landscape on a phone, or a desktop window). */
export const SplitContext = createContext(false);
export const useSplit = () => useContext(SplitContext);
