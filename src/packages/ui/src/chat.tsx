import { useEffect, useRef, useState, type ComponentRef } from "react";
import type React from "react";
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Icon } from "./Icon.js";
import { EmojiPicker } from "./EmojiPicker.js";
import { useUnzoom, useViewport } from "./viewport.js";
import { AudioRow, FileTile, LinkPreviewCard, ProgressRing } from "./media.js";
import { RichText, type Run } from "./richtext.js";
import { fontFamily, peerColor, popoverShadow, radius, useTheme } from "./theme.js";

/** Message bubble: large continuous radii, joined corners inside a run of plain text, time + state inside. */
/** Which corners of a bubble touch a neighbour: they are tight there (only plain text bubbles do). */
export type BubbleStuck = { above: boolean; below: boolean };

export function Bubble(props: {
  own: boolean;
  text: string;
  /** Styled runs of the body (rich text or bare URLs turned into links). Falls back to plain `text`. */
  runs?: readonly Run[] | undefined;
  /** Open a link or a mention pill. */
  onLink?: ((href: string) => void) | undefined;
  /** The message mentions me: tint the bubble. */
  mentionsMe?: boolean | undefined;
  /** Pinned in the room; a pin marker goes into the meta row. */
  pinned?: boolean | undefined;
  time: string;
  /** Long press on a photo, video, file or quote: those are buttons and would otherwise keep the press from the bubble's menu. */
  onLongPress?: ((e: { nativeEvent: object }) => void) | undefined;
  senderName?: string | undefined;
  senderId?: string | undefined;
  /** Image message; with no `text` the image fills the bubble and the time sits on it (Telegram style). */
  image?: { uri: string | undefined; width: number; height: number; onPress?: (() => void) | undefined } | undefined;
  /** Video: poster with a play button and its length; press opens the player. */
  video?: { posterUri?: string | undefined; width: number; height: number; durationLabel?: string | undefined; onPress?: (() => void) | undefined } | undefined;
  /** Audio file or voice message with play/pause, progress and time. */
  audio?:
    | {
        voice: boolean;
        name: string;
        samples?: number[] | undefined;
        progress: number;
        timeLabel: string;
        playLabel: string;
        onToggle: () => void;
      }
    | undefined;
  /** The file is still uploading: a progress ring with a cancel cross replaces the play button / sits on the picture. */
  upload?: { progress: number; failed?: boolean | undefined; label: string; cancelLabel: string; onCancel: () => void } | undefined;
  /** File attachment row (icon, name, size); press downloads it. */
  file?: { name: string; sizeLabel: string; onPress: () => void } | undefined;
  /** Link preview cards, rendered under the text. */
  previews?:
    | readonly {
        key: string;
        url: string;
        title?: string | undefined;
        description?: string | undefined;
        siteName?: string | undefined;
        image?: string | undefined;
        imageWidth?: number | undefined;
        imageHeight?: number | undefined;
      }[]
    | undefined;
  onOpenLink?: ((url: string) => void) | undefined;
  /** Corners that touch a neighbouring plain text bubble. */
  stuck?: BubbleStuck | undefined;
  /** Quoted message shown at the top; press jumps to the original. */
  reply?: { senderName: string; senderId: string; preview: string; onPress: () => void } | undefined;
  /** Localised "edited" marker shown before the time. */
  editedLabel?: string | undefined;
  status?: "sending" | "sent" | "read" | "failed" | undefined;
  readLabel?: string | undefined;
  /** A message that could not be sent: the alert mark in its status is a button that sends it again. */
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  const R = radius.bubble,
    r = radius.bubbleTight;
  const { above, below } = props.stuck ?? { above: false, below: false };
  // The tail side shrinks on the corners that touch a neighbouring bubble; the other side keeps the full radius.
  const corners = props.own
    ? { borderTopLeftRadius: R, borderBottomLeftRadius: R, borderTopRightRadius: above ? r : R, borderBottomRightRadius: below ? r : R }
    : { borderTopRightRadius: R, borderBottomRightRadius: R, borderTopLeftRadius: above ? r : R, borderBottomLeftRadius: below ? r : R };
  // Only take the rich path when there is something to style: plain text keeps the plain node (and its DOM shape).
  const richRuns = props.runs?.some((r) => r.bold || r.italic || r.underline || r.strike || r.code || r.href || r.userId || r.spoiler || r.prefix || r.br)
    ? props.runs
    : undefined;
  const media = props.image ?? props.video;
  const imageOnly = !!media && !props.text;
  // A file on its own is a card, the same for both sides (as WeChat shows files): neutral surface, the kind of file on a tile.
  const fileCard = !!props.file && !props.text && !props.reply;
  const mine = props.own && !fileCard;
  const fg = mine ? colors.bubbleOutText : colors.bubbleInText;
  const meta = imageOnly ? "#FFFFFF" : mine ? colors.bubbleOutMeta : colors.textSecondary;
  const statusIcon = props.status === "sending" ? "clock" : props.status === "failed" ? "alert" : props.status === "read" ? "checks" : "check";
  const failed = props.status === "failed";
  const metaRow = (
    <View
      style={[
        {
          position: "absolute",
          flexShrink: 0,
          right: imageOnly ? 8 : fileCard ? 14 : 12,
          bottom: imageOnly ? 8 : 6,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        imageOnly && { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
      ]}
    >
      {props.pinned && <Icon name="pin" size={14} color={failed ? colors.danger : meta} />}
      <Text numberOfLines={1} style={{ fontSize: 14, fontFamily, color: failed ? colors.danger : meta }}>
        {props.editedLabel ? `${props.editedLabel} ` : ""}
        {props.time}
      </Text>
      {props.own &&
        (failed && props.onRetry ? (
          <Pressable accessibilityRole="button" accessibilityLabel={props.retryLabel ?? "Send again"} onPress={props.onRetry} hitSlop={8}>
            <Icon name={statusIcon} size={18} strokeWidth={2} color={colors.danger} />
          </Pressable>
        ) : (
          <View accessibilityLabel={props.status === "read" ? (props.readLabel ?? "Read") : undefined}>
            <Icon
              name={statusIcon}
              size={props.status === "read" ? 20 : 18}
              strokeWidth={2}
              color={failed ? colors.danger : props.status === "read" ? "#FFFFFF" : meta}
            />
          </View>
        ))}
    </View>
  );
  // An audio message is played and paused by pressing anywhere on its bubble (there is no play button and no seeking).
  const onTapAudio = props.audio && !props.upload ? props.audio.onToggle : undefined;
  const Root: React.ElementType = onTapAudio ? Pressable : View;
  const rootProps = onTapAudio
    ? { accessibilityRole: "button", accessibilityLabel: props.audio?.playLabel, onPress: onTapAudio, onLongPress: props.onLongPress, delayLongPress: 350 }
    : {};
  return (
    <Root
      {...rootProps}
      style={[
        {
          maxWidth: "100%",
          overflow: "hidden",
          backgroundColor: mine ? colors.bubbleOut : props.mentionsMe ? colors.mentionBg : colors.bubbleIn,
          ...(imageOnly
            ? {}
            : fileCard
              ? { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 }
              : { paddingHorizontal: 12, paddingTop: 7, paddingBottom: 6 }),
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
          onLongPress={props.onLongPress}
          delayLongPress={350}
          // At the very top of a bubble the quote's bar would sit in the rounded corner; it starts a little lower, so the bar is not squeezed into the curve.
          style={{ flexDirection: "row", gap: 8, marginBottom: 4, ...(imageOnly ? { padding: 8 } : props.senderName ? {} : { marginTop: 4.5 }) }}
        >
          <View
            style={{
              width: 3,
              borderTopLeftRadius: 3,
              borderBottomLeftRadius: 3,
              backgroundColor: props.own ? "rgba(255,255,255,0.8)" : peerColor(props.reply.senderId),
            }}
          />
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
        // Photos are looked at, so the hand cursor and a tap opens the viewer (the rest of the bubble is text and keeps the text cursor).
        <PressableOrView
          plain={!!props.upload}
          accessibilityLabel="Open photo"
          disabled={!props.image.onPress}
          onPress={props.image.onPress}
          onLongPress={props.onLongPress}
          style={[
            {
              width: props.image.width,
              height: props.image.height,
              maxWidth: "100%",
              backgroundColor: colors.bgSecondary,
              ...(imageOnly ? {} : { marginHorizontal: -12, marginBottom: 6, marginTop: props.senderName ? 0 : -7, width: props.image.width + 24 }),
            },
            props.image.onPress ? ({ cursor: "pointer" } as object) : {},
          ]}
        >
          {props.image.uri && <Image source={{ uri: props.image.uri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />}
          {props.upload && <UploadOverlay upload={props.upload} />}
        </PressableOrView>
      )}
      {props.video && (
        <PressableOrView
          plain={!!props.upload}
          accessibilityLabel="Open video"
          disabled={!props.video.onPress || !!props.upload}
          onPress={props.video.onPress}
          onLongPress={props.onLongPress}
          style={[
            {
              width: props.video.width,
              height: props.video.height,
              maxWidth: "100%",
              backgroundColor: "#10161D",
              ...(imageOnly ? {} : { marginHorizontal: -12, marginBottom: 6, marginTop: props.senderName ? 0 : -7, width: props.video.width + 24 }),
            },
            props.video.onPress ? ({ cursor: "pointer" } as object) : {},
          ]}
        >
          {props.video.posterUri && <Image source={{ uri: props.video.posterUri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />}
          {props.upload ? (
            <UploadOverlay upload={props.upload} />
          ) : (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
                <Icon name="play" size={28} strokeWidth={2.4} color="#FFFFFF" />
              </View>
            </View>
          )}
          {!!props.video.durationLabel && (
            <View
              style={{ position: "absolute", left: 8, top: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}
            >
              <Text style={{ fontSize: 12, fontFamily, color: "#FFFFFF" }}>{props.video.durationLabel}</Text>
            </View>
          )}
        </PressableOrView>
      )}
      {props.audio && <AudioRow own={props.own} {...props.audio} upload={props.upload} />}
      {props.file && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.file.name}
          onPress={props.file.onPress}
          onLongPress={props.onLongPress}
          delayLongPress={350}
          // A fixed card: the name always has two lines of room (cut with an ellipsis, or blank below a short one), the size sits at the foot, the tile at the right, and the time under the tile.
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 14,
            height: fileCard ? 64 : undefined,
            width: fileCard ? 232 : undefined,
            maxWidth: "100%",
            ...(fileCard ? {} : { minWidth: 220 }),
          }}
        >
          <View style={{ flex: 1, flexShrink: 1, height: fileCard ? 64 : undefined, justifyContent: "space-between" }}>
            <View style={{ height: 40, overflow: "hidden" }}>
              <Text numberOfLines={2} ellipsizeMode="tail" style={{ fontSize: 15, lineHeight: 20, fontWeight: "500", fontFamily, color: fg }}>
                {props.file.name}
              </Text>
            </View>
            <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontFamily, color: meta }}>
              {props.upload ? props.upload.label : props.file.sizeLabel}
            </Text>
          </View>
          {props.upload ? (
            <ProgressRing
              size={44}
              progress={props.upload.progress}
              failed={props.upload.failed}
              onCancel={props.upload.onCancel}
              label={props.upload.cancelLabel}
              dark
            />
          ) : (
            <FileTile name={props.file.name} />
          )}
        </Pressable>
      )}
      {!!props.text && (
        // Time floats at the end of the last text line, like Telegram.
        <Text selectable style={{ fontSize: 16, lineHeight: 21, fontFamily, color: props.muted ? meta : fg, fontStyle: props.muted ? "italic" : "normal" }}>
          {richRuns ? (
            <RichText
              runs={richRuns}
              style={{}}
              color={fg}
              linkColor={props.own ? colors.bubbleOutText : colors.accent}
              mentionColor={props.own ? colors.bubbleOutText : colors.accent}
              mentionBg={props.own ? "rgba(255,255,255,0.22)" : colors.mentionBg}
              onLink={props.onLink}
            />
          ) : (
            props.text
          )}
          <Text style={{ fontSize: 14, color: "transparent" }} selectable={false}>
            {"\u00A0".repeat(Math.ceil((props.time.length + (props.editedLabel ? props.editedLabel.length + 1 : 0)) * 2.3) + (props.own ? 8 : 0) + 4)}
          </Text>
        </Text>
      )}
      {props.previews?.map((p) => (
        <LinkPreviewCard
          key={p.key}
          url={p.url}
          title={p.title}
          description={p.description}
          siteName={p.siteName}
          image={p.image}
          imageWidth={p.imageWidth}
          imageHeight={p.imageHeight}
          own={props.own}
          onPress={() => props.onOpenLink?.(p.url)}
        />
      ))}
      {metaRow}
    </Root>
  );
}

/** A button, except while uploading: the progress ring inside is a button too, and buttons cannot nest. */
function PressableOrView(props: {
  plain: boolean;
  accessibilityLabel: string;
  disabled: boolean;
  onPress?: (() => void) | undefined;
  onLongPress?: ((e: { nativeEvent: object }) => void) | undefined;
  style: object;
  children: React.ReactNode;
}) {
  if (props.plain) return <View style={props.style}>{props.children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      disabled={props.disabled}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={350}
      style={props.style}
    >
      {props.children}
    </Pressable>
  );
}

function UploadOverlay({ upload }: { upload: NonNullable<Parameters<typeof Bubble>[0]["upload"]> }) {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.28)",
      }}
    >
      <ProgressRing progress={upload.progress} failed={upload.failed} onCancel={upload.onCancel} label={upload.cancelLabel} />
      <View
        style={{ position: "absolute", bottom: 8, left: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}
      >
        <Text style={{ fontSize: 12, fontFamily, color: "#FFFFFF" }}>{upload.label}</Text>
      </View>
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
  prefill?: { text: string; nonce: number; /** Put the caret here after replacing the text. */ caret?: number } | undefined;
  /** Shows a paperclip button when provided. */
  onAttach?: (() => void) | undefined;
  /** Called while the user types (true) and when they stop or send (false). */
  onTyping?: ((typing: boolean) => void) | undefined;
  /** Record buttons (camera, microphone) shown instead of Send while the field is empty. */
  record?: { onVoice: () => void; onVideo?: (() => void) | undefined; voiceLabel: string; videoLabel?: string | undefined } | undefined;
  /** A voice recording in progress replaces the field with a recording bar. */
  recording?:
    { seconds: string; levels: number[]; sendLabel: string; cancelLabel: string; recordingLabel: string; onSend: () => void; onCancel: () => void } | undefined;
  /** A short message above the bar, e.g. why recording could not start. */
  notice?: string | undefined;
  /** Every text change, so the caller can drive @mention autocomplete. */
  onChangeText?: ((text: string) => void) | undefined;
  /** People matching the `@token` being typed; picked with the arrow keys or a tap. */
  suggestions?: readonly { userId: string; name: string }[] | undefined;
  onPickSuggestion?: ((s: { userId: string; name: string }) => void) | undefined;
  /** The caret moved (selection changed); drives where an "@" is being typed. */
  onCaretChange?: ((caret: number) => void) | undefined;
  /** Index of the "@" the suggestion menu belongs to; the menu opens under it. */
  suggestionAt?: number | undefined;
  /** Escape closes the suggestion menu without picking. */
  onDismissSuggestions?: (() => void) | undefined;
  /** Heading of the suggestion menu ("Choose who to notify"). */
  mentionTitle?: string | undefined;
  /** Space above the composer that belongs to the screen's top bar: the menu never grows into it. */
  menuTopLimit?: number | undefined;
  /** Emoji chosen from the picker: inserted at the end of the draft. */
  onEmoji?: ((emoji: string) => void) | undefined;
  emojiLabel?: string | undefined;
  emojiSearchLabel?: string | undefined;
  mentionLabel?: string | undefined;
  /** Recently used emoji, shown first in the picker. */
  recentEmoji?: readonly string[] | undefined;
}) {
  const { colors, dark } = useTheme();
  const [text, setText] = useState("");
  const [height, setHeight] = useState(22);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // The menu is keyboard-driven while the caret stays in the field: `active` is a highlight, -1 = none.
  const [active, setActive] = useState(-1);
  const [box, setBox] = useState({ width: 0, y: 0 });
  const barRef = useRef<ComponentRef<typeof View>>(null);
  const win = useViewport();
  const un = useUnzoom();
  const [field, setField] = useState({ x: 0 });
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const nonce = props.prefill?.nonce;
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    if (!props.prefill) return;
    setText(props.prefill.text);
    const c = props.prefill.caret;
    if (c !== undefined) {
      // After the new text is in the field, put the caret back where the edit happened.
      setTimeout(() => {
        const el = inputRef.current as unknown as {
          setSelection?(a: number, b: number): void;
          setSelectionRange?(a: number, b: number): void;
          focus?(): void;
        } | null;
        el?.focus?.();
        if (el?.setSelection) el.setSelection(c, c);
        else el?.setSelectionRange?.(c, c);
      }, 0);
    }
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
  const suggestions = props.suggestions ?? [];
  const menuOpen = suggestions.length > 0;
  // onLayout only fires on size changes, not when the bar moves (window resized, banner shown): measure when it matters.
  useEffect(() => {
    if (menuOpen) barRef.current?.measureInWindow((_x, y, width) => setBox({ width: un(width), y: un(y) }));
  }, [menuOpen, suggestions.length, win.height, win.width]);
  const firstId = suggestions[0]?.userId;
  useEffect(() => setActive(-1), [suggestions.length, firstId]);
  const pick = (i: number) => {
    const s = suggestions[i];
    if (s) props.onPickSuggestion?.(s);
  };
  const MENU_W = 260;
  const ROW_H = 36;
  const HEAD_H = 32;
  // Room for the list: whatever lies between the top bar and the composer, less a margin so the menu never touches the bar.
  const maxMenu = Math.max(HEAD_H + ROW_H, box.y - (props.menuTopLimit ?? 0) - 16);
  const listMax = maxMenu - HEAD_H - 4;
  const showRow = (i: number) => {
    const top = i * ROW_H;
    if (top < scrollY.current) listRef.current?.scrollTo({ y: top, animated: false });
    else if (top + ROW_H > scrollY.current + listMax) listRef.current?.scrollTo({ y: top + ROW_H - listMax, animated: false });
  };
  const move = (i: number) => {
    setActive(i);
    if (i >= 0) showRow(i);
  };
  // The menu opens at the "@" being typed: measure the text before it on the current line.
  const at = props.suggestionAt ?? -1;
  const atX = (() => {
    if (at < 0) return 0;
    const line = text.slice(0, at).split("\n").pop() ?? "";
    const canvas = (
      globalThis as { document?: { createElement(t: string): { getContext(k: string): { font: string; measureText(s: string): { width: number } } | null } } }
    ).document?.createElement("canvas");
    const ctx = canvas?.getContext("2d");
    if (!ctx) return 0;
    ctx.font = `16px ${fontFamily}`;
    return ctx.measureText(line).width;
  })();
  const menuLeft = Math.max(8, Math.min(field.x + 1 + 14 + atX, Math.max(8, box.width - MENU_W - 8)));
  const change = (v: string) => {
    setText(v);
    props.onChangeText?.(v);
    props.onTyping?.(v.trim().length > 0);
  };
  const insertEmoji = (emoji: string) => {
    const next = text + emoji;
    setText(next);
    props.onChangeText?.(next);
    props.onEmoji?.(emoji);
    setEmojiOpen(false);
  };
  return (
    <View
      ref={barRef}
      onLayout={(e) => {
        // Read it now: the updater runs later, and by then React has let go of the event.
        const width = e.nativeEvent.layout.width;
        setBox((b) => ({ ...b, width }));
      }}
      style={{ backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.separator, zIndex: 4 }}
    >
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
      {menuOpen && (
        // A floating menu like the context menus (same surface, radius and shadow), placed at the "@" and capped so it
        // stops short of the top bar; longer lists scroll under the fixed heading.
        <View
          accessibilityLabel={props.mentionLabel ?? "Mention suggestions"}
          style={[
            {
              position: "absolute",
              left: menuLeft,
              bottom: "100%",
              marginBottom: 6,
              width: MENU_W,
              maxHeight: maxMenu,
              padding: 2,
              borderRadius: 12,
              backgroundColor: colors.bg,
              zIndex: 6,
            },
            popoverShadow(dark),
          ]}
        >
          <View style={{ height: HEAD_H, justifyContent: "center", paddingHorizontal: 14 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", fontFamily, color: colors.textSecondary }}>
              {props.mentionTitle ?? "Choose who to notify"}
            </Text>
          </View>
          <ScrollView
            ref={listRef}
            style={{ maxHeight: listMax }}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
          >
            {suggestions.map((s, i) => (
              <Pressable
                key={s.userId}
                accessibilityRole="menuitem"
                accessibilityLabel={`Mention ${s.name}`}
                aria-selected={i === active}
                onPress={() => props.onPickSuggestion?.(s)}
                style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                  height: ROW_H,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: pressed || i === active ? colors.separator : hovered ? colors.hover : "transparent",
                })}
              >
                <Text numberOfLines={1} style={{ fontSize: 15, fontFamily, color: colors.text }}>
                  {s.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      {!!props.notice && (
        <Text accessibilityRole="alert" style={{ paddingHorizontal: 14, paddingTop: 8, fontSize: 13, fontFamily, color: colors.danger }}>
          {props.notice}
        </Text>
      )}
      {emojiOpen && (
        <View style={{ position: "absolute", bottom: 62, left: 8, zIndex: 5 }}>
          <EmojiPicker onPick={insertEmoji} recent={props.recentEmoji ?? []} searchLabel={props.emojiSearchLabel ?? "Search emoji"} />
        </View>
      )}
      {props.recording ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, paddingHorizontal: 10, minHeight: 54 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.recording.cancelLabel}
            onPress={props.recording.onCancel}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
              width: 38,
              height: 38,
              // The icon floats inside its button: pull the bar in so the gap to the icon looks as wide as the one to Send.
              marginRight: -10,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
            })}
          >
            <Icon name="trash" size={22} color={colors.danger} />
          </Pressable>
          <View
            accessibilityLabel={props.recording.recordingLabel}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              height: 38,
              paddingHorizontal: 14,
              borderRadius: 19,
              backgroundColor: colors.bgSecondary,
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
            <Text accessibilityLabel="Recording time" style={{ fontSize: 16, fontFamily, color: colors.text, fontVariant: ["tabular-nums"], minWidth: 40 }}>
              {props.recording.seconds}
            </Text>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, height: 24, overflow: "hidden" }}>
              {props.recording.levels.slice(-40).map((v, i) => (
                <View key={i} style={{ width: 3, borderRadius: 1.5, height: Math.max(3, Math.round(v * 22)), backgroundColor: colors.accent }} />
              ))}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.recording.sendLabel}
            onPress={props.recording.onSend}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.accent,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Icon name="send" size={20} strokeWidth={2.5} color={colors.onAccent} />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8, paddingHorizontal: 10 }}>
          {(props.onEmoji || props.onAttach || props.record?.onVideo) && (
            // The buttons touch (their icons sit 12 px apart inside the 38 px boxes), and a little closer to the field than the row's gap.
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 0, marginRight: -2 }}>
              {props.onEmoji && (
                <View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={props.emojiLabel ?? "Emoji"}
                    onPress={() => setEmojiOpen((v) => !v)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
                    })}
                  >
                    <Icon name="smile" size={26} color={emojiOpen ? colors.accent : colors.textSecondary} />
                  </Pressable>
                </View>
              )}
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
                  <Icon name="attach" size={26} color={colors.textSecondary} />
                </Pressable>
              )}
              {props.record?.onVideo && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={props.record.videoLabel ?? "Record a video"}
                  onPress={props.record.onVideo}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
                  })}
                >
                  <Icon name="camera" size={26} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
          )}
          <View
            onLayout={(e) => setField({ x: e.nativeEvent.layout.x })}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: 19,
              borderWidth: 1,
              borderColor: colors.separator,
              backgroundColor: colors.bg,
              paddingLeft: 14,
              paddingRight: props.record && text.length === 0 ? 6 : 14,
              paddingVertical: 7,
              flexDirection: "row",
              alignItems: "flex-end",
            }}
          >
            <View style={{ flex: 1, minHeight: 24, justifyContent: "center" }}>
              <TextInput
                ref={inputRef}
                onSelectionChange={(e) => props.onCaretChange?.(e.nativeEvent.selection.end)}
                multiline
                value={text}
                onChangeText={change}
                onBlur={() => props.onTyping?.(false)}
                placeholder={props.placeholder}
                placeholderTextColor={colors.textSecondary}
                onContentSizeChange={(e) => setHeight(Math.min(120, Math.max(22, e.nativeEvent.contentSize.height)))}
                onKeyPress={(e) => {
                  const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                  if (Platform.OS === "web" && menuOpen) {
                    const last = suggestions.length - 1;
                    if (ne.key === "ArrowUp") {
                      e.preventDefault();
                      move(active < 0 ? last : Math.max(0, active - 1)); // the menu sits above the field: Up climbs into it from the bottom row
                      return;
                    }
                    if (ne.key === "ArrowDown" && active >= 0) {
                      e.preventDefault();
                      move(active >= last ? -1 : active + 1); // past the bottom row: back to the field
                      return;
                    }
                    if ((ne.key === "Enter" || ne.key === "Tab") && active >= 0) {
                      e.preventDefault();
                      pick(active);
                      return;
                    }
                    if (ne.key === "Escape") {
                      e.preventDefault();
                      props.onDismissSuggestions?.();
                      return;
                    }
                  }
                  if (Platform.OS === "web" && ne.key === "Enter" && !ne.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                style={[{ height, fontSize: 16, lineHeight: 21, fontFamily, color: colors.text, padding: 0 }, { outlineStyle: "none" } as object]}
              />
            </View>
            {props.record && text.length === 0 && (
              // Voice sits inside the field, at its right edge, and goes away once something is typed.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.record.voiceLabel}
                onPress={props.record.onVoice}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                  width: 30,
                  height: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.6 : hovered ? 0.8 : 1,
                })}
              >
                <Icon name="mic" size={22} color={colors.textSecondary} />
              </Pressable>
            )}
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
      )}
    </View>
  );
}
