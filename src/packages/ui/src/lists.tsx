import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "./Icon.js";
import { IconButton } from "./controls.js";
import { fontFamily, radius, useTheme } from "./theme.js";

/** Inset grouped section (iOS Settings): rounded card on the secondary background with an optional caption. */
export function Section(props: { title?: string | undefined; footer?: string | undefined; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 22, paddingHorizontal: 16 }}>
      {!!props.title && (
        <Text style={{ fontSize: 13, fontFamily, color: colors.textSecondary, marginLeft: 14, marginBottom: 6, textTransform: "none" }}>{props.title}</Text>
      )}
      <View style={{ borderRadius: radius.control + 4, backgroundColor: colors.bg, overflow: "hidden" }}>{props.children}</View>
      {!!props.footer && (
        <Text style={{ fontSize: 13, lineHeight: 18, fontFamily, color: colors.textSecondary, marginHorizontal: 14, marginTop: 6 }}>{props.footer}</Text>
      )}
    </View>
  );
}

/** Row inside a Section. `last` suppresses the divider; `onPress` makes it tappable with a chevron. */
export function Row(props: {
  label: string;
  value?: string | undefined;
  /** Second line under the label (small, secondary colour). */ subtitle?: string | undefined;
  icon?: IconName;
  iconColor?: string;
  danger?: boolean;
  checked?: boolean;
  last?: boolean;
  onPress?: (() => void) | undefined;
  chevron?: boolean;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const body = (hovered?: boolean, pressed?: boolean) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 46,
        paddingLeft: 16,
        paddingRight: 14,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      }}
    >
      {props.icon && (
        <View
          style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: props.iconColor ?? colors.accent }}
        >
          <Icon name={props.icon} size={18} color="#FFFFFF" />
        </View>
      )}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          minHeight: 46,
          borderBottomWidth: props.last ? 0 : 1,
          borderBottomColor: colors.separator,
          marginLeft: 0,
        }}
      >
        <View style={{ flexShrink: props.subtitle ? 1 : 0, flexGrow: props.subtitle ? 1 : 0, paddingVertical: props.subtitle ? 7 : 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, fontFamily, color: props.danger ? colors.danger : colors.text }}>
            {props.label}
          </Text>
          {!!props.subtitle && (
            <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, fontFamily, color: colors.textSecondary, marginTop: 1 }}>
              {props.subtitle}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
          {!!props.value && (
            <Text numberOfLines={1} selectable style={{ fontSize: 16, fontFamily, color: colors.textSecondary, flexShrink: 1, textAlign: "right" }}>
              {props.value}
            </Text>
          )}
          {props.right}
          {props.checked && <Icon name="check" size={20} color={colors.accent} />}
          {props.onPress && props.chevron !== false && !props.checked && <Icon name="chevronRight" size={16} color={colors.textTertiary} />}
        </View>
      </View>
    </View>
  );
  if (!props.onPress) return body();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={props.label} onPress={props.onPress}>
      {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => body(hovered, pressed)}
    </Pressable>
  );
}

/** Page header: back chevron, centered title, optional trailing action (e.g. a close button). */
export function NavBar(props: { title: string; onBack?: (() => void) | undefined; backLabel?: string; trailing?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: 52,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        backgroundColor: colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
      }}
    >
      <View style={{ width: 44 }}>{props.onBack && <IconButton icon="back" label={props.backLabel ?? "Back"} size={26} onPress={props.onBack} />}</View>
      <Text numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", fontFamily, color: colors.text }}>
        {props.title}
      </Text>
      <View style={{ width: 44, alignItems: "flex-end" }}>{props.trailing}</View>
    </View>
  );
}
