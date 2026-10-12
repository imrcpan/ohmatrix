import { ProfilePage } from "./ProfilePage.js";
import { RoomListPane } from "./RoomListPane.js";
import { SessionsPage } from "./SessionsPage.js";
import { SettingsPage } from "./SettingsPage.js";
import { StackNav } from "./StackNav.js";
import { useAppState } from "./context.js";

const DEPTH = { chats: 0, profile: 1, settings: 2, sessions: 3 } as const;

/** The left pane: chat list → profile (slides in from the left, like a drawer) → settings (pushes in from the right). */
export function SidebarNav() {
  const page = useAppState((s) => s.sidebarPage);
  const homeserver = useAppState((s) => s.homeserver ?? "");
  return (
    <StackNav
      depth={DEPTH[page]}
      pages={[
        { node: <RoomListPane /> },
        { node: <ProfilePage homeserver={homeserver} />, from: "left" }, // opens like a drawer, from the avatar side
        { node: <SettingsPage /> }, // pushes in from the right, over the profile
        { node: <SessionsPage /> },
      ]}
    />
  );
}
