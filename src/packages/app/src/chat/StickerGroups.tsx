import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import {
  checkSticker,
  coverOf,
  STICKER_DEFAULT_GROUP,
  withDefault,
  withUngrouped,
  type Sticker,
  type StickerGroup,
  type StickerGroupIcon,
} from "@ohmatrix/core";
import { ALL_EMOJI_GROUPS, Dialog, fontFamily, Icon, PopPiece, TextButton, useTheme } from "@ohmatrix/ui";
import { failureReason } from "../avatarFailure.js";
import { useController, useServices, useT } from "../context.js";
import { useMediaUrl } from "../useMedia.js";
import { useNotice } from "../useNotice.js";
import { BUILTIN_COVER, BUILTIN_GROUP, openEmojiUri } from "./builtinGroup.js";

/** The size of a group's icon (its tab is a little larger); a sticker in the grid is 72. */
export const GROUP_ICON = 48;

const EMOJI = ALL_EMOJI_GROUPS.flatMap((g) => g.emojis);

/** A group's icon: its emoji, or its picture. */
export function GroupIcon(props: { icon: StickerGroupIcon; size?: number }) {
  const size = props.size ?? GROUP_ICON;
  const uri = useMediaUrl(
    props.icon.kind === "image" ? props.icon.url : undefined,
    props.icon.kind === "image" ? { width: size * 3, height: size * 3, fit: "crop" } : {},
  );
  if (props.icon.kind === "emoji") return <Text style={{ fontSize: size - 2, lineHeight: size + 2, textAlign: "center" }}>{props.icon.emoji}</Text>;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, overflow: "hidden" }}>
      {uri ? <Image source={{ uri }} resizeMode="cover" style={{ width: size, height: size }} /> : null}
    </View>
  );
}

/**
 * The number "Group n" counts from for the groups of this list: the group of the stickers that no group has is number 0, and the others
 * go on from it whether it is shown or not, so a group keeps its number when that one comes or goes.
 */
export const labelOffset = (groups: readonly StickerGroup[]): number => (groups[0]?.id === STICKER_DEFAULT_GROUP ? 0 : 1);

/** What a group is called: its name, or "Group n" while it has none. */
export function groupLabel(g: StickerGroup, index: number, t: ReturnType<typeof useT>): string {
  return g.name || (g.id === STICKER_DEFAULT_GROUP ? t("sticker.group.default") : t("sticker.group.n", { n: index }));
}

function PackTile(props: { sticker: Sticker; onPress: () => void }) {
  const { colors } = useTheme();
  const uri = useMediaUrl(props.sticker.url, { width: 128, height: 128, fit: "scale" });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.sticker.shortcode}
      onPress={props.onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        width: 56,
        height: 56,
        borderRadius: 10,
        padding: 4,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      })}
    >
      {uri ? <Image source={{ uri }} resizeMode="contain" style={{ flex: 1 }} /> : null}
    </Pressable>
  );
}

/**
 * Choosing the cover of a group, in this order: one of my stickers, a picture from the device, or an emoji. The emoji are behind a button
 * (a grid of them is not shown until asked for) and there is no text box, so nothing but a standard emoji can be chosen. A picture has the
 * sticker rules: PNG, JPEG, GIF or WebP, up to 3 MB.
 */
