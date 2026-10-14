import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import type { RoomSummary, SpaceChild } from "@ohmatrix/core";
import {
  Avatar,
  Dialog,
  fontFamily,
  IconButton,
  Menu,
  NavBar,
  PrimaryButton,
  Row,
  SearchField,
  TextButton,
  useTheme,
  type Anchor,
  type MenuItem,
} from "@ohmatrix/ui";
import { useAppState, useController, useServices, useT } from "./context.js";
import { RoomListItem } from "./RoomListPane.js";
import { NewGroupDialog } from "./NewChatDialogs.js";
import { PromptDialog } from "./PromptDialog.js";
import { RoomInfoPanel } from "./RoomInfoPanel.js";
import { SlidePanel } from "./SlidePanel.js";
import { InviteDialog } from "./InviteDialog.js";

/** A space's own contents, styled exactly like the main chat list but showing the space's children. */
export function SpaceScreen(props: { id: string; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const spaceId = props.id;
  const rooms = useAppState((s) => s.rooms);
  const selected = useAppState((s) => s.selectedRoomId);
  const [children, setChildren] = useState<SpaceChild[]>([]);
  const [query, setQuery] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<Anchor | null>(null);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<"create" | "add" | "manage" | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [roomMenu, setRoomMenu] = useState<{ room: RoomSummary; anchor: Anchor } | null>(null);
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const now = Date.now();

  const space = rooms.find((r) => r.id === spaceId);

  useEffect(() => {
    if (!spaceId) return;
    setChildren([]);
    return controller.subscribeSpace(spaceId, setChildren);
  }, [controller, spaceId]);

  // Children that are also joined rooms keep their live unread counts and last message from the room list.
  const rows = useMemo(() => {
    const list: { id: string; name: string; avatar?: RoomSummary["avatar"]; isSpace: boolean; room?: RoomSummary; child: SpaceChild }[] = children.map((c) => {
      const room = rooms.find((r) => r.id === c.roomId);
      return {
        id: c.roomId,
        name: room?.name ?? c.name,
        ...(room?.avatar ? { avatar: room.avatar } : c.avatar ? { avatar: c.avatar } : {}),
        isSpace: c.isSpace,
        ...(room ? { room } : {}),
        child: c,
      };
    });
    const q = query.trim().toLowerCase();
    return q ? list.filter((r) => r.name.toLowerCase().includes(q)) : list;
  }, [children, rooms, query, spaceId]);

  // Members and settings use the same info panel rooms have, opened for the space on its own: the chat on screen
  // stays as it is, and closing the panel returns to this list.
  const openInfo = () => controller.openSpaceInfo(true);
  const infoOpen = useAppState((s) => s.spaceInfoOpen);
  const action: MenuItem[] = [
    { label: t("space.createRoom"), icon: "plus", onPress: () => setDialog("create") },
    { label: t("space.addRoom"), icon: "chat", onPress: () => setDialog("add") },
    { label: t("space.manageRooms"), icon: "edit", onPress: () => setDialog("manage") },
    { label: t("space.members"), icon: "users", onPress: () => openInfo() },
    { label: t("space.invite"), icon: "userPlus", onPress: () => setInviting(true) },
    {
      label: t("space.share"),
      icon: "hash",
      onPress: () => setSharing(true),
    },
    { label: t("space.settings"), icon: "gear", onPress: () => openInfo() },
    { label: t("space.leave"), icon: "signOut", danger: true, onPress: () => setLeaving(true) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavBar
        title={space?.name ?? t("space")}
        onBack={props.onClose}
        backLabel={t("back")}
        trailing={
          <View ref={moreRef}>
            <IconButton
              icon="more"
              label={t("more")}
              size={22}
              color={colors.textSecondary}
              onPress={() =>
                moreRef.current?.measureInWindow((x, y, width, height) => {
                  setMenuAnchor({ x, y, width, height });
                  setMenu(true);
                })
              }
            />
          </View>
        }
      />
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 }}>
        <SearchField value={query} onChangeText={setQuery} placeholder={t("search")} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingVertical: 4 }}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 48, fontSize: 15, fontFamily, color: colors.textSecondary }}>
            {query ? t("noResults") : t("space.empty")}
          </Text>
        }
        renderItem={({ item }) =>
          item.room ? (
            <RoomListItem
              room={item.room}
              selected={selected === item.id}
              now={now}
              onMenu={(room, a) => setRoomMenu({ room, anchor: a })}
              onOpenSpace={(id) => controller.openSpace(id)}
            />
          ) : (
            // Not joined yet: shown greyed, tapping joins through the space.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => void controller.joinRoom(item.child.via?.[0] ? `${item.id}?via=${item.child.via[0]}` : item.id).catch(() => {})}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
                marginHorizontal: 6,
                paddingHorizontal: 8,
                height: 62,
                borderRadius: 12,
                backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
              })}
            >
              <Avatar id={item.id} name={item.name} size={44} shape={item.isSpace ? "square" : "circle"} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", fontFamily, color: colors.text }}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 15, fontFamily, color: colors.textSecondary }}>
                  {t("space.joinToView")}
                </Text>
              </View>
            </Pressable>
          )
        }
      />
      <Menu visible={menu} anchor={menuAnchor} alignRight onClose={() => setMenu(false)} items={action} />
      <Menu
        visible={!!roomMenu}
        anchor={roomMenu?.anchor ?? null}
        onClose={() => setRoomMenu(null)}
        items={
          roomMenu && spaceId
            ? [
                { label: t("space.moveFirst"), icon: "send", onPress: () => void controller.moveSpaceChild(spaceId, roomMenu.room.id, "first") },
                { label: t("space.moveLast"), icon: "signOut", onPress: () => void controller.moveSpaceChild(spaceId, roomMenu.room.id, "last") },
                { label: t("space.removeRoom"), icon: "close", danger: true, onPress: () => void controller.removeSpaceChild(spaceId, roomMenu.room.id) },
              ]
            : []
        }
      />
      <NewGroupDialog visible={dialog === "create"} onClose={() => setDialog(null)} inSpace={spaceId} />
      <AddRoomsDialog visible={dialog === "add"} onClose={() => setDialog(null)} />
      <ManageRoomsDialog visible={dialog === "manage"} onClose={() => setDialog(null)} />
      <ShareDialog visible={sharing} spaceId={spaceId} name={space?.name ?? ""} onClose={() => setSharing(false)} />
      <InviteDialog visible={inviting} roomId={spaceId} onClose={() => setInviting(false)} />
      <Dialog visible={leaving} title={t("leaveSpace.title")} message={t("leaveSpace.body")} onClose={() => setLeaving(false)}>
        <PrimaryButton
          title={t("space.leave")}
          onPress={() => {
            setLeaving(false);
            void controller.leaveRoom(spaceId).catch(() => {});
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setLeaving(false)} />
      </Dialog>
      {/* The space's info covers the space's own list, nothing wider: in landscape that is the left pane. */}
      <SlidePanel mode="overlay" open={infoOpen}>
        <RoomInfoPanel roomId={spaceId} mode="overlay" />
      </SlidePanel>
    </View>
  );
}

