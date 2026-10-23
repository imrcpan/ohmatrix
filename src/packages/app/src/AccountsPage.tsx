import { useEffect, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Avatar, Dialog, fontFamily, Icon, IconButton, Menu, PrimaryButton, TextButton, useTheme, type Anchor, useNavBottom } from "@ohmatrix/ui";
import type { AccountSummary } from "@ohmatrix/state";
import { useAccountManager, useAccountsState, useController, useT } from "./context.js";
import { Group, PageHeader } from "./settings/kit.js";
import { moved, rowDropIndex, type RowLayout } from "./rowDrop.js";
import { useMediaUrl } from "./useMedia.js";

/** The height of an account's row (and so the step of a drag). */
const ROW_H = 64;

/** One signed-in account: picture, name, address, and either a mark (the one in use) or its unread badge. Press to switch, long press or right click for more. */
function AccountRow(props: { account: AccountSummary; current: boolean; reordering?: boolean; onPress(): void; onMenu(at: Anchor): void }) {
  const { colors } = useTheme();
  const t = useT();
  const manager = useAccountManager();
  const a = props.account;
  const avatar = useMediaUrl(a.avatar, { width: 96, height: 96, fit: "crop" }, manager.controllerOf(a.userId));
  const menu = (x: number, y: number) => props.onMenu({ x, y, width: 0, height: 0 });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a.displayName || a.userId}
      accessibilityState={{ selected: props.current }}
      onPress={props.onPress}
      onLongPress={(e) => {
        const n = e.nativeEvent as { pageX?: number; pageY?: number };
        menu(n.pageX ?? 0, n.pageY ?? 0);
      }}
      delayLongPress={350}
      {...({
        onContextMenu: (e: { preventDefault(): void; clientX: number; clientY: number }) => {
          e.preventDefault();
          menu(e.clientX, e.clientY);
        },
      } as object)}
    >
      {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            minHeight: ROW_H,
            marginHorizontal: 6,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
          }}
        >
          <Avatar id={a.userId} name={a.displayName || "?"} size={44} src={avatar} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", fontFamily, color: colors.text }}>
              {a.displayName || a.userId}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontFamily, color: colors.textSecondary, marginTop: 2 }}>
              {a.userId}
            </Text>
          </View>
          {props.reordering ? (
            <Icon name="grip" size={24} color={colors.textSecondary} />
          ) : props.current ? (
            <Text style={{ fontSize: 14, fontFamily, color: colors.accent }}>{t("account.current")}</Text>
          ) : (
            a.unread > 0 && (
              <View
                style={{
                  minWidth: 22,
                  height: 22,
                  paddingHorizontal: 6,
                  borderRadius: 11,
                  backgroundColor: colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", fontFamily, color: "#fff" }}>{a.unread > 99 ? "99+" : a.unread}</Text>
              </View>
            )
          )}
        </View>
      )}
    </Pressable>
  );
}

/** The first row of the list: the same shape as an account's, with the add icon where the picture is and one line of text, centred. */
function AddAccountRow(props: { onPress(): void }) {
  const { colors, dark } = useTheme();
  const t = useT();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("addAccount")} onPress={props.onPress}>
      {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            minHeight: ROW_H,
            marginHorizontal: 6,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: dark ? colors.separator : "rgba(60,60,67,0.11)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* The glyph's weight is on its left (the person), so it is nudged right to look centred. */}
            <View style={{ marginLeft: 3 }}>
              <Icon name="userPlus" size={22} color={colors.textSecondary} />
            </View>
          </View>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: "600", fontFamily, color: colors.text }}>
            {t("addAccount")}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

interface PointerLike {
  type: string;
  clientY: number;
  button: number;
  preventDefault(): void;
}

/**
 * One account in the list being reordered: it is held (a press and a move, with a finger or a mouse) and dragged up or down, and dropped
 * where it should go. The rows are laid out by the page; this reports the drag (`dy` from where it started, and the row it would take),
 * and the drop. On the web the mouse is followed with pointer events (the responder system does not take a mouse drag there).
 */
function DragRow(props: {
  index: number;
  count: number;
  layout: RowLayout;
  dragging: boolean;
  dy: number;
  onStart(): void;
  onMove(dy: number, to: number): void;
  onDrop(to: number): void;
  children: React.ReactNode;
}) {
  const latest = useRef(props);
  latest.current = props;
  const at = () => latest.current.layout.top + latest.current.index * latest.current.layout.height;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => latest.current.onStart(),
      onPanResponderMove: (_e, g) => latest.current.onMove(g.dy, rowDropIndex(at() + g.dy, latest.current.layout, latest.current.count)),
      onPanResponderRelease: (_e, g) => latest.current.onDrop(rowDropIndex(at() + g.dy, latest.current.layout, latest.current.count)),
      onPanResponderTerminate: () => latest.current.onDrop(latest.current.index),
    }),
  ).current;
  const node = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = node.current as unknown as {
      addEventListener(t: string, f: (e: PointerLike) => void): void;
      removeEventListener(t: string, f: (e: PointerLike) => void): void;
    } | null;
    if (!el) return;
    const win = globalThis as unknown as {
      addEventListener(t: string, f: (e: PointerLike) => void): void;
      removeEventListener(t: string, f: (e: PointerLike) => void): void;
    };
    const down = (e: PointerLike) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const y0 = e.clientY;
      const start = at();
      latest.current.onStart();
      const to = (ev: PointerLike) => rowDropIndex(start + ev.clientY - y0, latest.current.layout, latest.current.count);
      const move = (ev: PointerLike) => latest.current.onMove(ev.clientY - y0, to(ev));
      const end = (ev: PointerLike) => {
        win.removeEventListener("pointermove", move);
        win.removeEventListener("pointerup", end);
        win.removeEventListener("pointercancel", end);
        latest.current.onDrop(ev.type === "pointercancel" ? latest.current.index : to(ev));
      };
      win.addEventListener("pointermove", move);
      win.addEventListener("pointerup", end);
      win.addEventListener("pointercancel", end);
    };
    el.addEventListener("pointerdown", down);
    return () => el.removeEventListener("pointerdown", down);
  }, []);
  return (
    <View
      ref={node}
      {...(Platform.OS === "web" ? {} : pan.panHandlers)}
      {...({ dataSet: { reorderRow: "1" } } as object)}
      style={
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: props.layout.top + props.index * props.layout.height,
          height: props.layout.height,
          cursor: props.dragging ? "grabbing" : "grab",
          userSelect: "none",
          touchAction: "none",
          zIndex: props.dragging ? 2 : 1,
          opacity: props.dragging ? 0.9 : 1,
          transform: props.dragging ? [{ translateY: props.dy }, { scale: 1.02 }] : [],
        } as object
      }
    >
      {props.children}
    </View>
  );
}

