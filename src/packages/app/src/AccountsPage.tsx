import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Avatar, Dialog, fontFamily, Menu, PrimaryButton, TextButton, useTheme, type Anchor } from "@ohmatrix/ui";
import type { AccountSummary } from "@ohmatrix/state";
import { useAccountManager, useAccountsState, useController, useT } from "./context.js";
import { Group, Item, PageHeader } from "./settings/kit.js";
import { useMediaUrl } from "./useMedia.js";

/** One signed-in account: picture, name, address, and either a mark (the one in use) or its unread badge. Press to switch, long press or right click for more. */
function AccountRow(props: { account: AccountSummary; current: boolean; onPress(): void; onMenu(at: Anchor): void }) {
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
            minHeight: 64,
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
          {props.current ? (
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

/** The accounts page, opened from "Switch Account" on the profile: every account (all of them keep syncing), and a way to add one. */
export function AccountsPage() {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const manager = useAccountManager();
  const accounts = useAccountsState((s) => s.accounts);
  const currentKey = useAccountsState((s) => s.currentKey);
  const [menu, setMenu] = useState<{ account: AccountSummary; at: Anchor } | null>(null);
  const [confirm, setConfirm] = useState<AccountSummary | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("accounts")} onBack={() => controller.sidebarBack()} backLabel={t("profile")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Group>
          {accounts.map((a) => (
            <AccountRow
              key={a.userId}
              account={a}
              current={a.userId === currentKey}
              onPress={() => manager.switchTo(a.userId)}
              onMenu={(at) => setMenu({ account: a, at })}
            />
          ))}
        </Group>
        <Group>
          <Item label={t("addAccount")} icon="userPlus" onPress={() => manager.beginAdd()} />
        </Group>
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
