import { createElement, useState, type ComponentProps } from "react";
import { contentText, type TimelineItem } from "@ohmatrix/core";
import type { OpenRoom } from "@ohmatrix/state";
import { useRecentEmoji, type Composer } from "@ohmatrix/ui";
import { useController } from "../context.js";
import { StickerPane } from "./StickerPane.js";
import { STICKER_GAP, STICKER_MAX_COLS, STICKER_PAD, STICKER_TILE } from "./stickerGrid.js";
import { useMentionSuggest } from "../useMentions.js";
import type { Translate } from "./types.js";

export type ComposerProps = ComponentProps<typeof Composer>;

/**
 * The message box: the draft and caret, replying to or editing a message, @mention suggestions and recent emoji, and
 * sending. Returns the props the `Composer` needs for all of that (attachments and recording add their own).
 */
export function useComposer(roomId: string, handle: { readonly current: OpenRoom | null }, t: Translate) {
  const controller = useController();
  const [replying, setReplying] = useState<TimelineItem | null>(null);
  const [editing, setEditing] = useState<TimelineItem | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number; caret?: number }>();
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const mention = useMentionSuggest(controller, roomId, draft, caret);
  const { recent, remember } = useRecentEmoji();

  const startReply = (item: TimelineItem) => {
    setEditing(null);
    setReplying(item);
  };
  const startEdit = (item: TimelineItem) => {
    setReplying(null);
    setEditing(item);
    setPrefill({ text: contentText(item.content), nonce: Date.now() });
  };

  const props: Partial<ComposerProps> & Pick<ComposerProps, "placeholder" | "onSend"> = {
    placeholder: t("message"),
    prefill,
    onTyping: (on) => handle.current?.setTyping(on),
    onChangeText: setDraft,
    onCaretChange: setCaret,
    suggestionAt: mention.token?.start,
    suggestions: mention.suggestions,
    onPickSuggestion: (s) => {
      const next = mention.apply(s, draft, caret);
      const at = mention.token ? mention.token.start + 1 + s.name.length + 1 : next.length; // just after "@name "
      setDraft(next);
      setCaret(at);
      setPrefill({ text: next, nonce: Date.now(), caret: at });
    },
    onEmoji: remember,
    emojiLabel: t("emoji"),
    emojiSearchLabel: t("emoji.search"),
    mentionLabel: t("mention.suggest"),
    mentionTitle: t("mention.title"),
    menuTopLimit: 56, // the chat header's height: the mention menu never grows into it
    onDismissSuggestions: mention.dismiss,
    recentEmoji: recent,
    stickers: controller.canStickers
      ? {
          label: t("sticker.tab"),
          render: (close) => createElement(StickerPane, { roomId, close }),
          grid: { tile: STICKER_TILE, gap: STICKER_GAP, pad: STICKER_PAD, maxCols: STICKER_MAX_COLS },
        }
      : undefined,
    context: editing
      ? { kind: "edit", title: t("edit.title"), preview: contentText(editing.content) }
      : replying
        ? { kind: "reply", title: replying.senderName, preview: replying.content.kind === "image" ? t("photo") : contentText(replying.content) }
        : undefined,
    onCancelContext: () => {
      setReplying(null);
      setEditing(null);
      setPrefill({ text: "", nonce: Date.now() });
    },
    onSend: (body) => {
      const ids = mention.resolve(body);
      if (editing) void handle.current?.edit(editing.id, body);
      else if (replying) void handle.current?.reply(replying.id, body, ids);
      else void handle.current?.sendText(body, ids);
      setDraft("");
      setCaret(0);
      mention.reset();
      setReplying(null);
      setEditing(null);
    },
  };
  return { props, startReply, startEdit };
}
