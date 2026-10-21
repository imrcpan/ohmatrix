import { memo, useCallback, useEffect, useState, type DependencyList, type ReactElement } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { BannedMember, RoomDetails, RoomMember } from "@ohmatrix/core";
import { Avatar, fontFamily, Icon, Menu, Spinner, useNavBottom, useTheme, type Anchor } from "@ohmatrix/ui";
import { useController, useT } from "./context.js";
import { levelLabel } from "./RoomSettings.js";
import { sortMembers } from "./memberOrder.js";
import { PageHeader } from "./settings/kit.js";
import { useMediaUrl } from "./useMedia.js";

/**
 * `compute()` run a little after `delay` ms, not while rendering, and again when `deps` change; null until the first time. What was
 * computed before stays in place while the next is worked out.
 */
function useLater<T>(compute: () => T, deps: DependencyList, delay: number): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setValue(compute()), value === null ? delay : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export const MEMBER_ROW_HEIGHT = 54;
const BANNED_ROW_HEIGHT = 60;

/** One member. With `onAction` (and `actionable`) pressing it reports the member and where, so the member's menu can open there. */
export const MemberRow = memo(function MemberRow(props: { member: RoomMember; actionable?: boolean; onAction?: (m: RoomMember, anchor: Anchor) => void }) {
  const { colors } = useTheme();
  const t = useT();
  const m = props.member;
  const onPress = props.actionable && props.onAction ? props.onAction : undefined;
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
        height: MEMBER_ROW_HEIGHT,
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
    </View>
  );
  if (!onPress) return body();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={m.name}
      onPress={(e) => {
        const n = e.nativeEvent as { pageX?: number; pageY?: number };
        onPress(m, { x: n.pageX ?? 0, y: n.pageY ?? 0, width: 0, height: 0 });
      }}
    >
      {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => body(hovered, pressed)}
    </Pressable>
  );
});

/** A person who is banned: the name and, under it, the address and the reason. Pressing it (when allowed) opens the menu to lift the ban. */
const BannedRow = memo(function BannedRow(props: { banned: BannedMember; actionable: boolean; onAction: (b: BannedMember, anchor: Anchor) => void }) {
  const { colors } = useTheme();
  const b = props.banned;
  const sub = [b.name !== b.userId ? b.userId : "", b.reason ?? ""].filter(Boolean).join(" · ");
  const body = (hovered?: boolean, pressed?: boolean) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        height: BANNED_ROW_HEIGHT,
        marginHorizontal: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      }}
    >
      <Avatar id={b.userId} name={b.name} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontFamily, color: colors.text }}>
          {b.name}
        </Text>
        {!!sub && (
          <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, color: colors.textSecondary }}>
            {sub}
          </Text>
        )}
      </View>
      {props.actionable && <Icon name="more" size={18} color={colors.textTertiary} />}
    </View>
  );
  if (!props.actionable) return body();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={b.name}
      onPress={(e) => {
        const n = e.nativeEvent as { pageX?: number; pageY?: number };
        props.onAction(b, { x: n.pageX ?? 0, y: n.pageY ?? 0, width: 0, height: 0 });
      }}
    >
      {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => body(hovered, pressed)}
    </Pressable>
  );
});

/**
 * Rows in a list that draws only the ones near the screen. Every row has the same height, so the list places them without measuring
 * (a room can have thousands of people). The numbers are for a phone and a desktop alike: a few screens of rows on either side.
 */
function PeopleList<T>(props: { data: readonly T[]; rowHeight: number; keyOf: (item: T) => string; render: (item: T) => ReactElement; testID?: string }) {
  const nav = useNavBottom();
  return (
    <FlatList
      testID={props.testID}
      data={props.data}
      keyExtractor={props.keyOf}
      renderItem={({ item }) => props.render(item)}
      getItemLayout={(_, index) => ({ length: props.rowHeight, offset: props.rowHeight * index, index })}
      initialNumToRender={14}
      maxToRenderPerBatch={12}
      updateCellsBatchingPeriod={30}
      windowSize={7}
      removeClippedSubviews
      ListFooterComponent={<View style={{ height: 24 + nav }} />}
    />
  );
}

/** Every member, in the order of the chat info (the most powerful first), as a page of its own. */
export function MembersPage(props: {
  d: RoomDetails;
  onBack: () => void;
  actionable: (m: RoomMember) => boolean;
  onAction: (m: RoomMember, anchor: Anchor) => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  // Putting thousands of people in order is the most this page does, and it is done after the page has slid in (and again, off to the side,
  // when the people change), so neither the slide nor the chat info under it waits for it. Until then a circle turns.
  const sorted = useLater(() => sortMembers(props.d.members), [props.d.members], 350);
  const { actionable, onAction } = props;
  const render = useCallback((m: RoomMember) => <MemberRow member={m} actionable={actionable(m)} onAction={onAction} />, [actionable, onAction]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={`${t("membersTitle")} · ${props.d.members.length}`} onBack={props.onBack} backLabel={t("chatInfo")} />
      {sorted ? (
        <PeopleList testID="members-list" data={sorted} rowHeight={MEMBER_ROW_HEIGHT} keyOf={(m) => m.userId} render={render} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Spinner />
        </View>
      )}
    </View>
  );
}

/** Every banned person, as a page of its own; the ban can be lifted from here. */
export function BannedPage(props: { d: RoomDetails; onBack: () => void; report: (e: unknown) => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const { d, report } = props;
  const [menu, setMenu] = useState<{ banned: BannedMember; anchor: Anchor } | null>(null);
  const onAction = useCallback((banned: BannedMember, anchor: Anchor) => setMenu({ banned, anchor }), []);
  const canBan = d.can.ban;
  const render = useCallback((b: BannedMember) => <BannedRow banned={b} actionable={canBan} onAction={onAction} />, [canBan, onAction]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={`${t("banned.title")} · ${d.banned.length}`} onBack={props.onBack} backLabel={t("chatInfo")} />
      <PeopleList testID="banned-list" data={d.banned} rowHeight={BANNED_ROW_HEIGHT} keyOf={(b) => b.userId} render={render} />
      <Menu
        visible={!!menu}
        anchor={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        items={
          menu ? [{ label: t("unban"), icon: "user" as const, onPress: () => void controller.roomAdmin.unban(d.id, menu.banned.userId).catch(report) }] : []
        }
      />
    </View>
  );
}
