import { useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { ScaleRoot } from "./Scale.js";
import { useInsets, useKeyboardHold, useScale } from "./viewport.js";
import { Icon, type IconName } from "./Icon.js";
import { fontFamily, radius, useTheme } from "./theme.js";

export function PrimaryButton(props: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const off = props.disabled || props.loading;
  // A button that cannot be pressed is grey; one that is working keeps its colour (dimmed) with the turning ring.
  const grey = !!props.disabled && !props.loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={props.onPress}
      style={({ pressed }) => ({
        height: 50,
        borderRadius: radius.control + 2,
        backgroundColor: grey ? colors.separator : colors.accent,
        alignItems: "center",
        justifyContent: "center",
        opacity: props.loading ? 0.5 : grey ? 1 : pressed ? 0.8 : 1,
      })}
    >
      {props.loading ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={{ color: grey ? colors.textSecondary : colors.onAccent, fontSize: 17, fontWeight: "600", fontFamily }}>{props.title}</Text>
      )}
    </Pressable>
  );
}

/** Inset field on a secondary surface, iOS-settings style; accent ring on focus (Fluent-like). */
/**
 * A labelled text box. With `revealLabels` (a password box) there is a button at its right end that shows what is typed and hides it
 * again; the text is hidden when the box is made. The two labels are for a screen reader: "show" while it is hidden, "hide" while shown.
 * With `icon` the box is drawn like the search field (44 high, the icon at its left) and the label is its placeholder, not a line above:
 * for forms with several fields.
 */
export function TextField(props: TextInputProps & { label: string; revealLabels?: { show: string; hide: string }; icon?: IconName }) {
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  const [shown, setShown] = useState(false);
  const { label, style: _style, revealLabels, icon, ...rest } = props;
  const reveal = revealLabels && (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shown ? revealLabels.hide : revealLabels.show}
      onPress={() => setShown((v) => !v)}
      hitSlop={6}
      style={
        icon
          ? { width: 32, height: 44, alignItems: "center", justifyContent: "center", marginRight: -8 }
          : { position: "absolute", right: 2, bottom: 0, width: 44, height: 48, alignItems: "center", justifyContent: "center" }
      }
    >
      <Icon name={shown ? "eye" : "eyeOff"} size={20} color={colors.textSecondary} />
    </Pressable>
  );
  const handlers = {
    onFocus: (e: Parameters<NonNullable<TextInputProps["onFocus"]>>[0]) => {
      setFocus(true);
      rest.onFocus?.(e);
    },
    onBlur: (e: Parameters<NonNullable<TextInputProps["onBlur"]>>[0]) => {
      setFocus(false);
      rest.onBlur?.(e);
    },
  };
  if (icon)
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: 44,
          borderRadius: radius.control,
          backgroundColor: colors.bgSecondary,
          paddingHorizontal: 12,
          gap: 8,
          borderWidth: 2,
          borderColor: focus ? colors.accent : "transparent",
        }}
      >
        <Icon name={icon} size={18} color={colors.textSecondary} />
        <TextInput
          {...rest}
          {...(revealLabels ? { secureTextEntry: !shown } : {})}
          accessibilityLabel={label}
          placeholder={label}
          placeholderTextColor={colors.textSecondary}
          {...handlers}
          style={[{ flex: 1, fontSize: 16, fontFamily, color: colors.text, padding: 0 }, { outlineStyle: "none" } as object]}
        />
        {reveal}
      </View>
    );
  return (
    <View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginLeft: 4, fontFamily }}>{label}</Text>
      <TextInput
        {...rest}
        {...(revealLabels ? { secureTextEntry: !shown } : {})}
        placeholderTextColor={colors.textSecondary}
        {...handlers}
        style={[
          {
            ...(rest.multiline ? { minHeight: 96, paddingTop: 12, paddingBottom: 12, textAlignVertical: "top" as const } : { height: 48 }),
            borderRadius: radius.control,
            paddingLeft: 14,
            paddingRight: revealLabels ? 48 : 14,
            fontSize: 17,
            fontFamily,
            color: colors.text,
            backgroundColor: colors.bgSecondary,
            borderWidth: 2,
            borderColor: focus ? colors.accent : "transparent",
          },
          { outlineStyle: "none" } as object,
        ]}
      />
      {reveal}
    </View>
  );
}

/** `size` is the icon; `box` the round button around it (36 unless asked). */
export function IconButton(props: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number; box?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      hitSlop={8}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        width: props.box ?? 36,
        height: props.box ?? 36,
        borderRadius: (props.box ?? 36) / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      })}
    >
      <Icon name={props.icon} color={props.color ?? colors.accent} size={props.size ?? 22} />
    </Pressable>
  );
}

/** Rounded search field (Telegram / iOS): secondary fill, no border, magnifier + placeholder. */
export function SearchField(props: { value: string; onChangeText: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 36,
        borderRadius: radius.control,
        backgroundColor: colors.bgSecondary,
        paddingHorizontal: 10,
        gap: 6,
      }}
    >
      <Icon name="search" size={16} color={colors.textSecondary} />
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={!!props.autoFocus}
        style={[{ flex: 1, fontSize: 16, fontFamily, color: colors.text, padding: 0 }, { outlineStyle: "none" } as object]}
      />
    </View>
  );
}

/** Centered dialog card over a dimmed backdrop (iOS alert / Fluent ContentDialog), not a Material sheet. */
/** `onClose` is also what the system's back and Esc do. With `modal`, pressing the dim area around the dialog does not close it: it needs an answer. */
export function Dialog(props: { visible: boolean; title: string; message?: string; children?: ReactNode; onClose: () => void; modal?: boolean }) {
  const { colors } = useTheme();
  const scale = useScale();
  // The keyboard comes up over the dialog, not over a page that was lifted behind it: the dialog moves up by itself.
  useKeyboardHold(props.visible);
  const keyboard = useInsets().keyboard ?? 0;
  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
      <ScaleRoot scale={scale}>
        <Pressable
          onPress={props.modal ? undefined : props.onClose}
          style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 24, paddingBottom: 24 + keyboard }}
        >
          <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 400, borderRadius: 16, backgroundColor: colors.bg, padding: 20, gap: 14 }}>
            <Text style={{ fontSize: 19, fontWeight: "700", fontFamily, color: colors.text, textAlign: "center" }}>{props.title}</Text>
            {!!props.message && (
              <Text style={{ fontSize: 15, lineHeight: 20, fontFamily, color: colors.textSecondary, textAlign: "center" }}>{props.message}</Text>
            )}
            {props.children}
          </Pressable>
        </Pressable>
      </ScaleRoot>
    </Modal>
  );
}

/** Quiet text button for secondary actions. */
export function TextButton(props: { title: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.control,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      })}
    >
      <Text style={{ fontSize: 16, fontWeight: "500", fontFamily, color: props.danger ? colors.danger : colors.accent }}>{props.title}</Text>
    </Pressable>
  );
}

/** Inline notice bar with an action, used above lists. */
export function Banner(props: { text: string; actionLabel: string; onAction: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginHorizontal: 12,
        marginBottom: 4,
        padding: 10,
        paddingLeft: 14,
        borderRadius: 12,
        backgroundColor: colors.bgSecondary,
      }}
    >
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 18, fontFamily, color: colors.text }}>{props.text}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={props.onAction}
        style={({ pressed }) => ({ backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, opacity: pressed ? 0.8 : 1 })}
      >
        <Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: "600", fontFamily }}>{props.actionLabel}</Text>
      </Pressable>
    </View>
  );
}
