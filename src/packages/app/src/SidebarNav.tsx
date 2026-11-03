import { useRef } from "react";
import { View } from "react-native";
import { useTheme } from "@ohmatrix/ui";
import { AccountsPage } from "./AccountsPage.js";
import { ProfilePage } from "./ProfilePage.js";
import { RoomListPane } from "./RoomListPane.js";
import { SessionsPage } from "./SessionsPage.js";
import { SettingsPage } from "./SettingsPage.js";
import { StackNav } from "./StackNav.js";
import { AdvancedPage } from "./AdvancedPage.js";
import { AppIconPage } from "./AppIconPage.js";
import { EncryptionPage } from "./EncryptionPage.js";
import { LogPage } from "./LogPage.js";
import { ThemePage } from "./ThemePage.js";
import { useAppState } from "./context.js";

// Accounts and Settings both open over the profile, so they share the second layer; Sessions, Theme, App icon and Advanced open over Settings, and share
// the third; the log opens over Advanced, a fourth.
const DEPTH = { chats: 0, profile: 1, accounts: 2, settings: 2, encryption: 2, sessions: 3, theme: 3, appIcon: 3, advanced: 3, logs: 4 } as const;

/** The left pane: chat list → profile (slides in from the left, like a drawer) → accounts or settings (push in from the right) → sessions. */
export function SidebarNav(props: { list?: boolean } = {}) {
  const { colors } = useTheme();
  const page = useAppState((s) => s.sidebarPage);
  const homeserver = useAppState((s) => s.homeserver ?? "");
  // The shared layer keeps showing the page that opened it while it slides away, instead of turning into the other one.
  const layer = useRef<"accounts" | "settings" | "encryption">("settings");
  if (page === "accounts" || page === "settings" || page === "encryption") layer.current = page;
  const deep = useRef<"sessions" | "theme" | "appIcon" | "advanced">("sessions");
  if (page === "sessions" || page === "theme" || page === "appIcon" || page === "advanced") deep.current = page;
  return (
    <StackNav
      depth={DEPTH[page]}
      pages={[
        // Where the chat list is drawn beside this (the floating panel in landscape), it is not drawn a second time under the pages.
        { node: props.list === false ? <View style={{ flex: 1, backgroundColor: colors.bg }} /> : <RoomListPane /> },
        { node: <ProfilePage homeserver={homeserver} />, from: "left" }, // opens like a drawer, from the avatar side
        {
          node: layer.current === "accounts" ? <AccountsPage /> : layer.current === "encryption" ? <EncryptionPage /> : <SettingsPage />,
        },
        {
          node:
            deep.current === "theme" ? (
              <ThemePage />
            ) : deep.current === "appIcon" ? (
              <AppIconPage />
            ) : deep.current === "advanced" ? (
              <AdvancedPage />
            ) : (
              <SessionsPage />
            ),
        },
        { node: <LogPage /> },
      ]}
    />
  );
}
