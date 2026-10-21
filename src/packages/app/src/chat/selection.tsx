import { createContext, useContext } from "react";

/** Choosing several messages of the chat (to copy or forward): which are chosen, and the way to choose one more or take one off. */
export interface Selection {
  active: boolean;
  has(eventId: string): boolean;
  /** Likewise for the message right below it. */
  joinedBelow(eventId: string): boolean;
  /** The message is chosen and so is the message right above it (nothing between them): the gap between the two is shaded too. */
  joinedAbove(eventId: string): boolean;
  toggle(eventId: string): void;
}

export const SelectionContext = createContext<Selection>({
  active: false,
  has: () => false,
  joinedAbove: () => false,
  joinedBelow: () => false,
  toggle: () => {},
});

export const useSelection = () => useContext(SelectionContext);
