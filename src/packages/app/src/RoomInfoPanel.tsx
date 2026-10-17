import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { EngineError, type MemberRole, type RoomDetails, type RoomMember, type SpaceChild, contentText } from "@ohmatrix/core";
import { Avatar, Dialog, fontFamily, Icon, Menu, PrimaryButton, TextButton, Toggle, useTheme, type Anchor, type MenuItem } from "@ohmatrix/ui";
import { useAppState, useController, useServices, useT } from "./context.js";
import { InviteDialog } from "./InviteDialog.js";
import { PromptDialog } from "./PromptDialog.js";
import { levelLabel, RoomSettingsSections } from "./RoomSettings.js";
import { Group, Item, PageHeader } from "./settings/kit.js";
import { SharedMedia } from "./SharedMedia.js";
import { AvatarViewer } from "./AvatarViewer.js";
import { useMediaUrl } from "./useMedia.js";

const ROLE_POWER: Record<MemberRole, number> = { member: 0, moderator: 50, admin: 100 };

function MemberRow(props: { member: RoomMember; onPress?: ((anchor: Anchor) => void) | undefined }) {
  const { colors } = useTheme();
  const t = useT();
  const m = props.member;
  const avatar = useMediaUrl(m.avatar, { width: 72, height: 72, fit: "crop" });
  const tag = m.invited
    ? t("invited")
    : m.power === 100 || !Number.isFinite(m.power)
      ? t("role.admin")
      : m.power === 50
        ? t("role.moderator")
        : m.power > 100
          ? levelLabel(m.power, t)
          : m.power > 0
            ? t("level.custom", { n: m.power })
            : null;
  const body = (hovered?: boolean, pressed?: boolean) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 54,
        marginHorizontal: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      }}
    >
      <Avatar id={m.userId} name={m.name} size={36} src={avatar} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontFamily, color: colors.text }}>
          {m.name}
        </Text>
        <Text numberOfLines={1} selectable style={{ fontSize: 13, fontFamily, color: colors.textSecondary }}>
          {m.userId}
        </Text>
      </View>
      {tag && <Text style={{ fontSize: 13, fontFamily, color: m.invited ? colors.textSecondary : colors.accent }}>{tag}</Text>}
      {props.onPress && <Icon name="more" size={18} color={colors.textTertiary} />}
    </View>
  );
  if (!props.onPress) return body();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={m.name}
      onPress={(e) => {
        const n = e.nativeEvent as { pageX?: number; pageY?: number };
        props.onPress!({ x: n.pageX ?? 0, y: n.pageY ?? 0, width: 0, height: 0 });
      }}
    >
      {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => body(hovered, pressed)}
    </Pressable>
  );
}

