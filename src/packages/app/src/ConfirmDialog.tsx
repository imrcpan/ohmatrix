import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { RoomMember } from "@ohmatrix/core";
import { Avatar, Dialog, fontFamily, PrimaryButton, TextButton, useTheme } from "@ohmatrix/ui";
import { useT } from "./context.js";
import { useMediaUrl } from "./useMedia.js";

/**
 * A question to answer before something that is hard to take back: what it is about (`children`), a plain explanation, a warning in red when
 * there is one, and the confirming button, with Cancel under it. With `modal` a press beside the dialog does not close it.
 */
export function ConfirmDialog(props: {
  visible: boolean;
  title: string;
  children?: ReactNode;
  /** What will happen, in plain words. */
  message?: string | undefined;
  /** What is lost or cannot be undone, in red. */
  warning?: string | undefined;
  confirmLabel: string;
  modal?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <Dialog visible={props.visible} title={props.title} modal={props.modal ?? false} onClose={props.onClose}>
      {props.children}
      {!!props.message && <Text style={{ fontSize: 15, lineHeight: 21, fontFamily, color: colors.textSecondary, textAlign: "center" }}>{props.message}</Text>}
      {!!props.warning && (
        <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: "700", fontFamily, color: colors.danger, textAlign: "center" }}>{props.warning}</Text>
      )}
      <PrimaryButton title={props.confirmLabel} onPress={props.onConfirm} />
      <TextButton title={t("cancel")} onPress={props.onClose} />
    </Dialog>
  );
}

/** A person as the confirmations show them: picture, name, and their address (`@name:server`). */
export function MemberCard(props: { member: Pick<RoomMember, "userId" | "name" | "avatar"> }) {
  const { colors } = useTheme();
  const src = useMediaUrl(props.member.avatar, { width: 128, height: 128, fit: "crop" });
  return (
    <View accessibilityLabel={props.member.name} style={{ alignItems: "center", gap: 2 }}>
      <Avatar id={props.member.userId} name={props.member.name} size={56} src={src} />
      <Text numberOfLines={1} style={{ marginTop: 6, maxWidth: 300, fontSize: 17, fontWeight: "700", fontFamily, color: colors.text }}>
        {props.member.name}
      </Text>
      <Text numberOfLines={1} selectable style={{ maxWidth: 300, fontSize: 14, fontFamily, color: colors.textSecondary }}>
        {props.member.userId}
      </Text>
    </View>
  );
}

/** An address of the room (`#name:server`) as the confirmations show it. */
export function AddressCard(props: { alias: string }) {
  const { colors } = useTheme();
  return (
    <Text
      numberOfLines={2}
      selectable
      style={{
        textAlign: "center",
        fontSize: 17,
        fontWeight: "700",
        fontFamily,
        color: colors.text,
        backgroundColor: colors.bgSecondary,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      {props.alias}
    </Text>
  );
}
