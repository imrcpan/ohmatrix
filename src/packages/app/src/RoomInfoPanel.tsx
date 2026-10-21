import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { EngineError, type MemberRole, type RoomDetails, type RoomMember, type SpaceChild, contentText } from "@ohmatrix/core";
import { Avatar, Dialog, fontFamily, Menu, Spinner, PrimaryButton, TextButton, Toggle, useTheme, type Anchor, type MenuItem, useNavBottom } from "@ohmatrix/ui";
import { useAppState, useController, useServices, useT } from "./context.js";
import { InviteDialog } from "./InviteDialog.js";
import { PromptDialog } from "./PromptDialog.js";
import { MEMBERS_SHOWN, topMembers } from "./memberOrder.js";
import { BannedPage, MemberRow, MembersPage } from "./RoomPeople.js";
import { RoomSettingsSections } from "./RoomSettings.js";
import { Group, Item, PageHeader } from "./settings/kit.js";
import { SharedMediaPage, SharedMediaPreview } from "./SharedMedia.js";
import { SlidePanel } from "./SlidePanel.js";
import { AvatarViewer } from "./AvatarViewer.js";
import { useMediaUrl } from "./useMedia.js";
import { avatarFailure } from "./avatarFailure.js";
import { useNotice } from "./useNotice.js";

const ROLE_POWER: Record<MemberRole, number> = { member: 0, moderator: 50, admin: 100 };

/** Chat info: avatar, name, topic, address, encryption, mute, members (with management), shared media, leave/delete. */
export function RoomInfoPanel(props: { roomId: string; mode: "dock" | "overlay" }) {
  const { colors } = useTheme();
  const nav = useNavBottom();
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
  const notice = useNotice();
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
  // The most powerful few; the rest is behind View all. One pass over the members, however many there are.
  const firstMembers = useMemo(() => topMembers(d?.members ?? []), [d?.members]);
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

  const actionable = useCallback((m: RoomMember) => manageable(m) && memberMenu(m).length > 0, [d, myPower]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMemberAction = useCallback((member: RoomMember, anchor: Anchor) => setMenu({ member, anchor }), []);

  const changePhoto = async () => {
    const file = services.pickPhoto ? await services.pickPhoto() : ((await services.pickFiles?.()) ?? [])[0];
    if (!file || !d) return;
    notice.show(t("avatar.uploading"), "progress");
    try {
      await controller.roomAdmin.setAvatar(d.id, file);
      notice.show(t("avatar.done"));
    } catch (e) {
      notice.show(avatarFailure(e, t), "error");
    }
  };
  const canEdit = !!d?.can.editInfo;
  const infoPage = useAppState((st) => st.infoPage);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The same back arrow whether the panel is docked beside the chat or covers the screen. */}
      <PageHeader title={title} onBack={close} backLabel={t("close")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 + nav }}>
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
                {direct
                  ? t("directChat")
                  : d.peopleLoading
                    ? forSpace
                      ? t("space")
                      : "\u00A0" // the count follows when the people have been read: the line keeps its height meanwhile
                    : `${forSpace ? `${t("space")} · ` : ""}${joined === 1 ? t("member.one") : t("members", { n: joined })}`}
              </Text>
            </View>
            {!!problem && (
              <Text style={{ marginTop: 12, marginHorizontal: 20, textAlign: "center", fontSize: 14, fontFamily, color: colors.danger }}>{problem}</Text>
            )}
            <Group title={t("about")}>
              {canEdit && !!(services.pickPhoto || services.pickFiles) && (
                <Item label={t("changePhoto")} valueIcon="camera" onPress={() => void changePhoto()} />
              )}
              {!direct && (
                <Item
                  label={t(forSpace ? "space.name" : "room.editName")}
                  value={d.name}
                  onPress={canEdit ? () => setEdit("name") : undefined}
                  chevron={canEdit}
                />
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
              {!direct && (
                <>
                  {/* The text can be long, so it does not sit in the row's value (one line, cut): the row only says Edit, and the text is spread out under it. */}
                  <Item
                    label={t("topic")}
                    {...(canEdit ? { value: t("modify") } : {})}
                    onPress={canEdit ? () => setEdit("topic") : undefined}
                    chevron={canEdit}
                  />
                  {/* A card in the grouped-surface colour (like the share link and the recovery key), as far in as the group's title. */}
                  <View
                    style={{
                      marginHorizontal: 18, // the same as the group's title (About)
                      marginTop: 2,
                      marginBottom: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: colors.bgSecondary,
                    }}
                  >
                    <Text selectable style={{ fontSize: 15, lineHeight: 21, fontFamily, color: d.topic?.trim() ? colors.text : colors.textTertiary }}>
                      {d.topic?.trim() ? d.topic : t("room.noTopic")}
                    </Text>
                  </View>
                </>
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
            {!forSpace && <SharedMediaPreview onMore={() => controller.openInfoPage("media")} />}
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
            <Group title={direct ? t("participant") : d.peopleLoading ? t("membersTitle") : `${t("membersTitle")} · ${d.members.length}`}>
              {d.can.invite && <Item label={t("room.invite")} icon="userPlus" chevron={false} onPress={() => setInviting(true)} />}
              {/* The people are read after the page is up (a room can have thousands): a row of the same height as one of them waits for them. */}
              {d.peopleLoading && (
                <View style={{ height: 54, alignItems: "center", justifyContent: "center" }}>
                  <Spinner size={26} />
                </View>
              )}
              {firstMembers.map((m) => (
                <MemberRow key={m.userId} member={m} actionable={actionable(m)} onAction={onMemberAction} />
              ))}
              {d.members.length > MEMBERS_SHOWN && <Item label={t("viewAll")} onPress={() => controller.openInfoPage("members")} />}
            </Group>
            {/* Nobody is listed here (there can be thousands): the page behind View all lists them. */}
            {!direct && d.banned.length > 0 && (
              <Group title={`${t("banned.title")} · ${d.banned.length}`}>
                <Item label={t("viewAll")} onPress={() => controller.openInfoPage("banned")} />
              </Group>
            )}
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
        requireChange
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
        requireChange
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
        requireChange
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
      {/* Pages that slide in from the right over this panel; each is mounted only while it is open. */}
      {!forSpace && !!d && (
        <SlidePanel mode="overlay" open={infoPage === "members"}>
          <MembersPage d={d} onBack={() => controller.openInfoPage(null)} actionable={actionable} onAction={onMemberAction} />
        </SlidePanel>
      )}
      {!forSpace && !!d && (
        <SlidePanel mode="overlay" open={infoPage === "banned"}>
          <BannedPage d={d} onBack={() => controller.openInfoPage(null)} report={report} />
        </SlidePanel>
      )}
      {/* The whole gallery slides in from the right over this panel; it is mounted only while it is open. */}
      {!forSpace && !!d && (
        <SlidePanel mode="overlay" open={infoPage === "media"}>
          <SharedMediaPage roomId={d.id} onBack={() => controller.openInfoPage(null)} />
        </SlidePanel>
      )}
    </View>
  );
}
