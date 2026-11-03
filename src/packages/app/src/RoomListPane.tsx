import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Animated, Easing, FlatList, Pressable, Text, View } from "react-native";
import { contentText, stripReplyFallback, type RoomSummary } from "@ohmatrix/core";
import {
  Avatar,
  Banner,
  fontFamily,
  IconButton,
  Menu,
  RoomRow,
  Pulse,
  RoomRowSkeleton,
  SearchField,
  SkeletonBlock,
  useTheme,
  type Anchor,
  useNavBottom,
} from "@ohmatrix/ui";
import { NewChatDialog, NewGroupDialog } from "./NewChatDialogs.js";
import { NewSpaceDialog, SpaceScreen } from "./SpaceScreen.js";
import { ExploreScreen } from "./ExploreScreen.js";
import { JoiningRows } from "./JoiningRows.js";
import { useJoining } from "./joining.js";
import { MessageResults } from "./MessageResults.js";
import { PromptDialog } from "./PromptDialog.js";
import { SecuritySheet } from "./SecuritySheet.js";
import { useMediaUrl } from "./useMedia.js";
import { useAppState, useController, useLocale, useT } from "./context.js";
import { PullToRefresh } from "./PullToRefresh.js";
import { useRail } from "./railContext.js";
import { formatListTime, typingLabel } from "./format.js";

const NONE: RoomSummary[] = [];

function previewOf(room: RoomSummary, t: ReturnType<typeof useT>): string {
  if (room.invite) return t("invite.from", { name: room.invite.inviter });
  if (room.typing?.length) return typingLabel(room.typing, t, room.isDirect);
  const m = room.lastMessage;
  if (!m) return t("noMessages");
  const body = (
    m.content.kind === "image"
      ? `📷 ${t("photo")}`
      : m.content.kind === "video"
        ? `🎬 ${t("video")}`
        : m.content.kind === "audio"
          ? m.content.voice
            ? `🎤 ${t("voiceMessage")}`
            : `🎵 ${m.content.name}`
          : stripReplyFallback(contentText(m.content))
  )
    .replace(/\s+/g, " ")
    .trim();
  if (m.content.kind === "service") return body;
  if (m.isOwn) return `${t("you")}: ${body}`;
  return room.isDirect ? body : `${m.senderName}: ${body}`;
}

/**
 * One row. It is memoised: the list hands the same `room` object back for a room that did not change (the engine reuses
 * it), and `now` is rounded to the minute and the callbacks are stable, so a row is drawn again only when it has to be.
 */
