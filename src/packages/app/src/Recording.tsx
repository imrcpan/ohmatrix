import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { RecordError, type AttachmentSource, type PlatformServices, type Recorder } from "@ohmatrix/core";
import { Dialog, fontFamily, Icon, LivePreview, TextButton, useTheme } from "@ohmatrix/ui";
import { useServices, useT } from "./context.js";
import { formatDuration } from "./useAudio.js";

type Translate = ReturnType<typeof useT>;

const noticeFor = (e: unknown, t: Translate) =>
  e instanceof RecordError
    ? t(e.reason === "denied" ? "record.denied" : e.reason === "no_device" ? "record.noDevice" : "record.unsupported")
    : e instanceof Error
      ? e.message
      : String(e);

/** A running clock for a recording. */
function useElapsed(running: boolean) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!running) {
      setMs(0);
      return;
    }
    const t0 = Date.now();
    const timer = setInterval(() => setMs(Date.now() - t0), 200);
    return () => clearInterval(timer);
  }, [running]);
  return ms;
}

/**
 * Voice messages: the microphone opens, recording starts at once (the browser asks for permission the first time),
 * a bar with timer and live loudness replaces the text field, and Send or Discard end it.
 */
export function useVoiceRecording(send: (file: AttachmentSource) => Promise<void>, services: PlatformServices, t: Translate) {
  const recorder = useRef<Recorder | null>(null);
  const [active, setActive] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const [notice, setNotice] = useState<string | undefined>();
  const ms = useElapsed(active);

  const cancel = useCallback(() => {
    recorder.current?.cancel();
    recorder.current = null;
    setActive(false);
    setLevels([]);
  }, []);
  useEffect(() => cancel, [cancel]); // leaving the chat discards a recording in progress

  const start = useCallback(async () => {
    if (recorder.current || !services.recordMedia) return;
    setNotice(undefined);
    try {
      const r = await services.recordMedia("audio");
      recorder.current = r;
      r.onLevel((v) => setLevels((cur) => [...cur.slice(-80), v]));
      r.start();
      setActive(true);
    } catch (e) {
      setNotice(noticeFor(e, t));
    }
  }, [services, t]);

  const finish = useCallback(async () => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    setActive(false);
    setLevels([]);
    try {
      const media = await r.stop();
      if (media.durationMs < 500) return; // an accidental tap: nothing worth sending
      await send(media);
    } catch (e) {
      setNotice(noticeFor(e, t));
    }
  }, [send, t]);

  return {
    start,
    notice,
    bar: active
      ? {
          seconds: formatDuration(ms),
          levels,
          sendLabel: t("record.send"),
          cancelLabel: t("record.cancel"),
          recordingLabel: t("record.recording"),
          onSend: () => void finish(),
          onCancel: cancel,
        }
      : undefined,
  };
}

/** Short video clip: a live camera preview first, then Record / Stop, then the clip is sent. */
export function VideoRecorderDialog(props: { visible: boolean; onClose: () => void; send: (file: AttachmentSource) => Promise<void> }) {
  const { colors } = useTheme();
  const t = useT();
  const services = useServices();
  const [rec, setRec] = useState<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ms = useElapsed(recording);
  const live = useRef<Recorder | null>(null);

  const release = useCallback(() => {
    live.current?.cancel();
    live.current = null;
    setRec(null);
    setRecording(false);
  }, []);
  useEffect(() => {
    if (!props.visible) return;
    setError(null);
    let stale = false;
    services.recordMedia?.("video").then(
      (r) => {
        if (stale) r.cancel();
        else {
          live.current = r;
          setRec(r);
        }
      },
      (e: unknown) => {
        if (!stale) setError(noticeFor(e, t));
      },
    );
    return () => {
      stale = true;
      release();
    };
  }, [props.visible]);

  const close = () => {
    release();
    props.onClose();
  };
  const stopAndSend = async () => {
    const r = live.current;
    if (!r) return;
    live.current = null;
    setRec(null);
    setRecording(false);
    try {
      const media = await r.stop();
      props.onClose();
      if (media.durationMs >= 500) await props.send(media);
    } catch (e) {
      setError(noticeFor(e, t));
    }
  };

  return (
    <Dialog visible={props.visible} title={t("record.video")} onClose={close}>
      <View style={{ alignItems: "center", gap: 12 }}>
        {rec?.preview ? (
          <LivePreview stream={rec.preview} width={320} height={240} />
        ) : (
          <View
            style={{
              width: 320,
              height: 240,
              borderRadius: 12,
              backgroundColor: colors.bgSecondary,
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 14, fontFamily, color: error ? colors.danger : colors.textSecondary, textAlign: "center" }}>{error ?? "…"}</Text>
          </View>
        )}
        {recording && (
          <Text accessibilityLabel="Recording time" style={{ fontSize: 17, fontFamily, color: colors.danger, fontVariant: ["tabular-nums"] }}>
            ● {formatDuration(ms)}
          </Text>
        )}
        {rec && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recording ? t("record.stop") : t("record.start")}
            onPress={() => {
              if (recording) void stopAndSend();
              else {
                rec.start();
                setRecording(true);
              }
            }}
            style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: colors.separator, alignItems: "center", justifyContent: "center" }}
          >
            {recording ? (
              <Icon name="stop" size={26} color={colors.danger} strokeWidth={3} />
            ) : (
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.danger }} />
            )}
          </Pressable>
        )}
      </View>
      <TextButton title={t("cancel")} onPress={close} />
    </Dialog>
  );
}
