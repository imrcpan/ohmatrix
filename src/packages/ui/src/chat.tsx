import { useEffect, useState } from "react";
import { Image, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Icon } from "./Icon.js";
import { fontFamily, peerColor, radius, useTheme } from "./theme.js";

export type BubblePosition = { first: boolean; last: boolean };

/** Message bubble: large continuous radii, joined corners inside a sender run, time + state inside. */
export function Bubble(props: {
  own: boolean;
  text: string;
  time: string;
  senderName?: string | undefined;
  senderId?: string | undefined;
  /** Image message; with no `text` the image fills the bubble and the time sits on it (Telegram style). */
  image?: { uri: string | undefined; width: number; height: number } | undefined;
  /** File attachment row (icon, name, size); press downloads it. */
  file?: { name: string; sizeLabel: string; onPress: () => void } | undefined;
  /** Quoted message shown at the top; press jumps to the original. */
  reply?: { senderName: string; senderId: string; preview: string; onPress: () => void } | undefined;
  /** Localised "edited" marker shown before the time. */
  editedLabel?: string | undefined;
  position: BubblePosition;
  status?: "sending" | "sent" | "read" | "failed" | undefined;
  readLabel?: string | undefined;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  const R = radius.bubble,
    r = radius.bubbleTight;
  const { first, last } = props.position;
  // The tail side shrinks on the corners that touch neighbouring bubbles.
  const corners = props.own
    ? { borderTopLeftRadius: R, borderBottomLeftRadius: R, borderTopRightRadius: first ? R : r, borderBottomRightRadius: last ? R : r }
    : { borderTopRightRadius: R, borderBottomRightRadius: R, borderTopLeftRadius: first ? R : r, borderBottomLeftRadius: last ? R : r };
  const imageOnly = !!props.image && !props.text;
  const fg = props.own ? colors.bubbleOutText : colors.bubbleInText;
  const meta = imageOnly ? "#FFFFFF" : props.own ? colors.bubbleOutMeta : colors.textSecondary;
  const statusIcon = props.status === "sending" ? "clock" : props.status === "failed" ? "alert" : props.status === "read" ? "checks" : "check";
  const failed = props.status === "failed";
  const metaRow = (
    <View
      style={[
        { position: "absolute", flexShrink: 0, right: imageOnly ? 8 : 12, bottom: imageOnly ? 8 : 6, flexDirection: "row", alignItems: "center", gap: 6 },
        imageOnly && { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
      ]}
    >
      <Text numberOfLines={1} style={{ fontSize: 14, fontFamily, color: failed ? colors.danger : meta }}>
        {props.editedLabel ? `${props.editedLabel} ` : ""}
        {props.time}
      </Text>
      {props.own && (
        <View accessibilityLabel={props.status === "read" ? (props.readLabel ?? "Read") : undefined}>
          <Icon
            name={statusIcon}
            size={props.status === "read" ? 20 : 18}
            strokeWidth={2.4}
            color={failed ? colors.danger : props.status === "read" ? "#FFFFFF" : meta}
          />
        </View>
      )}
    </View>
  );
  return (
    <View
      style={[
        {
          maxWidth: "100%",
          overflow: "hidden",
          backgroundColor: props.own ? colors.bubbleOut : colors.bubbleIn,
          ...(imageOnly ? {} : { paddingHorizontal: 12, paddingTop: 7, paddingBottom: 6 }),
        },
        corners,
      ]}
    >
      {!!props.senderName && (
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            fontWeight: "600",
            fontFamily,
            color: peerColor(props.senderId ?? props.senderName),
            marginBottom: 2,
            ...(imageOnly ? { paddingHorizontal: 12, paddingTop: 7 } : {}),
          }}
        >
          {props.senderName}
        </Text>
      )}
      {props.reply && (
        <Pressable
          accessibilityRole="button"
          onPress={props.reply.onPress}
          style={{ flexDirection: "row", gap: 8, marginBottom: 4, ...(imageOnly ? { padding: 8 } : {}) }}
        >
          <View style={{ width: 2, borderRadius: 1, backgroundColor: props.own ? "rgba(255,255,255,0.8)" : peerColor(props.reply.senderId) }} />
          <View style={{ flexShrink: 1 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 14, fontWeight: "600", fontFamily, color: props.own ? colors.bubbleOutText : peerColor(props.reply.senderId) }}
            >
              {props.reply.senderName}
            </Text>
            <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 18, fontFamily, color: props.own ? colors.bubbleOutMeta : colors.textSecondary }}>
              {props.reply.preview}
            </Text>
          </View>
        </Pressable>
      )}
      {props.image && (
        <View
          style={{
            width: props.image.width,
            height: props.image.height,
            maxWidth: "100%",
            backgroundColor: colors.bgSecondary,
            ...(imageOnly ? {} : { marginHorizontal: -12, marginBottom: 6, marginTop: props.senderName ? 0 : -7, width: props.image.width + 24 }),
          }}
        >
          {props.image.uri && <Image source={{ uri: props.image.uri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />}
        </View>
      )}
      {props.file && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.file.name}
          onPress={props.file.onPress}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 8, paddingBottom: 14, minWidth: 190 }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: props.own ? "rgba(255,255,255,0.22)" : colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="file" size={22} color={colors.onAccent} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "500", fontFamily, color: fg }}>
              {props.file.name}
            </Text>
            <Text style={{ fontSize: 13, fontFamily, color: meta }}>{props.file.sizeLabel}</Text>
          </View>
        </Pressable>
      )}
      {!!props.text && (
        // Time floats at the end of the last text line, like Telegram.
        <Text selectable style={{ fontSize: 16, lineHeight: 21, fontFamily, color: props.muted ? meta : fg, fontStyle: props.muted ? "italic" : "normal" }}>
          {props.text}
          <Text style={{ fontSize: 14, color: "transparent" }} selectable={false}>
            {"\u00A0".repeat(Math.ceil((props.time.length + (props.editedLabel ? props.editedLabel.length + 1 : 0)) * 2.3) + (props.own ? 8 : 0) + 4)}
          </Text>
        </Text>
      )}
      {metaRow}
    </View>
  );
}