/** Pick rooms I am already in that are not part of the space yet. */
function AddRoomsDialog(props: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const spaceId = useAppState((s) => s.spaceId);
  const [candidates, setCandidates] = useState<SpaceChild[]>([]);
  useEffect(() => {
    if (!props.visible || !spaceId) return;
    void controller.spaceCandidates(spaceId).then(setCandidates, () => setCandidates([]));
  }, [props.visible, spaceId, controller]);
  return (
    <Dialog visible={props.visible} title={t("space.addRoom")} onClose={props.onClose}>
      {candidates.length === 0 ? (
        <Text style={{ padding: 12, textAlign: "center", fontSize: 14, fontFamily, color: colors.textSecondary }}>{t("space.noCandidates")}</Text>
      ) : (
        <ScrollView style={{ maxHeight: 320 }}>
          {candidates.map((c) => (
            <Row
              key={c.roomId}
              label={c.name}
              icon="chat"
              chevron={false}
              onPress={() => {
                if (!spaceId) return;
                void controller.addSpaceChild(spaceId, c.roomId).then(() => setCandidates((list) => list.filter((x) => x.roomId !== c.roomId)));
              }}
            />
          ))}
        </ScrollView>
      )}
      <TextButton title={t("close")} onPress={props.onClose} />
    </Dialog>
  );
}