export const RoomListItem = memo(function RoomListItem(props: {
  room: RoomSummary;
  selected: boolean;
  now: number;
  onMenu: (room: RoomSummary, anchor: Anchor) => void;
  /** Tapping a space opens its contents instead of a timeline. */
  onOpenSpace?: ((id: string) => void) | undefined;
  /** Only the picture, in the narrow strip. */
  compact?: boolean | undefined;
}) {
  const t = useT();
  const locale = useLocale();
  const controller = useController();
  const { room } = props;
  const avatar = useMediaUrl(room.avatar, { width: 104, height: 104, fit: "crop" });
  return (
    <RoomRow
      compact={props.compact}
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
      isSpace={!!room.isSpace}
      onPress={() => {
        if (room.invite) return;
        if (room.isSpace && props.onOpenSpace) props.onOpenSpace(room.id);
        else controller.selectRoom(room.id);
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
});

export function RoomListPane() {
  const rail = useRail();
  const { colors } = useTheme();
  const nav = useNavBottom();
  const t = useT();
  const controller = useController();
  const rooms = useAppState((s) => s.rooms);
  const selected = useAppState((s) => s.selectedRoomId);
  const syncing = useAppState((s) => s.syncState === "syncing");
  const security = useAppState((s) => s.security);
  const settled = useAppState((s) => s.roomsSettled);
  const joining = useJoining();
  const profile = useAppState((s) => s.profile);
  // Until the first connection the name that was kept from last time is shown; once connected, a break in the connection is shown again as such.
  const [connectedOnce, setConnectedOnce] = useState(syncing);
  useEffect(() => {
    if (syncing) setConnectedOnce(true);
  }, [syncing]);
  const myAvatar = useMediaUrl(profile?.avatar, { width: 68, height: 68, fit: "crop" });
  const plusRef = useRef<ComponentRef<typeof View>>(null);
  const pullToRefresh = useAppState((s) => s.prefs.pullToRefresh);
  // The mark stays a moment even when nothing needed doing, so the pull is seen to have been taken.
  const refresh = useCallback(async () => {
    await Promise.all([controller.refresh(), new Promise<void>((resolve) => setTimeout(() => resolve(), 700))]);
  }, [controller]);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [roomMenu, setRoomMenu] = useState<{ room: RoomSummary; anchor: Anchor } | null>(null);
  const [dialog, setDialog] = useState<"chat" | "group" | "join" | "space" | "explore" | null>(null);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState("");
  const space = useAppState((s) => s.spaceId);
  // The time a row shows only changes by the minute, and rows are drawn again only when this does.
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const onMenu = useCallback((room: RoomSummary, a: Anchor) => setRoomMenu({ room, anchor: a }), []);
  const onOpenSpace = useCallback((id: string) => controller.openSpace(id), [controller]);

  const data = useMemo(() => {
    const q = rail ? "" : query.trim().toLowerCase(); // the search field is not there in the strip
    return q ? rooms.filter((r) => r.name.toLowerCase().includes(q)) : rooms;
  }, [rooms, query, rail]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {rail && (
        // The strip: my picture, the plus button, then the chats' pictures. The pictures have the size and the room around them that they have in the list.
        <View style={{ paddingTop: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("profile")}
            onPress={() => controller.openSidebarPage("profile")}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
              marginHorizontal: 6,
              paddingHorizontal: 8,
              paddingVertical: 7,
              borderRadius: 12,
              backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
            })}
          >
            {profile ? (
              <Avatar id={profile.userId} name={profile.displayName ?? "?"} size={44} src={myAvatar} />
            ) : (
              <Pulse>
                <SkeletonBlock width={44} height={44} circle />
              </Pulse>
            )}
          </Pressable>
          <View style={{ alignItems: "center", paddingTop: 2 }}>
            <View ref={plusRef}>
              <IconButton
                icon="plus"
                label={t("newChat.menu")}
                size={28}
                box={44}
                onPress={() =>
                  plusRef.current?.measureInWindow((x, y, width, height) => {
                    setAnchor({ x, y, width, height });
                    setAddMenu(true);
                  })
                }
              />
            </View>
          </View>
        </View>
      )}
      {!rail && (
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
              {/* Until the profile has come (the picture and the name are read from the server), grey shapes stand where they will be. */}
              {profile ? (
                <Avatar id={profile.userId} name={profile.displayName ?? "?"} size={34} src={myAvatar} />
              ) : (
                <Pulse>
                  <SkeletonBlock width={34} height={34} circle />
                </Pulse>
              )}
              {/* One line, fixed bar height: while connecting the status takes the name's place, styled like the name. */}
              {syncing && !profile ? (
                <Pulse>
                  <SkeletonBlock width={110} height={20} />
                </Pulse>
              ) : (
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 17, lineHeight: 22, fontWeight: "700", fontFamily, color: colors.text }}>
                  {syncing || (profile && !connectedOnce) ? (profile?.displayName ?? "") : t("connecting")}
                </Text>
              )}
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
      )}
      {!rail && (security === "needs_setup" || security === "needs_recovery") && (
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
        alignRight={!rail}
        onClose={() => setAddMenu(false)}
        items={[
          { label: t("newChat"), icon: "user", onPress: () => setDialog("chat") },
          { label: t("newGroup"), icon: "users", onPress: () => setDialog("group") },
          { label: t("newSpace"), icon: "users", onPress: () => setDialog("space") },
          { label: t("joinRoom"), icon: "hash", onPress: () => setDialog("join") },
          { label: t("explore"), icon: "globe", onPress: () => setDialog("explore") },
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
      <ExploreScreen visible={dialog === "explore"} onClose={() => setDialog(null)} />
      <NewSpaceDialog visible={dialog === "space"} onClose={() => setDialog(null)} />
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
      <PullToRefresh<RoomSummary> enabled={pullToRefresh} onRefresh={refresh}>
        {(scroll) => (
          <FlatList
            {...scroll}
            ref={scroll.listRef}
            data={settled ? data : NONE}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ paddingTop: rail ? 0 : 4, paddingBottom: 4 + nav }}
            ListHeaderComponent={<>{joining.length && !query.trim() && !rail ? <JoiningRows rooms={joining} /> : null}</>}
            ListFooterComponent={
              query.trim().length >= 2 && !rail ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 13, fontFamily, color: colors.textSecondary, marginLeft: 18, marginBottom: 4 }}>{t("search.messages")}</Text>
                  <MessageResults term={query} showRoom onPick={(r) => controller.openMessage(r.roomId, r.eventId)} />
                </View>
              ) : (
                <View />
              )
            }
            ListEmptyComponent={
              settled ? (
                rail ? null : (
                  <Text style={{ textAlign: "center", marginTop: 48, fontSize: 15, fontFamily, color: colors.textSecondary }}>
                    {query ? t("noResults") : t("noChats")}
                  </Text>
                )
              ) : (
                <View>
                  {Array.from({ length: 12 }, (_, i) => (
                    <RoomRowSkeleton key={i} index={i} compact={rail} />
                  ))}
                </View>
              )
            }
            renderItem={({ item }) => (
              <RoomListItem room={item} selected={selected === item.id} now={now} onOpenSpace={onOpenSpace} onMenu={onMenu} compact={rail} />
            )}
          />
        )}
      </PullToRefresh>
      {!rail && <SlideOverSpace open={space !== null} id={space} />}
    </View>
  );
}

/** The space's contents, sliding in from the right over the chat list (and back out when closed). */
function SlideOverSpace(props: { open: boolean; id: string | null }) {
  const { colors } = useTheme();
  const controller = useController();
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(props.open ? 1 : 0)).current;
  const [mounted, setMounted] = useState(props.open);
  // Keep showing the last space while the slide-out runs (closing clears the id).
  const [shown, setShown] = useState<string | null>(props.id);
  useEffect(() => {
    if (props.open && props.id) {
      setShown(props.id);
      setMounted(true);
    }
    Animated.timing(progress, { toValue: props.open ? 1 : 0, duration: 280, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: false }).start(
      ({ finished }) => {
        if (finished && !props.open) setMounted(false);
      },
    );
  }, [props.open, props.id, progress]);
  if (!mounted || !shown) return null;
  return (
    <Animated.View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      pointerEvents={props.open ? "auto" : "none"}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 3,
        backgroundColor: colors.bg,
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [width || 400, 0] }) }],
      }}
    >
      <SpaceScreen id={shown} onClose={() => controller.openSpace(null)} />
    </Animated.View>
  );
}
