import { useMemo, useRef, useState, type ComponentRef } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { contentText, type RoomSummary } from "@ohmatrix/core";
import { Avatar, Banner, fontFamily, IconButton, Menu, RoomRow, SearchField, useTheme, type Anchor } from "@ohmatrix/ui";
import { NewChatDialog, NewGroupDialog } from "./NewChatDialogs.js";
import { MessageResults } from "./MessageResults.js";
import { PromptDialog } from "./PromptDialog.js";
import { SecuritySheet } from "./SecuritySheet.js";
import { useMediaUrl } from "./useMedia.js";
import { useAppState, useController, useLocale, useT } from "./context.js";
import { formatListTime, typingLabel } from "./format.js";

function previewOf(room: RoomSummary, t: ReturnType<typeof useT>): string {
  if (room.invite) return t("invite.from", { name: room.invite.inviter });
  if (room.typing?.length) return typingLabel(room.typing, t, room.isDirect);
  const m = room.lastMessage;
  if (!m) return t("noMessages");
  const body = (m.content.kind === "image" ? `📷 ${t("photo")}` : contentText(m.content)).replace(/\s+/g, " ").trim();
  if (m.content.kind === "service") return body;
  if (m.isOwn) return `${t("you")}: ${body}`;
  return room.isDirect ? body : `${m.senderName}: ${body}`;
}

function RoomListItem(props: { room: RoomSummary; selected: boolean; now: number; onMenu: (room: RoomSummary, anchor: Anchor) => void }) {
  const t = useT();
  const locale = useLocale();
  const controller = useController();
  const { room } = props;
  const avatar = useMediaUrl(room.avatar, { width: 104, height: 104, fit: "crop" });
  return (
    <RoomRow
      id={room.id}
      title={room.name}
      preview={previewOf(room, t)}
      time={formatListTime(room.lastActivityTs, props.now, locale)}
      unread={room.unreadCount}
      highlight={room.highlightCount > 0}
      selected={props.selected}
      avatarUrl={avatar}
      pinned={room.pinned}
      markedUnread={room.markedUnread}
      muted={room.muted}
      onContextMenu={room.invite ? undefined : (anchor) => props.onMenu(room, anchor)}
      onPress={() => {
        if (!room.invite) controller.selectRoom(room.id);
      }}
      invite={
        room.invite && {
          acceptLabel: t("accept"),
          declineLabel: t("decline"),
          onAccept: () => void controller.acceptInvite(room.id),
          onDecline: () => void controller.declineInvite(room.id),
        }
      }
    />
  );
}

export function RoomListPane() {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const rooms = useAppState((s) => s.rooms);
  const selected = useAppState((s) => s.selectedRoomId);
  const syncing = useAppState((s) => s.syncState === "syncing");
  const security = useAppState((s) => s.security);
  const profile = useAppState((s) => s.profile);
  const myAvatar = useMediaUrl(profile?.avatar, { width: 68, height: 68, fit: "crop" });
  const plusRef = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [roomMenu, setRoomMenu] = useState<{ room: RoomSummary; anchor: Anchor } | null>(null);
  const [dialog, setDialog] = useState<"chat" | "group" | "join" | null>(null);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState("");
  const now = Date.now();

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rooms.filter((r) => r.name.toLowerCase().includes(q)) : rooms;
  }, [rooms, query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 44 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("profile")}
            onPress={() => controller.openSidebarPage("profile")}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              flexShrink: 1,
              paddingVertical: 2,
              paddingHorizontal: 4,
              borderRadius: 10,
              backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
            })}
          >
            <Avatar id={profile?.userId ?? "?"} name={profile?.displayName ?? "?"} size={34} src={myAvatar} />
            {/* One line, fixed bar height: while connecting the status takes the name's place, styled like the name. */}
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 17, lineHeight: 22, fontWeight: "700", fontFamily, color: colors.text }}>
              {syncing ? (profile?.displayName ?? "") : t("connecting")}
            </Text>
          </Pressable>
          <View ref={plusRef}>
            <IconButton
              icon="plus"
              label={t("newChat.menu")}
              size={24}
              onPress={() =>
                plusRef.current?.measureInWindow((x, y, width, height) => {
                  setAnchor({ x, y, width, height });
                  setAddMenu(true);
                })
              }
            />
          </View>
        </View>
        <SearchField value={query} onChangeText={setQuery} placeholder={t("search")} />
      </View>
      {(security === "needs_setup" || security === "needs_recovery") && (
        <Banner
          text={t(security === "needs_setup" ? "sec.banner.setup" : "sec.banner.recovery")}
          actionLabel={t(security === "needs_setup" ? "sec.action.setup" : "sec.action.verify")}
          onAction={() => setSheet(true)}
        />
      )}
      <SecuritySheet visible={sheet} onClose={() => setSheet(false)} />
      <Menu
        visible={addMenu}
        anchor={anchor}
        alignRight
        onClose={() => setAddMenu(false)}
        items={[
          { label: t("newChat"), icon: "user", onPress: () => setDialog("chat") },
          { label: t("newGroup"), icon: "users", onPress: () => setDialog("group") },
          { label: t("joinRoom"), icon: "hash", onPress: () => setDialog("join") },
        ]}
      />
      <Menu
        visible={!!roomMenu}
        anchor={roomMenu?.anchor ?? null}
        onClose={() => setRoomMenu(null)}
        items={
          roomMenu
            ? [
                {
                  label: roomMenu.room.pinned ? t("unpin") : t("pin"),
                  icon: "pin",
                  onPress: () => void controller.setPinned(roomMenu.room.id, !roomMenu.room.pinned),
                },
                {
                  label: roomMenu.room.muted ? t("unmute") : t("mute"),
                  icon: roomMenu.room.muted ? "bell" : "bellOff",
                  onPress: () => void controller.setRoomMuted(roomMenu.room.id, !roomMenu.room.muted),
                },
                roomMenu.room.markedUnread || roomMenu.room.unreadCount > 0
                  ? { label: t("markRead"), icon: "mailUnread", onPress: () => void controller.markRoomRead(roomMenu.room.id) }
                  : { label: t("markUnread"), icon: "mailUnread", onPress: () => void controller.setMarkedUnread(roomMenu.room.id, true) },
              ]
            : []
        }
      />
      <NewChatDialog visible={dialog === "chat"} onClose={() => setDialog(null)} />
      <NewGroupDialog visible={dialog === "group"} onClose={() => setDialog(null)} />
      <PromptDialog
        visible={dialog === "join"}
        title={t("joinRoom")}
        message={t("joinRoom.body")}
        confirmLabel={t("join")}
        fields={[{ label: t("roomIdOrAlias"), placeholder: "#room:server" }]}
        onClose={() => setDialog(null)}
        onConfirm={([id]) => controller.joinRoom(id!)}
      />
      <FlatList
        data={data}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingVertical: 4 }}
        ListFooterComponent={
          query.trim().length >= 2 ? (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 13, fontFamily, color: colors.textSecondary, marginLeft: 18, marginBottom: 4 }}>{t("search.messages")}</Text>
              <MessageResults term={query} showRoom onPick={(r) => controller.openMessage(r.roomId, r.eventId)} />
            </View>
          ) : (
            <View />
          )
        }
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 48, fontSize: 15, fontFamily, color: colors.textSecondary }}>
            {query ? t("noResults") : t("noChats")}
          </Text>
        }
        renderItem={({ item }) => (
          <RoomListItem
            room={item}
            selected={selected === item.id}
            now={now}
            onMenu={(room, a) => {
              setRoomMenu({ room, anchor: a });
            }}
          />
        )}
      />
    </View>
  );
}