/** The accounts as a list to put in order: each row is dragged by its handle, and the order is passed on when one is dropped. */
function ReorderList(props: { accounts: AccountSummary[]; currentKey: string; onOrder(ids: string[]): void }) {
  const { colors } = useTheme();
  const layout: RowLayout = { height: ROW_H, top: 0 };
  const [drag, setDrag] = useState<{ from: number; dy: number; to: number } | null>(null);
  // Where the dragged row would land, as a bar in the accent colour above (going up) or below (going down) the row it would take the place of.
  const bar = drag && drag.to !== drag.from ? (drag.to > drag.from ? (drag.to + 1) * ROW_H : drag.to * ROW_H) : null;
  return (
    <View style={{ height: props.accounts.length * ROW_H, marginTop: 4 }}>
      {bar !== null && (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 18, right: 18, top: bar - 1.5, height: 3, borderRadius: 1.5, backgroundColor: colors.accent, zIndex: 3 }}
        />
      )}
      {props.accounts.map((a, i) => (
        <DragRow
          key={a.userId}
          index={i}
          count={props.accounts.length}
          layout={layout}
          dragging={drag?.from === i}
          dy={drag?.from === i ? drag.dy : 0}
          onStart={() => setDrag({ from: i, dy: 0, to: i })}
          onMove={(dy, to) => setDrag({ from: i, dy, to })}
          onDrop={(to) => {
            setDrag(null);
            if (to !== i)
              props.onOrder(
                moved(
                  props.accounts.map((x) => x.userId),
                  i,
                  to,
                ),
              );
          }}
        >
          <AccountRow account={a} current={a.userId === props.currentKey} reordering onPress={() => {}} onMenu={() => {}} />
        </DragRow>
      ))}
    </View>
  );
}

/** The accounts page, opened from "Switch Account" on the profile: every account (all of them keep syncing), and a way to add one. */
export function AccountsPage() {
  const { colors } = useTheme();
  const nav = useNavBottom();
  const t = useT();
  const controller = useController();
  const manager = useAccountManager();
  const accounts = useAccountsState((s) => s.accounts);
  const currentKey = useAccountsState((s) => s.currentKey);
  const [menu, setMenu] = useState<{ account: AccountSummary; at: Anchor } | null>(null);
  const [confirm, setConfirm] = useState<AccountSummary | null>(null);
  const [reordering, setReordering] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        title={t("accounts")}
        onBack={() => controller.sidebarBack()}
        backLabel={t("profile")}
        trailing={
          accounts.length > 1 &&
          (reordering ? (
            <TextButton title={t("accounts.reorder.done")} onPress={() => setReordering(false)} />
          ) : (
            <IconButton icon="sort" label={t("accounts.reorder")} onPress={() => setReordering(true)} />
          ))
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 + nav }}>
        {reordering ? (
          <Group footer={t("accounts.reorder.hint")}>
            <ReorderList accounts={accounts} currentKey={currentKey} onOrder={(ids) => void manager.reorder(ids)} />
          </Group>
        ) : (
          <Group>
            <AddAccountRow onPress={() => manager.beginAdd()} />
            {accounts.map((a) => (
              <AccountRow
                key={a.userId}
                account={a}
                current={a.userId === currentKey}
                onPress={() => {
                  if (a.userId !== currentKey) {
                    // Another account: both it and this one go back to the chat list, so the switch ends on the main page.
                    controller.openSidebarPage("chats");
                    manager.controllerOf(a.userId)?.openSidebarPage("chats");
                  }
                  manager.switchTo(a.userId);
                }}
                onMenu={(at) => setMenu({ account: a, at })}
              />
            ))}
          </Group>
        )}
      </ScrollView>
      <Menu
        visible={!!menu}
        anchor={menu?.at ?? null}
        onClose={() => setMenu(null)}
        items={[{ label: t("account.signOut"), icon: "signOut", danger: true, onPress: () => menu && setConfirm(menu.account) }]}
      />
      <Dialog
        visible={!!confirm}
        title={t("account.signOut.title", { name: confirm?.displayName || confirm?.userId || "" })}
        message={t("signOut.body")}
        onClose={() => setConfirm(null)}
      >
        <PrimaryButton
          title={t("signOut")}
          onPress={() => {
            const a = confirm;
            setConfirm(null);
            if (a) void manager.remove(a.userId);
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setConfirm(null)} />
      </Dialog>
    </View>
  );
}
