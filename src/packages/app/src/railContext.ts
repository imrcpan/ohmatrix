import { createContext, useContext } from "react";

/** Whether the chat list is the narrow strip with only the pictures (the window is wide, and the divider has been dragged in). */
export const RailContext = createContext(false);
export const useRail = () => useContext(RailContext);