/** Chat info: avatar, name, topic, address, encryption, mute, members (with management), shared media, leave/delete. */
export function RoomInfoPanel(props: { roomId: string; mode: "dock" | "overlay" }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const services = useServices();
  const [d, setD] = useState<RoomDetails | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<"name" | "topic" | null>(null);
  const [inviting, setInviting] = useState(false);
  const [menu, setMenu] = useState<{ member: RoomMember; anchor: Anchor } | null>(null);
  const [removing, setRemoving] = useState<RoomMember | null>(null);
  const [leveling, setLeveling] = useState<RoomMember | null>(null);
  const [banning, setBanning] = useState<RoomMember | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const avatar = useMediaUrl(d?.avatar, { width: 192, height: 192, fit: "crop" });
  const [viewing, setViewing] = useState(false);
  const items = useAppState((s) => s.timelines[props.roomId]);

  useEffect(() => {
    setD(null);
    return controller.subscribeRoomDetails(props.roomId, setD);
  }, [controller, props.roomId]);

  // Pinned messages: only the ones already loaded can be shown (the list is state, the bodies are events).
  const pinned = useMemo(() => {
    const ids = d?.pinnedEventIds ?? [];
    return ids.map((id) => (items ?? []).find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
  }, [d?.pinnedEventIds, items]);

  const forSpace = useAppState((s) => s.spaceInfoOpen && s.spaceId === props.roomId);
  const [children, setChildren] = useState<SpaceChild[]>([]);
  useEffect(() => {
    if (!forSpace) return;
    return controller.subscribeSpace(props.roomId, setChildren);
  }, [controller, forSpace, props.roomId]);

  const direct = d?.isDirect ?? false;
  const joined = d?.members.filter((m) => !m.invited).length ?? 0;
  const title = direct ? t("userInfo") : forSpace ? t("spaceInfo") : t("groupInfo");
  const close = () => (forSpace ? controller.openSpaceInfo(false) : controller.openRoomInfo(false));
  const report = (e: unknown) => setProblem(e instanceof EngineError && e.code === "forbidden" ? t("notAllowed") : e instanceof Error ? e.message : String(e));

  const myPower = d?.members.find((m) => m.userId === d.me)?.power ?? 0;
  const maxLevel = Number.isFinite(myPower) ? myPower : 1000;
  // You can only manage people below your own level (the server enforces the same rule).
  const manageable = (m: RoomMember) => !!d && m.userId !== d.me && m.power < myPower;
  const memberMenu = (m: RoomMember): MenuItem[] => {
    if (!d) return [];
    const out: MenuItem[] = [];
    if (d.can.changeRoles && !m.invited) {
      (["admin", "moderator", "member"] as const)
        .filter((r) => ROLE_POWER[r] !== m.power && ROLE_POWER[r] <= myPower)
        .forEach((role) =>
          out.push({
            label: t(role === "admin" ? "makeAdmin" : role === "moderator" ? "makeModerator" : "makeMember"),
            icon: "user",
            onPress: () => void controller.roomAdmin.setRole(d.id, m.userId, role).catch(report),
          }),
        );
    }
    if (d.can.changeRoles && !m.invited) out.push({ label: t("setLevel"), icon: "edit", onPress: () => setLeveling(m) });
    if (d.can.kick) out.push({ label: t(m.invited ? "withdrawInvite" : "removeMember"), icon: "close", danger: true, onPress: () => setRemoving(m) });
    if (d.can.ban) out.push({ label: t("ban"), icon: "trash", danger: true, onPress: () => setBanning(m) });
    return out;
  };

  const changePhoto = async () => {
    const [file] = (await services.pickFiles?.()) ?? [];
    if (file && d) await controller.roomAdmin.setAvatar(d.id, file).catch(report);
  };
  const canEdit = !!d?.can.editInfo;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The same back arrow whether the panel is docked beside the chat or covers the screen. */}
      <PageHeader title={title} onBack={close} backLabel={t("close")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {d && (
          <>
            <View style={{ alignItems: "center", paddingTop: 12, paddingHorizontal: 20, gap: 2 }}>
              {/* Pressing the picture looks at it; changing it has its own row below. */}
              <Pressable accessibilityRole="button" accessibilityLabel={t("viewPhoto")} disabled={!d.avatar} onPress={() => setViewing(true)}>
                <Avatar id={d.id} name={d.name} size={72} src={avatar} />
              </Pressable>
              <AvatarViewer visible={viewing} onClose={() => setViewing(false)} title={d.name} avatar={d.avatar} preview={avatar} />
              <Text
                numberOfLines={2}
                style={{ marginTop: 8, fontSize: 22, fontWeight: "700", letterSpacing: -0.3, fontFamily, color: colors.text, textAlign: "center" }}
              >
                {d.name}
              </Text>
              <Text style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>
                {direct ? t("directChat") : `${forSpace ? `${t("space")} · ` : ""}${joined === 1 ? t("member.one") : t("members", { n: joined })}`}
              </Text>
            </View>
            {!!problem && (
              <Text style={{ marginTop: 12, marginHorizontal: 20, textAlign: "center", fontSize: 14, fontFamily, color: colors.danger }}>{problem}</Text>
            )}
            <Group title={t("about")}>
              {canEdit && !!services.pickFiles && <Item label={t("changePhoto")} valueIcon="camera" onPress={() => void changePhoto()} />}
              {!direct && (
                <Item
                  label={t(forSpace ? "space.name" : "room.editName")}
                  value={d.name}
                  onPress={canEdit ? () => setEdit("name") : undefined}
                  chevron={canEdit}
                />
              )}
              {(!!d.topic || canEdit) && !direct && (
                <Item label={t("topic")} value={d.topic ?? t("room.noTopic")} onPress={canEdit ? () => setEdit("topic") : undefined} chevron={canEdit} />
              )}
              <Item label={t("address")} value={d.alias ?? d.id} copyable />
              {/* A space is a container with no conversation of its own to encrypt. */}
              {!forSpace && (
                <Item
                  label={t("encryption")}
                  {...(d.isEncrypted ? { valueIcon: "lock" as const } : {})}
                  value={d.isEncrypted ? t("room.encrypted") : t("room.notEncrypted")}
                />
              )}
            </Group>
            {forSpace && (
              <Group title={`${t("space.rooms")} · ${children.length}`}>
                {children.length === 0 && <Item label={t("space.empty")} chevron={false} />}
                {children.slice(0, 30).map((c) => (
                  <Item
                    key={c.roomId}
                    label={c.name}
                    icon={c.isSpace ? "users" : "chat"}
                    // Open the room itself; its own info is one tap away there.
                    onPress={() => controller.selectRoom(c.roomId)}
                  />
                ))}
              </Group>
            )}
            {!direct && <RoomSettingsSections d={d} report={report} space={forSpace} />}
            {!forSpace && (
              <Group>
                <Item
                  label={t("mute")}
                  icon={d.muted ? "bellOff" : "bell"}
                  chevron={false}
                  right={<Toggle label={t("mute")} value={d.muted} onChange={(v) => void controller.setRoomMuted(d.id, v).catch(report)} />}
                />
              </Group>
            )}
            {!forSpace && <SharedMedia roomId={d.id} />}
            {!forSpace && pinned.length > 0 && (
              <Group title={t("pinned.title")}>
                {pinned.map((m) => (
                  <Item
                    key={m.id}
                    label={m.senderName}
                    value={m.content.kind === "image" ? t("photo") : contentText(m.content).slice(0, 60)}
                    icon="pin"
                    onPress={() => controller.openMessage(d.id, m.id)}
                  />
                ))}
              </Group>
            )}
            <Group title={direct ? t("participant") : `${t("membersTitle")} · ${d.members.length}`}>
              {d.can.invite && <Item label={t("room.invite")} icon="userPlus" chevron={false} onPress={() => setInviting(true)} />}
              {d.members.map((m) => (
                <MemberRow key={m.userId} member={m} onPress={manageable(m) && memberMenu(m).length ? (anchor) => setMenu({ member: m, anchor }) : undefined} />
              ))}
            </Group>
            <Group>
              <Item label={direct ? t("deleteChat") : forSpace ? t("space.leave") : t("leaveGroup")} danger chevron={false} onPress={() => setConfirm(true)} />
            </Group>
          </>
        )}
      </ScrollView>
      <Menu visible={!!menu} anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} items={menu ? memberMenu(menu.member) : []} />
      <PromptDialog
        visible={edit === "name"}
        title={t(forSpace ? "space.name" : "room.editName")}
        message=""
        confirmLabel={t("save")}
        initial={[d?.name ?? ""]}
        fields={[{ label: t(forSpace ? "space.name" : "room.editName") }]}
        onClose={() => setEdit(null)}
        onConfirm={([v]) => controller.roomAdmin.setName(props.roomId, v!)}
      />
      <PromptDialog
        visible={edit === "topic"}
        title={t("room.editTopic")}
        message=""
        confirmLabel={t("save")}
        initial={[d?.topic ?? ""]}
        fields={[{ label: t("room.editTopic"), optional: true, multiline: true }]}
        onClose={() => setEdit(null)}
        onConfirm={([v]) => controller.roomAdmin.setTopic(props.roomId, v ?? "")}
      />
      <PromptDialog
        visible={!!leveling}
        title={t("setLevel")}
        message={t("level.custom.body", { max: maxLevel })}
        confirmLabel={t("save")}
        initial={[String(leveling?.power ?? 0)]}
        fields={[{ label: t("level.field") }]}
        onClose={() => setLeveling(null)}
        onConfirm={async ([v]) => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0 || n > maxLevel) throw new Error(t("level.invalid", { max: maxLevel }));
          if (leveling && d) await controller.roomAdmin.setPower(d.id, leveling.userId, n);
        }}
      />
      <PromptDialog
        visible={!!banning}
        title={banning ? t("ban.title", { name: banning.name }) : ""}
        message={t("ban.body")}
        confirmLabel={t("ban")}
        fields={[{ label: t("ban.reason"), optional: true }]}
        onClose={() => setBanning(null)}
        onConfirm={async ([v]) => {
          if (banning && d) await controller.roomAdmin.ban(d.id, banning.userId, v);
        }}
      />
      <InviteDialog visible={inviting} roomId={props.roomId} onClose={() => setInviting(false)} />
      <Dialog
        visible={!!removing}
        title={removing ? t(removing.invited ? "withdrawInvite.title" : "removeMember.title", { name: removing.name }) : ""}
        message={removing && !removing.invited ? t("removeMember.body") : ""}
        onClose={() => setRemoving(null)}
      >
        <PrimaryButton
          title={t(removing?.invited ? "withdrawInvite" : "removeMember")}
          loading={busy}
          onPress={() => {
            if (!removing || !d) return;
            setBusy(true);
            controller.roomAdmin
              .kick(d.id, removing.userId)
              .catch(report)
              .finally(() => {
                setBusy(false);
                setRemoving(null);
              });
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setRemoving(null)} />
      </Dialog>
      <Dialog
        visible={confirm}
        title={t(direct ? "deleteChat.title" : forSpace ? "leaveSpace.title" : "leaveGroup.title")}
        message={t(direct ? "deleteChat.body" : forSpace ? "leaveSpace.body" : "leaveGroup.body")}
        onClose={() => setConfirm(false)}
      >
        <PrimaryButton
          title={direct ? t("deleteChat") : forSpace ? t("space.leave") : t("leaveGroup")}
          loading={busy}
          onPress={() => {
            setBusy(true);
            void controller
              .leaveRoom(props.roomId)
              .catch(() => {})
              .finally(() => {
                setBusy(false);
                setConfirm(false);
              });
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setConfirm(false)} />
      </Dialog>
    </View>
  );
}