/** Select rooms and remove them from the space. */
function ManageRoomsDialog(props: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const spaceId = useAppState((s) => s.spaceId);
  const [children, setChildren] = useState<SpaceChild[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!props.visible || !spaceId) return;
    setPicked(new Set());
    return controller.subscribeSpace(spaceId, setChildren);
  }, [props.visible, spaceId, controller]);
  return (
    <Dialog visible={props.visible} title={t("space.manageRooms")} onClose={props.onClose}>
      {children.length === 0 && (
        <Text style={{ padding: 12, textAlign: "center", fontSize: 14, fontFamily, color: colors.textSecondary }}>{t("space.empty")}</Text>
      )}
      <ScrollView style={{ maxHeight: 320 }}>
        {children.map((c) => (
          <Row
            key={c.roomId}
            label={c.name}
            icon="chat"
            checked={picked.has(c.roomId)}
            chevron={false}
            onPress={() =>
              setPicked((cur) => {
                const next = new Set(cur);
                if (next.has(c.roomId)) next.delete(c.roomId);
                else next.add(c.roomId);
                return next;
              })
            }
          />
        ))}
      </ScrollView>
      <PrimaryButton
        title={t("space.removeRooms", { n: picked.size })}
        disabled={picked.size === 0}
        onPress={() => {
          if (!spaceId) return;
          void Promise.all([...picked].map((id) => controller.removeSpaceChild(spaceId, id))).then(() => {
            setPicked(new Set());
            props.onClose();
          });
        }}
      />
      <TextButton title={t("cancel")} onPress={props.onClose} />
    </Dialog>
  );
}

/** Shows the link to a space and copies it on request. A public address reads better than the room id, so use it when there is one. */
function ShareDialog(props: { visible: boolean; spaceId: string; name: string; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const services = useServices();
  const [alias, setAlias] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!props.visible) return;
    setCopied(false);
    setFailed(false);
    setAlias(null);
    return controller.subscribeRoomDetails(props.spaceId, (d) => setAlias(d.alias ?? null));
  }, [props.visible, props.spaceId, controller]);
  const link = `https://matrix.to/#/${alias ?? props.spaceId}`;
  const copy = () => {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator;
    const write = services.copyText ?? nav?.clipboard?.writeText.bind(nav.clipboard);
    if (!write) return setFailed(true);
    void write(link).then(
      () => {
        setCopied(true);
        setTimeout(props.onClose, 700);
      },
      () => setFailed(true),
    );
  };
  return (
    <Dialog visible={props.visible} title={t("space.share.title")} message={t("space.share.body", { name: props.name })} onClose={props.onClose}>
      <View accessibilityLabel={t("space.share.link")} style={{ padding: 12, borderRadius: 10, backgroundColor: colors.bgSecondary }}>
        <Text selectable style={{ fontSize: 14, lineHeight: 20, fontFamily, color: colors.text, textAlign: "center" }}>
          {link}
        </Text>
      </View>
      {failed && <Text style={{ fontSize: 13, fontFamily, color: colors.danger, textAlign: "center" }}>{t("space.share.failed")}</Text>}
      <PrimaryButton title={copied ? t("copied") : t("copy")} disabled={copied} onPress={copy} />
      <TextButton title={t("cancel")} onPress={props.onClose} />
    </Dialog>
  );
}

/** Name prompt used by the "+ → New space" entry. */
export function NewSpaceDialog(props: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const controller = useController();
  return (
    <PromptDialog
      visible={props.visible}
      title={t("space.new")}
      message={t("space.new.body")}
      confirmLabel={t("create")}
      fields={[{ label: t("space.name"), placeholder: t("space.namePlaceholder") }]}
      onClose={props.onClose}
      onConfirm={([name]) => controller.createSpace(name!)}
    />
  );
}
