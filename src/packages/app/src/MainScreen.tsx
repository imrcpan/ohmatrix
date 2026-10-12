import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { Icon, fontFamily, useTheme } from "@ohmatrix/ui";
import { ChatPane } from "./ChatPane.js";
import { RoomInfoPanel } from "./RoomInfoPanel.js";
import { SlidePanel } from "./SlidePanel.js";
import { useAppState, useController, useT } from "./context.js";
import { autoSidebar, clampSidebar } from "./layout.js";
import { SidebarNav } from "./SidebarNav.js";
import { SidebarResizer } from "./SidebarResizer.js";
import { SlideStack } from "./SlideStack.js";

/** Width at which we switch from single-column (portrait/phone) to two-pane (landscape/desktop). */
export const SPLIT_BREAKPOINT = 760;

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
  const { width } = useWindowDimensions();
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
        <View style={{ flex: 1 }}>
          {roomId ? (
            <View style={{ flex: 1, flexDirection: "row" }}>
              <View style={{ flex: 1 }}>
                <ChatPane key={roomId} roomId={roomId} onInfo={() => controller.openRoomInfo(!infoOpen)} />
              </View>
              <SlidePanel mode="dock" open={infoOpen}>
                <RoomInfoPanel roomId={roomId} mode="dock" />
              </SlidePanel>
            </View>
          ) : (
            <EmptyDetail />
          )}
        </View>
      </View>
    );
  }
  return (
    <SlideStack
      list={<SidebarNav />}
      detail={
        roomId ? (
          <View style={{ flex: 1 }}>
            <ChatPane key={roomId} roomId={roomId} onBack={() => controller.selectRoom(null)} onInfo={() => controller.openRoomInfo(true)} />
            <SlidePanel mode="overlay" open={infoOpen}>
              <RoomInfoPanel roomId={roomId} mode="overlay" />
            </SlidePanel>
          </View>
        ) : null
      }
    />
  );
}
