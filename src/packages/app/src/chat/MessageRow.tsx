import { useState } from "react";
import { Pressable, View } from "react-native";
import type { TimelineItem } from "@ohmatrix/core";
import {
  parseFormatted,
  plainRuns,
  Avatar,
  Bubble,
  Dialog,
  MessageMenu,
  PrimaryButton,
  ReactionChips,
  TextButton,
  VideoViewer,
  type MenuPoint,
  type Run,
} from "@ohmatrix/ui";
import { useLocale, useServices, useT } from "../context.js";
import { PhotoViewer } from "../PhotoViewer.js";
import { bubbleProps } from "./bubbleProps.js";
import { QUICK_REACTIONS, type RowActions } from "./rowActions.js";
import { gapAbove } from "./rowWindow.js";
import { useMessageMedia } from "./useMessageMedia.js";

const AVATAR = 32;

/** One message: avatar, bubble, reactions, the picture and video viewers, the context menu and the delete confirmation. */
export function MessageRow(props: {
  rowKey: string;
  item: TimelineItem;
  first: boolean;
  /** Directly under a bubble of someone else (the gap is tripled). */
  newSender: boolean;
  last: boolean;
  isGroup: boolean;
  actions: RowActions;
  highlighted?: boolean | undefined;
}) {
  const { item: m, actions } = props;
  const c = m.content;
  const t = useT();
  const locale = useLocale();
  const services = useServices();
  const media = useMessageMedia(m);
  const [menu, setMenu] = useState<MenuPoint | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Rich text: a formatted body is parsed into safe runs; a plain body still gets links and mention pills.
  const runs: readonly Run[] | undefined = c.kind === "text" ? (c.formattedBody ? parseFormatted(c.formattedBody) : plainRuns(c.body, c.mentions)) : undefined;
  const showAvatar = props.isGroup && !m.isOwn;
  const open = (x: number, y: number) => {
    if (!unsent || failed) setMenu({ x, y });
  };
  const mineKeys = (m.reactions ?? []).filter((r) => r.mine).map((r) => r.key);
  // A message that has not reached the server has no event to reply to, pin, edit or react on, and nothing to delete
  // there: it can only be sent again or dropped. One that is still being sent has nothing to offer yet.
  const unsent = m.status !== "sent";
  const failed = m.status === "failed" && !!m.transactionId;

  const bubble = bubbleProps({
    item: m,
    first: props.first,
    last: props.last,
    showAvatar,
    t,
    locale,
    actions,
    runs,
    openLink: (url) => services.openLink?.(url),
    image: media.imageDims ? { uri: media.image, ...media.imageDims } : undefined,
    video: media.videoDims ? { poster: media.poster, ...media.videoDims } : undefined,
    audio: { state: media.audio.state, toggle: () => void media.audio.toggle(), seek: (f) => void media.audio.seek(f) },
    previews: media.previews,
    previewImageUrl: media.previewImage,
    openImage: () => media.setViewingImage(true),
    openVideo: () => media.setViewingVideo(true),
  });

  return (
    <View
      // The row's key lets the list find it again (to centre a message it jumped to); the label marks the highlighted one.
      {...({ dataSet: { rowKey: props.rowKey } } as object)}
      accessibilityLabel={props.highlighted ? "Found message" : undefined}
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: props.highlighted ? 4 : 0,
        marginTop: gapAbove(props.newSender),
        justifyContent: m.isOwn ? "flex-end" : "flex-start",
        backgroundColor: props.highlighted ? "rgba(51,144,236,0.22)" : "transparent",
      }}
    >
      {showAvatar && (props.last ? <Avatar id={m.sender} name={m.senderName} size={AVATAR} src={media.avatar} /> : <View style={{ width: AVATAR }} />)}
      <View style={{ maxWidth: "78%", alignItems: m.isOwn ? "flex-end" : "flex-start" }}>
        {/* The bubble opens the context menu but is read, not clicked: show the text cursor, not the hand (nested buttons such as quotes and files keep theirs). */}
        <Pressable
          style={{ cursor: "text" } as object}
          onLongPress={(e) => {
            const n = e.nativeEvent as { pageX?: number; pageY?: number };
            open(n.pageX ?? 0, n.pageY ?? 0);
          }}
          delayLongPress={350}
          {...({
            onContextMenu: (e: { preventDefault(): void; clientX: number; clientY: number }) => {
              e.preventDefault();
              open(e.clientX, e.clientY);
            },
          } as object)}
        >
          <Bubble
            {...bubble}
            onLongPress={(e) => {
              const n = e.nativeEvent as { pageX?: number; pageY?: number };
              open(n.pageX ?? 0, n.pageY ?? 0);
            }}
          />
        </Pressable>
        {!!m.reactions?.length && <ReactionChips items={m.reactions} own={m.isOwn} onToggle={(k) => actions.react(m.id, k)} />}
      </View>
      {c.kind === "image" && (
        <PhotoViewer
          visible={media.viewingImage}
          onClose={() => media.setViewingImage(false)}
          title={c.body}
          fileName={c.body}
          uri={media.original}
          previewUri={media.image}
          width={c.width}
          height={c.height}
        />
      )}
      {c.kind === "video" && (
        <VideoViewer
          visible={media.viewingVideo}
          onClose={() => media.setViewingVideo(false)}
          uri={media.videoFile}
          poster={media.poster}
          width={c.width}
          height={c.height}
          closeLabel={t("viewer.close")}
        />
      )}
      <MessageMenu
        visible={!!menu}
        anchor={menu}
        onClose={() => setMenu(null)}
        emojis={unsent ? [] : QUICK_REACTIONS}
        activeEmojis={mineKeys}
        onEmoji={(k) => actions.react(m.id, k)}
        actions={
          unsent
            ? [
                { label: t("resend"), icon: "send" as const, onPress: () => actions.resend(m.transactionId!) },
                { label: t("delete"), icon: "trash" as const, danger: true, onPress: () => actions.discard(m.transactionId!) },
              ]
            : [
                { label: t("reply"), icon: "reply" as const, onPress: () => actions.reply(m) },
                { label: t("forward"), icon: "forward" as const, onPress: () => actions.forward(m) },
                { label: t(m.pinned ? "unpin" : "pin"), icon: "pin" as const, onPress: () => actions.pin(m, !m.pinned) },
                ...(m.isOwn && c.kind === "text" ? [{ label: t("edit"), icon: "edit" as const, onPress: () => actions.edit(m) }] : []),
                ...(m.isOwn ? [{ label: t("delete"), icon: "trash" as const, danger: true, onPress: () => setConfirmDelete(true) }] : []),
              ]
        }
      />
      <Dialog visible={confirmDelete} title={t("delete.title")} message={t("delete.body")} onClose={() => setConfirmDelete(false)}>
        <PrimaryButton
          title={t("delete")}
          onPress={() => {
            setConfirmDelete(false);
            actions.remove(m.id);
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setConfirmDelete(false)} />
      </Dialog>
    </View>
  );
}
