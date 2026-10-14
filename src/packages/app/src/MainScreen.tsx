import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Icon, TextButton, fontFamily, useTheme, useViewport } from "@ohmatrix/ui";
import { ChatPane } from "./chat/ChatPane.js";
import { RoomInfoPanel } from "./RoomInfoPanel.js";
import { SlidePanel } from "./SlidePanel.js";
import { useAppState, useController, useT } from "./context.js";
import { autoSidebar, clampSidebar } from "./layout.js";
import { SidebarNav } from "./SidebarNav.js";
import { SidebarResizer } from "./SidebarResizer.js";
import { SlideStack } from "./SlideStack.js";

/** Width at which we switch from single-column (portrait/phone) to two-pane (landscape/desktop). */
export const SPLIT_BREAKPOINT = 760;

/**
 * The selected chat id can come from the address bar (reload, deep link) before sync has delivered the
 * room. Show a spinner until it arrives; if sync finished and it still is not there, say so.
 */
function RoomGate({ roomId, children }: { roomId: string; children: ReactNode }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const known = useAppState((s) => s.rooms.some((r) => r.id === roomId && !r.invite));
  const synced = useAppState((s) => s.syncState === "syncing");
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setMissing(false);
    if (known || !synced) return;
    const timer = setTimeout(() => setMissing(true), 1500); // the room list is emitted just after sync reports ready
    return () => clearTimeout(timer);
  }, [known, synced, roomId]);

  if (known) return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24, backgroundColor: colors.chatBg }}>
      {missing ? (
        <>
          <Icon name="chat" size={36} color={colors.textSecondary} />
          <Text style={{ fontSize: 18, fontWeight: "600", fontFamily, color: colors.text }}>{t("chatNotFound")}</Text>
          <Text style={{ fontSize: 14, fontFamily, color: colors.textSecondary, textAlign: "center", maxWidth: 320 }}>{t("chatNotFound.body")}</Text>
          <TextButton title={t("backToChats")} onPress={() => controller.selectRoom(null)} />
        </>
      ) : (
        <ActivityIndicator color={colors.textSecondary} />
      )}
    </View>
  );
}

function EmptyDetail() {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.chatBg, gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: colors.serviceChip,
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 6,
        }}
      >
        <Icon name="chat" size={16} color={colors.serviceChipText} />
        <Text style={{ fontSize: 14, fontWeight: "500", fontFamily, color: colors.serviceChipText }}>{t("selectChat")}</Text>
      </View>
    </View>
  );
}

export function MainScreen() {
  const { colors } = useTheme();
  const { width } = useViewport();
  const controller = useController();
  const roomId = useAppState((s) => s.selectedRoomId);
  const infoOpen = useAppState((s) => s.roomInfoOpen);
  const stored = useAppState((s) => s.prefs.sidebarWidth);
  const [live, setLive] = useState<number | null>(null);
  const split = width >= SPLIT_BREAKPOINT;

  if (split) {
    const sidebar = live ?? (stored ? clampSidebar(stored, width) : autoSidebar(width));
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}>
        <View style={{ width: sidebar, borderRightWidth: 1, borderRightColor: colors.separator, zIndex: 5 }}>
          <SidebarNav />
          <SidebarResizer
            width={sidebar}
            clamp={(w) => clampSidebar(w, width)}
            onLive={setLive}
            onCommit={(w) => controller.setPreferences({ sidebarWidth: w })}
          />
        </View>
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
            {roomId ? (
              <RoomGate roomId={roomId}>
                <View style={{ flex: 1, flexDirection: "row" }}>
                  <View style={{ flex: 1 }}>
                    <ChatPane roomId={roomId} onInfo={() => controller.openRoomInfo(!infoOpen)} />
                  </View>
                  <SlidePanel mode="dock" open={infoOpen}>
                    <RoomInfoPanel roomId={roomId} mode="dock" />
                  </SlidePanel>
                </View>
              </RoomGate>
            ) : (
              <EmptyDetail />
            )}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <SlideStack
        list={<SidebarNav />}
        detail={
          roomId ? (
            <RoomGate roomId={roomId}>
              <View style={{ flex: 1 }}>
                <ChatPane roomId={roomId} onBack={() => controller.selectRoom(null)} onInfo={() => controller.openRoomInfo(true)} />
                <SlidePanel mode="overlay" open={infoOpen}>
                  <RoomInfoPanel roomId={roomId} mode="overlay" />
                </SlidePanel>
              </View>
            </RoomGate>
          ) : null
        }
      />
    </View>
  );
}
