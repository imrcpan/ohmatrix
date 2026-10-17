import { useRef } from "react";
import { AccountsPage } from "./AccountsPage.js";
import { ProfilePage } from "./ProfilePage.js";
import { RoomListPane } from "./RoomListPane.js";
import { SessionsPage } from "./SessionsPage.js";
import { SettingsPage } from "./SettingsPage.js";
import { StackNav } from "./StackNav.js";
import { useAppState } from "./context.js";

// Accounts and Settings both open over the profile, so they share the second layer; Sessions opens over Settings.
const DEPTH = { chats: 0, profile: 1, accounts: 2, settings: 2, sessions: 3 } as const;

/** The left pane: chat list → profile (slides in from the left, like a drawer) → accounts or settings (push in from the right) → sessions. */
export function SidebarNav() {
  const page = useAppState((s) => s.sidebarPage);
  const homeserver = useAppState((s) => s.homeserver ?? "");
  // The shared layer keeps showing the page that opened it while it slides away, instead of turning into the other one.
  const layer = useRef<"accounts" | "settings">("settings");
  if (page === "accounts" || page === "settings") layer.current = page;
  return (
    <StackNav
      depth={DEPTH[page]}
      pages={[
        { node: <RoomListPane /> },
        { node: <ProfilePage homeserver={homeserver} />, from: "left" }, // opens like a drawer, from the avatar side
        { node: layer.current === "accounts" ? <AccountsPage /> : <SettingsPage /> },
        { node: <SessionsPage /> },
      ]}
    />
  );
}
