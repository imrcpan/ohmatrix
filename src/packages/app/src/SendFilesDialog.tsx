import { Image, Text, View } from "react-native";
import type { AttachmentSource } from "@ohmatrix/core";
import { Dialog, fontFamily, Icon, PrimaryButton, TextButton, useTheme } from "@ohmatrix/ui";
import { useEffect, useMemo } from "react";
import { useT } from "./context.js";
import { formatBytes } from "./format.js";
import { formatDuration } from "./useAudio.js";

const MAX_ROWS = 5;

const kindOf = (f: AttachmentSource) =>
  f.mimeType.startsWith("image/") ? "image" : f.mimeType.startsWith("video/") ? "video" : f.mimeType.startsWith("audio/") ? "audio" : "file";

/** Object URLs exist on the web only; elsewhere images fall back to the generic icon. */
function previewUrl(f: AttachmentSource): string | null {
  const url = (globalThis as { URL?: { createObjectURL?(b: unknown): string } }).URL;
  return kindOf(f) === "image" && url?.createObjectURL && typeof Blob !== "undefined" && f.data instanceof Blob ? url.createObjectURL(f.data) : null;
}

/** Asks before anything dragged or pasted is uploaded, listing what would be sent. */
export function SendFilesDialog(props: { files: AttachmentSource[]; onSend: () => void; onCancel: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const files = props.files;
  const urls = useMemo(() => files.map(previewUrl), [files]);
  useEffect(() => () => urls.forEach((u) => u && (globalThis as { URL?: { revokeObjectURL?(u: string): void } }).URL?.revokeObjectURL?.(u)), [urls]);
  const total = files.reduce((n, f) => n + f.size, 0);
  const shown = files.slice(0, MAX_ROWS);
  return (
    <Dialog
      visible={files.length > 0}
      title={t(files.length === 1 ? "send.files.one" : "send.files.title", { n: files.length })}
      {...(files.length > 1 ? { message: t("send.files.total", { size: formatBytes(total) }) } : {})}
      onClose={props.onCancel}
    >
      <View style={{ gap: 8 }}>
        {shown.map((f, i) => {
          const kind = kindOf(f);
          const url = urls[i];
          const detail = [
            t(kind === "image" ? "photo" : kind === "video" ? "video" : kind === "audio" ? "send.files.audio" : "send.files.file"),
            formatBytes(f.size),
            f.durationMs ? formatDuration(f.durationMs) : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <View
              key={i}
              accessibilityLabel={f.name}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: 12, backgroundColor: colors.bgSecondary }}
            >
              {url ? (
                <Image source={{ uri: url }} style={{ width: 44, height: 44, borderRadius: 8 }} />
              ) : (
                <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={kind === "video" ? "video" : kind === "audio" ? "mic" : "file"} size={22} color="#FFFFFF" />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", fontFamily, color: colors.text }}>
                  {f.name}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, color: colors.textSecondary }}>
                  {detail}
                </Text>
              </View>
            </View>
          );
        })}
        {files.length > shown.length && (
          <Text style={{ textAlign: "center", fontSize: 13, fontFamily, color: colors.textSecondary }}>
            {t("send.files.more", { n: files.length - shown.length })}
          </Text>
        )}
      </View>
      <PrimaryButton title={t("send.files.send")} onPress={props.onSend} />
      <TextButton title={t("cancel")} onPress={props.onCancel} />
    </Dialog>
  );
}
