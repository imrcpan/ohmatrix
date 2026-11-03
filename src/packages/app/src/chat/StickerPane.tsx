import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  checkSticker,
  moveItem,
  newGroupId,
  STICKER_DEFAULT_GROUP,
  STICKER_GROUPS_MAX,
  type Sticker,
  type StickerGroup,
  type StickerGroupIcon,
  withDefault,
} from "@ohmatrix/core";
import { Dialog, fontFamily, Icon, Menu, PrimaryButton, TextButton, useTheme, type Anchor } from "@ohmatrix/ui";
import { failureReason } from "../avatarFailure.js";
import { useAppState, useController, useServices, useT } from "../context.js";
import { useNotice } from "../useNotice.js";
import { PromptDialog } from "../PromptDialog.js";
import { STICKER_GAP, STICKER_PAD, STICKER_TILE } from "./stickerGrid.js";
import { StickerTile } from "./StickerTile.js";
import { StickerReorder } from "./StickerReorder.js";
import { GroupCoverDialog, GroupTabs, groupLabel } from "./StickerGroups.js";

/** A warning in three parts, the middle one in red: what is going to be lost. */
function Warning(props: { parts: [string, string, string] }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 15, lineHeight: 21, fontFamily, color: colors.textSecondary, textAlign: "center" }}>
      {props.parts[0]}
      <Text style={{ fontWeight: "700", color: colors.danger }}>{props.parts[1]}</Text>
      {props.parts[2]}
    </Text>
  );
}

/**
 * The stickers tab of the emoji picker: a bar with the name of what is shown on the left and its settings on the right, the grid of stickers
 * (a first tile adds one), and the groups as icon tabs along the bottom. A press on a sticker sends it. The settings are: Select (to move to a
 * group or delete; Delete is grey until something is chosen), and for a group Reorder, Rename, Set cover and Delete group. A file that is not a
 * picture of a kind the pack takes, or is over 3 MB, is refused with a notice at the top of the screen.
 */