export function GroupCoverDialog(props: { visible: boolean; stickers: readonly Sticker[]; onClose: () => void; onPick: (icon: StickerGroupIcon) => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const services = useServices();
  const notice = useNotice();
  const [step, setStep] = useState<"menu" | "pack" | "emoji">("menu");
  const close = () => {
    setStep("menu");
    props.onClose();
  };
  const pick = (icon: StickerGroupIcon) => {
    setStep("menu");
    props.onPick(icon);
  };
  const device = async () => {
    const file = services.pickPhoto ? await services.pickPhoto() : ((await services.pickFiles?.()) ?? [])[0];
    if (!file) return;
    try {
      checkSticker(file);
      pick({ kind: "image", ...(await controller.uploadStickerGroupIcon(file)) });
    } catch (e) {
      notice.show(t("sticker.add.failed", { reason: failureReason(e, t) }), "error");
    }
  };
  return (
    <Dialog visible={props.visible} title={t("sticker.cover.title")} onClose={close}>
      {step === "menu" && (
        <>
          <TextButton title={t("sticker.cover.pack")} onPress={() => setStep("pack")} />
          {(services.pickPhoto || services.pickFiles) && <TextButton title={t("sticker.cover.upload")} onPress={() => void device()} />}
          <TextButton title={t("sticker.cover.emoji")} onPress={() => setStep("emoji")} />
        </>
      )}
      {step === "pack" && (
        <ScrollView style={{ height: 220 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {props.stickers.length === 0 && <Text style={{ padding: 8, color: colors.textSecondary }}>{t("sticker.empty")}</Text>}
          {props.stickers.map((s) => (
            <PackTile key={s.shortcode} sticker={s} onPress={() => pick({ kind: "image", url: s.url, mimeType: s.mimeType })} />
          ))}
        </ScrollView>
      )}
      {step === "emoji" && (
        <ScrollView style={{ height: 220 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap" }}>
          {EMOJI.map((e, i) => (
            <Pressable
              key={`${e}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`Emoji ${e}`}
              onPress={() => pick({ kind: "emoji", emoji: e })}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                width: 40,
                height: 40,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
              })}
            >
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {step !== "menu" && <TextButton title={t("back")} onPress={() => setStep("menu")} />}
      <TextButton title={t("cancel")} onPress={close} />
    </Dialog>
  );
}

/** How many covers the row of groups shows at once (the pane is about this many tabs wide). */
const TABS_SEEN = 6;

/** The groups as icon tabs along the bottom of the sticker pane: all of them first, then each group, then a plus that makes a new one. */
export function GroupTabs(props: {
  groups: readonly StickerGroup[];
  view: string;
  max: number;
  onView: (id: string) => void;
  onNew: () => void;
  pack: readonly Sticker[];
}) {
  const { colors } = useTheme();
  const t = useT();
  // The covers come up with the stickers, in one row, from the middle of it out; the pane shows about this many of them at once. The set of
  // the app is the first tab (its number 0), and then come my groups.
  const tabs = 1 + props.groups.length + (props.groups.length - 1 < props.max ? 1 : 0);
  const seen = Math.min(tabs, TABS_SEEN);
  const offset = labelOffset(props.groups);
  const tab = (index: number, key: string, label: string, selected: boolean, onPress: () => void, child: React.ReactNode) => (
    <PopPiece key={key} index={index} cols={seen} rows={1}>
      {(hover) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected }}
          onPress={onPress}
          onHoverIn={hover.onHoverIn}
          onHoverOut={hover.onHoverOut}
          style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
            width: 62,
            height: 58,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: selected ? colors.bgSecondary : pressed ? colors.separator : hovered ? colors.hover : "transparent",
          })}
        >
          {child}
        </Pressable>
      )}
    </PopPiece>
  );
  return (
    <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.separator, paddingVertical: 4, paddingHorizontal: 4 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", gap: 2 }}>
        {tab(
          0,
          BUILTIN_GROUP,
          t("sticker.builtin.name"),
          props.view === BUILTIN_GROUP,
          () => props.onView(BUILTIN_GROUP),
          <Image source={{ uri: openEmojiUri(BUILTIN_COVER) }} resizeMode="contain" style={{ width: GROUP_ICON, height: GROUP_ICON }} />,
        )}
        {props.groups.map((g, i) =>
          tab(i + 1, g.id, groupLabel(g, i + offset, t), props.view === g.id, () => props.onView(g.id), <GroupIcon icon={coverOf(g, props.pack)} />),
        )}
        {props.groups.length - 1 < props.max &&
          tab(
            props.groups.length + 1,
            "new",
            t("sticker.group.new"),
            false,
            props.onNew,
            <Icon name="plus" size={GROUP_ICON - 14} color={colors.textSecondary} />,
          )}
      </ScrollView>
    </View>
  );
}

/** My sticker groups as tiles to choose one from (the default group first), each with its cover and its name. */
export function GroupChoice(props: { onPick: (groupId: string) => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const [stored, setStored] = useState<StickerGroup[]>([]);
  const [pack, setPack] = useState<Sticker[]>([]);
  useEffect(() => controller.subscribeStickers(setPack), [controller]);
  useEffect(() => controller.subscribeStickerGroups(setStored), [controller]);
  // Mine, as they are; with none, the stickers go to the group of those that no group has, so there is always somewhere to put one.
  const shown = withUngrouped(stored, pack);
  const groups = shown.length > 0 ? shown : withDefault(stored, pack).slice(0, 1);
  const offset = labelOffset(groups);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
      {groups.map((g, i) => (
        <Pressable
          key={g.id}
          accessibilityRole="button"
          accessibilityLabel={groupLabel(g, i + offset, t)}
          onPress={() => props.onPick(g.id)}
          style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
            width: 84,
            paddingVertical: 8,
            borderRadius: 12,
            alignItems: "center",
            gap: 4,
            backgroundColor: pressed ? colors.separator : hovered ? colors.hover : colors.bgSecondary,
          })}
        >
          <GroupIcon icon={coverOf(g, pack)} />
          <Text numberOfLines={1} style={{ maxWidth: 76, fontSize: 13, fontFamily, color: colors.text }}>
            {groupLabel(g, i + offset, t)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