/** Centered translucent pill: date separators and service messages. */
export function Chip(props: { text: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignSelf: "center",
        backgroundColor: colors.serviceChip,
        borderRadius: radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginVertical: 6,
        maxWidth: "86%",
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "500", fontFamily, color: colors.serviceChipText, textAlign: "center" }}>{props.text}</Text>
    </View>
  );
}

/** Rounded multi-line composer with circular accent send button. Enter sends, Shift+Enter newline (web). */
export function Composer(props: {
  placeholder: string;
  onSend: (text: string) => void;
  /** Reply/edit banner above the field. */
  context?: { kind: "reply" | "edit"; title: string; preview: string } | undefined;
  onCancelContext?: (() => void) | undefined;
  /** Replaces the field text whenever `nonce` changes (used to start editing). */
  prefill?: { text: string; nonce: number } | undefined;
  /** Shows a paperclip button when provided. */
  onAttach?: (() => void) | undefined;
  /** Called while the user types (true) and when they stop or send (false). */
  onTyping?: ((typing: boolean) => void) | undefined;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [height, setHeight] = useState(22);
  const nonce = props.prefill?.nonce;
  useEffect(() => {
    if (props.prefill) setText(props.prefill.text);
  }, [nonce]);
  const canSend = text.trim().length > 0;
  const send = () => {
    if (canSend) {
      props.onTyping?.(false);
      props.onSend(text.trim());
      setText("");
      setHeight(22);
    }
  };
  const change = (v: string) => {
    setText(v);
    props.onTyping?.(v.trim().length > 0);
  };
  return (
    <View style={{ backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.separator }}>
      {props.context && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingTop: 8 }}>
          <Icon name={props.context.kind === "edit" ? "edit" : "reply"} size={20} color={colors.accent} />
          <View style={{ width: 2, alignSelf: "stretch", borderRadius: 1, backgroundColor: colors.accent }} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.accent }}>
              {props.context.title}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>
              {props.context.preview}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Cancel ${props.context.kind}`} onPress={props.onCancelContext} hitSlop={8}>
            <Icon name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8, paddingHorizontal: 10 }}>
        {props.onAttach && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach"
            onPress={props.onAttach}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
            })}
          >
            <Icon name="attach" size={22} color={colors.textSecondary} />
          </Pressable>
        )}
        <View
          style={{
            flex: 1,
            minHeight: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: colors.separator,
            backgroundColor: colors.bg,
            paddingHorizontal: 14,
            paddingVertical: 7,
            justifyContent: "center",
          }}
        >
          <TextInput
            multiline
            value={text}
            onChangeText={change}
            onBlur={() => props.onTyping?.(false)}
            placeholder={props.placeholder}
            placeholderTextColor={colors.textSecondary}
            onContentSizeChange={(e) => setHeight(Math.min(120, Math.max(22, e.nativeEvent.contentSize.height)))}
            onKeyPress={(e) => {
              const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
              if (Platform.OS === "web" && ne.key === "Enter" && !ne.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            style={[{ height, fontSize: 16, lineHeight: 21, fontFamily, color: colors.text, padding: 0 }, { outlineStyle: "none" } as object]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!canSend}
          onPress={send}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: canSend ? colors.accent : colors.bgSecondary,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name="send" size={20} strokeWidth={2.5} color={canSend ? colors.onAccent : colors.textTertiary} />
        </Pressable>
      </View>
    </View>
  );
}
