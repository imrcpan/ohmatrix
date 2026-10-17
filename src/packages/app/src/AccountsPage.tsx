import { ScrollView, Text, View } from "react-native";
import { Avatar, fontFamily, Icon, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useT } from "./context.js";
import { Group, Item, PageHeader } from "./settings/kit.js";
import { useMediaUrl } from "./useMedia.js";

/** One signed-in account: picture, name and address, with a mark on the one in use. Laid out like an `Item` row. */
function AccountRow(props: { id: string; name: string; address: string; avatar: string | undefined; current: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, marginHorizontal: 6, paddingHorizontal: 12, borderRadius: 12 }}>
      <Avatar id={props.id} name={props.name || "?"} size={44} src={props.avatar} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", fontFamily, color: colors.text }}>
          {props.name || props.address}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontFamily, color: colors.textSecondary, marginTop: 2 }}>
          {props.address}
        </Text>
      </View>
      {props.current && <Icon name="check" size={20} color={colors.accent} />}
    </View>
  );
}

/**
 * The accounts page, opened from "Switch account" on the profile. For now it lists the one account that is signed in;
 * adding and switching come with the multi-account controller.
 */
export function AccountsPage() {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const profile = useAppState((s) => s.profile);
  const userId = useAppState((s) => s.userId) ?? "";
  const avatar = useMediaUrl(profile?.avatar, { width: 96, height: 96, fit: "crop" });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("accounts")} onBack={() => controller.sidebarBack()} backLabel={t("profile")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Group>
          <AccountRow id={profile?.userId ?? userId} name={profile?.displayName ?? ""} address={profile?.userId ?? userId} avatar={avatar} current />
        </Group>
        <Group footer={t("accounts.footer")}>
          <Item label={t("addAccount")} icon="userPlus" />
        </Group>
      </ScrollView>
    </View>
  );
}