export function StickerPane(props: { roomId: string; close: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const services = useServices();
  const notice = useNotice();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stored, setStored] = useState<StickerGroup[]>([]);
  // The group on show (null = all the stickers), and what the person is doing: choosing stickers, or reordering the ones of a group.
  // It opens on the group left on show last time; if that group is gone, `current` below falls back to the default one.
  const remembered = useAppState((s) => s.prefs.stickerGroup);
  const [view, setView] = useState<string>(remembered ?? STICKER_DEFAULT_GROUP);
  const show = (id: string) => {
    setView(id);
    controller.setPreferences({ stickerGroup: id });
  };
  const [mode, setMode] = useState<"browse" | "choose" | "reorder">("browse");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [width, setWidth] = useState(320);
  const [dialog, setDialog] = useState<"delete" | "name" | "cover" | "deleteGroup" | "deleteGroup2" | "newGroup" | null>(null);
  const gear = useRef<View>(null);
  useEffect(() => controller.subscribeStickers(setStickers), [controller]);
  useEffect(() => controller.subscribeStickerGroups(setStored), [controller]);
  // The default group is always first: it holds the stickers no other group has.
  const groups = withDefault(stored, stickers);
  // A group that is gone (deleted on another device) is not left on show.
  const current = groups.find((g) => g.id === view) ?? groups[0]!;
  const isDefault = current.id === STICKER_DEFAULT_GROUP;
  const shown = current.stickers.flatMap((code) => stickers.find((x) => x.shortcode === code) ?? []);
  const title = groupLabel(current, groups.indexOf(current), t);

  const saveGroups = async (next: StickerGroup[]) => {
    try {
      await controller.setStickerGroups(next);
    } catch (e) {
      notice.show(t("sticker.group.failed", { reason: failureReason(e, t) }), "error");
    }
  };
  const change = (patch: Partial<StickerGroup>) => saveGroups(groups.map((g) => (g.id === current.id ? { ...g, ...patch } : g)));

  const add = async () => {
    const files = services.pickPhotos
      ? await services.pickPhotos()
      : services.pickPhoto
        ? [await services.pickPhoto()].flatMap((f) => f ?? [])
        : ((await services.pickFiles?.()) ?? []);
    if (files.length === 0) return;
    const added: string[] = [];
    let failed = 0;
    notice.show(files.length > 1 ? t("sticker.uploading.n", { n: files.length }) : t("sticker.uploading"), "progress");
    let reason = "";
    // One after another, so the order is the one chosen and a failure does not stop the rest.
    for (const [i, file] of files.entries()) {
      if (files.length > 1) notice.show(t("sticker.uploading.n", { n: files.length, i: i + 1 }), "progress");
      try {
        // Refused here, before anything is uploaded, in the words the engine would use.
        checkSticker(file);
        added.push(await controller.addSticker(file));
      } catch (e) {
        failed++;
        reason ||= failureReason(e, t);
      }
    }
    // Added while a group is on show, they go into that group.
    const fresh = added.filter((code) => !current.stickers.includes(code));
    if (fresh.length > 0)
      await saveGroups(
        groups.map((g) =>
          g.id === current.id ? { ...g, stickers: [...g.stickers, ...fresh] } : { ...g, stickers: g.stickers.filter((x) => !fresh.includes(x)) },
        ),
      );
    if (failed === 1 && files.length === 1) notice.show(t("sticker.add.failed", { reason }), "error");
    else if (failed === 0) notice.show(t("sticker.add.done", { n: added.length }));
    else if (failed > 0) notice.show(t("sticker.add.some", { n: failed, total: files.length, reason }), "error");
  };

  const stop = () => {
    setMode("browse");
    setChosen(new Set());
  };
  const toggle = (code: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  const canAct = mode === "choose" && chosen.size > 0;
  const setCover = (icon: StickerGroupIcon) => {
    setDialog(null);
    void change({ icon });
  };

  const barButton = (label: string, onPress: () => void, enabled: boolean, accent: boolean, danger = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ hovered, pressed: down }: { hovered?: boolean; pressed: boolean }) => ({
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 15,
        justifyContent: "center",
        backgroundColor: enabled && (down || hovered) ? colors.hover : "transparent",
      })}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "600",
          fontFamily,
          color: !enabled ? colors.textTertiary : danger ? colors.danger : accent ? colors.accent : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const items = [
    ...(shown.length > 0 ? [{ label: t("sticker.select"), icon: "multiSelect" as const, onPress: () => setMode("choose") }] : []),
    ...(shown.length > 1 ? [{ label: t("sticker.reorder"), icon: "sort" as const, onPress: () => setMode("reorder") }] : []),
    { label: t("sticker.name.set"), icon: "edit" as const, onPress: () => setDialog("name") },
    // The default group keeps its cover and cannot be deleted: the stickers that no group has have to be somewhere.
    ...(isDefault
      ? []
      : [
          { label: t("sticker.cover.set"), icon: "image" as const, onPress: () => setDialog("cover") },
          { label: t("sticker.group.delete"), icon: "trash" as const, danger: true, onPress: () => setDialog("deleteGroup") },
        ]),
  ];

  return (
    <View style={{ height: 360 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6, paddingTop: 6, minHeight: 36 }}>
        {mode === "browse" ? (
          <>
            <Text numberOfLines={1} style={{ flex: 1, paddingLeft: 8, fontSize: 16, fontWeight: "700", fontFamily, color: colors.text }}>
              {title}
            </Text>
            {items.length > 0 && (
              <Pressable
                ref={gear}
                accessibilityRole="button"
                accessibilityLabel={t("sticker.settings")}
                onPress={() => gear.current?.measureInWindow((x, y, width, height) => setMenu({ x, y, width, height }))}
                style={({ hovered, pressed: down }: { hovered?: boolean; pressed: boolean }) => ({
                  width: 34,
                  height: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: down ? colors.separator : hovered ? colors.hover : "transparent",
                })}
              >
                <Icon name="gear" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
          </>
        ) : (
          <>
            {barButton(t("sticker.done"), stop, true, true)}
            {mode === "choose" ? (
              <View style={{ flexDirection: "row" }}>{barButton(t("sticker.delete"), () => setDialog("delete"), canAct, false, true)}</View>
            ) : (
              <Text numberOfLines={1} style={{ flex: 1, textAlign: "right", paddingRight: 8, fontSize: 15, fontWeight: "700", fontFamily, color: colors.text }}>
                {t("sticker.reorder.hint")}
              </Text>
            )}
          </>
        )}
      </View>
      {/* flex 1 and minHeight 0: the grid takes the height the bar and the tabs leave and scrolls inside it; with the content's own height it overflowed the pane and never scrolled. */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        contentContainerStyle={mode === "reorder" ? undefined : { flexDirection: "row", flexWrap: "wrap", padding: STICKER_PAD, gap: STICKER_GAP }}
      >
        {mode === "reorder" && (
          <StickerReorder stickers={shown} width={width} onMove={(from, to) => void change({ stickers: moveItem(current.stickers, from, to) })} />
        )}
        {(services.pickPhoto || services.pickFiles) && mode === "browse" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("sticker.new")}
            onPress={() => void add()}
            style={({ hovered, pressed: down }: { hovered?: boolean; pressed: boolean }) => ({
              width: STICKER_TILE,
              height: STICKER_TILE,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: down ? colors.separator : hovered ? colors.hover : colors.bgSecondary,
            })}
          >
            <Icon name="plus" size={28} color={colors.textSecondary} />
          </Pressable>
        )}
        {mode !== "reorder" &&
          shown.map((s) => (
            <StickerTile
              key={s.shortcode}
              sticker={s}
              choosing={mode === "choose"}
              chosen={chosen.has(s.shortcode)}
              onPress={() => {
                if (mode !== "browse") return toggle(s.shortcode);
                props.close();
                controller
                  .sendSticker(props.roomId, s.shortcode)
                  .catch((e: unknown) => notice.show(t("sticker.send.failed", { reason: failureReason(e, t) }), "error"));
              }}
            />
          ))}
        {shown.length === 0 && (
          <Text style={{ width: "100%", paddingTop: 12, paddingHorizontal: 8, fontSize: 13, lineHeight: 18, fontFamily, color: colors.textSecondary }}>
            {isDefault ? t("sticker.empty") : t("sticker.group.empty")}
          </Text>
        )}
      </ScrollView>
      <GroupTabs
        groups={groups}
        pack={stickers}
        view={current.id}
        max={STICKER_GROUPS_MAX}
        onView={(id) => {
          stop();
          show(id);
        }}
        onNew={() => setDialog("newGroup")}
      />
      <Menu visible={!!menu} anchor={menu} alignRight up={false} items={items} onClose={() => setMenu(null)} />
      <GroupCoverDialog visible={dialog === "cover"} stickers={stickers} onClose={() => setDialog(null)} onPick={setCover} />
      <PromptDialog
        visible={dialog === "newGroup"}
        title={t("sticker.group.new")}
        message={t("sticker.name.body")}
        fields={[{ label: t("sticker.name.label"), optional: true }]}
        initial={[t("sticker.group.n", { n: groups.length })]}
        confirmLabel={t("sticker.group.create")}
        onConfirm={async ([name]) => {
          const next = (name ?? "").trim();
          // A new group has no cover of its own: it shows its first sticker, or a smiling face until it has one.
          const id = newGroupId(groups);
          await controller.setStickerGroups([...groups, { id, name: next, stickers: [] }]);
          show(id);
        }}
        onClose={() => setDialog(null)}
      />
      <PromptDialog
        visible={dialog === "name"}
        title={t("sticker.name.title")}
        message={t("sticker.name.body")}
        fields={[{ label: t("sticker.name.label"), optional: true }]}
        initial={[current.name]}
        confirmLabel={t("save")}
        onConfirm={async ([name]) => {
          const next = (name ?? "").trim();
          await controller.setStickerGroups(groups.map((g) => (g.id === current.id ? { ...g, name: next } : g)));
        }}
        onClose={() => setDialog(null)}
      />
      <Dialog visible={dialog === "deleteGroup"} title={t("sticker.group.delete.title")} onClose={() => setDialog(null)}>
        <Warning parts={[t("sticker.group.delete.a"), t("sticker.group.delete.b", { n: current.stickers.length }), t("sticker.group.delete.c")]} />
        <PrimaryButton title={t("sticker.group.delete")} onPress={() => setDialog("deleteGroup2")} />
        <TextButton title={t("cancel")} onPress={() => setDialog(null)} />
      </Dialog>
      <Dialog visible={dialog === "deleteGroup2"} title={t("sticker.group.delete.title2")} modal onClose={() => setDialog(null)}>
        <Warning
          parts={[t("sticker.group.delete.2a"), t("sticker.group.delete.2b", { name: title, n: current.stickers.length }), t("sticker.group.delete.2c")]}
        />
        <PrimaryButton
          title={t("sticker.group.delete.yes")}
          onPress={() => {
            const g = current;
            setDialog(null);
            show(STICKER_DEFAULT_GROUP);
            if (isDefault) return;
            // The stickers go first (that also takes them out of every group); then the group itself.
            void (g.stickers.length ? controller.removeStickers(g.stickers) : Promise.resolve())
              .then(() => saveGroups(groups.filter((x) => x.id !== g.id)))
              .catch((e: unknown) => notice.show(t("sticker.remove.failed", { reason: failureReason(e, t) }), "error"));
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setDialog(null)} />
      </Dialog>
      <Dialog visible={dialog === "delete"} title={t("sticker.remove.title")} message={t("sticker.remove.body")} onClose={() => setDialog(null)}>
        <PrimaryButton
          title={t("sticker.remove")}
          onPress={() => {
            const codes = [...chosen];
            setDialog(null);
            stop();
            if (codes.length)
              controller.removeStickers(codes).catch((e: unknown) => notice.show(t("sticker.remove.failed", { reason: failureReason(e, t) }), "error"));
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setDialog(null)} />
      </Dialog>
    </View>
  );
}
