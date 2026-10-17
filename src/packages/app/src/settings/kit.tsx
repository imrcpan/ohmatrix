import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Dialog, fontFamily, Icon, IconButton, Menu, PrimaryButton, useTheme, type Anchor, type IconName } from "@ohmatrix/ui";
import { useServices, useT } from "../context.js";

/**
 * The look of the profile, settings and sessions pages, kept here on purpose: the rest of the app keeps using the
 * shared `Section`, `Row` and `NavBar`. It follows the chat list: the same flat background, a header of the same
 * height with a bold title, and rounded rows that fill on hover, with single-colour icons like the menus.
 */

/** Back button and a bold title, laid out like the chat list's header, with room for an action at the end. */
/** Side padding of the header and of a row: the shared NavBar puts its back button at x = 4, and so does this. */
const PAD = 8;

export function PageHeader(props: { title: string; onBack?: (() => void) | undefined; backLabel?: string | undefined; trailing?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 64, paddingHorizontal: PAD, paddingTop: 10, paddingBottom: 8 }}>
      {props.onBack && <IconButton icon="back" label={props.backLabel ?? "Back"} size={26} onPress={props.onBack} />}
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={{ flex: 1, fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3, fontFamily, color: colors.text }}
      >
        {props.title}
      </Text>
      {props.trailing}
    </View>
  );
}

/** A captioned run of rows, with an optional note below. */
export function Group(props: { title?: string | undefined; footer?: string | undefined; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 18 }}>
      {!!props.title && (
        <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.accent, marginHorizontal: 18, marginBottom: 4 }}>{props.title}</Text>
      )}
      {props.children}
      {!!props.footer && (
        <Text style={{ fontSize: 13, lineHeight: 18, fontFamily, color: colors.textSecondary, marginHorizontal: 18, marginTop: 4 }}>{props.footer}</Text>
      )}
    </View>
  );
}

/** A row: single-colour icon, label, value and a chevron when it can be opened. */
export function Item(props: {
  label: string;
  value?: string | undefined;
  subtitle?: string | undefined;
  icon?: IconName;
  /** An icon at the right, just before the value (or the chevron): for a mark that belongs to the value, not to the label. */
  valueIcon?: IconName;
  danger?: boolean;
  onPress?: (() => void) | undefined;
  chevron?: boolean;
  right?: ReactNode;
  /** A long value (an address): cut with an ellipsis, shown whole in a preview on press, copied from a long press or right click. */
  copyable?: boolean;
}) {
  const { colors } = useTheme();
  const t = useT();
  const services = useServices();
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = props.value ?? "";
    const done = () => setCopied(true);
    if (services.copyText) void services.copyText(text).then(done, () => {});
    else
      void (globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator?.clipboard?.writeText(text).then(done, () => {});
  };
  const body = (hovered?: boolean, pressed?: boolean) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        minHeight: 48,
        marginHorizontal: 6,
        paddingHorizontal: 12,
        paddingVertical: props.subtitle ? 7 : 0,
        borderRadius: 12,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      }}
    >
      {props.icon && <Icon name={props.icon} size={21} color={props.danger ? colors.danger : colors.textSecondary} />}
      <View style={{ flexShrink: props.subtitle || props.copyable ? 1 : 0, flexGrow: props.subtitle ? 1 : 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontFamily, color: props.danger ? colors.danger : colors.text }}>
          {props.label}
        </Text>
        {!!props.subtitle && (
          <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, fontFamily, color: colors.textSecondary, marginTop: 2 }}>
            {props.subtitle}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, minWidth: 0 }}>
        {props.valueIcon && <Icon name={props.valueIcon} size={19} color={colors.textSecondary} />}
        {!!props.value && (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            selectable={!props.copyable}
            style={{ fontSize: 15, fontFamily, color: colors.textSecondary, flexShrink: 1, textAlign: "right" }}
          >
            {props.value}
          </Text>
        )}
        {props.right}
      </View>
      {props.onPress && props.chevron !== false && (
        <View style={{ flexShrink: 0 }}>
          <Icon name="chevronRight" size={16} color={colors.textTertiary} />
        </View>
      )}
    </View>
  );
  if (props.copyable && props.value && !props.onPress) {
    const at = (x: number, y: number) => setMenu({ x, y, width: 0, height: 0 });
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.label}
          onPress={() => {
            setCopied(false);
            setPreview(true);
          }}
          onLongPress={(e) => {
            const n = e.nativeEvent as { pageX?: number; pageY?: number };
            at(n.pageX ?? 0, n.pageY ?? 0);
          }}
          delayLongPress={350}
          {...({
            onContextMenu: (e: { preventDefault(): void; clientX: number; clientY: number }) => {
              e.preventDefault();
              at(e.clientX, e.clientY);
            },
          } as object)}
        >
          {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => body(hovered, pressed)}
        </Pressable>
        <Menu width={130} visible={!!menu} anchor={menu} onClose={() => setMenu(null)} items={[{ label: t("copy"), icon: "copy", onPress: copy }]} />
        <Dialog visible={preview} title={props.label} onClose={() => setPreview(false)}>
          <Text selectable style={{ fontSize: 16, lineHeight: 22, fontFamily, color: colors.text, textAlign: "center" }}>
            {props.value}
          </Text>
          <PrimaryButton title={copied ? t("error.copied") : t("copy")} onPress={copy} />
        </Dialog>
      </>
    );
  }
  if (!props.onPress) return body();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={props.label} onPress={props.onPress}>
      {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => body(hovered, pressed)}
    </Pressable>
  );
}
