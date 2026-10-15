import { AppState, Image, Linking } from "react-native";
import { File, Paths } from "expo-file-system";
import {
  RecordError,
  type AttachmentSource,
  type NotificationPermission,
  type PlatformServices,
  type PreferencesStore,
  type RecordedMedia,
  type Recorder,
  type SystemNotifications,
} from "@ohmatrix/core";
import { fromDocuments, levelOfDb, waveformOf } from "./attachments.js";

/**
 * What the phone gives the shared app: a file picker, the camera, voice recording, the clipboard, notifications. Each
 * native module is loaded when first used, so a build that lacks one still starts and only that button is dead.
 */

/** The preferences live in a small file next to the app's other data. */
export function filePreferences(): PreferencesStore {
  const file = () => new File(Paths.document, "preferences.json");
  return {
    async load() {
      try {
        const f = file();
        return f.exists ? (JSON.parse(await f.text()) as Record<string, never>) : {};
      } catch {
        return {};
      }
    },
    async save(prefs) {
      const f = file();
      if (!f.exists) f.create();
      f.write(JSON.stringify(prefs));
    },
  };
}

async function pickFiles(): Promise<AttachmentSource[]> {
  const Documents = await import("expo-document-picker");
  const r = await Documents.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (r.canceled) return [];
  // A picture is sent with its size in pixels, which the picker does not tell: the image component can.
  const files = fromDocuments(r.assets);
  return Promise.all(
    files.map(async (f) => {
      if (!f.mimeType.startsWith("image/") || typeof f.data !== "string") return f;
      const uri = f.data;
      const size = await new Promise<{ width: number; height: number } | null>((resolve) =>
        Image.getSize(
          uri,
          (width, height) => resolve({ width, height }),
          () => resolve(null),
        ),
      );
      return size ? { ...f, ...size } : f;
    }),
  );
}

/** A voice message: the microphone is opened (permission asked) and ready; recording begins with `start()`. */
async function recordMedia(kind: "audio" | "video"): Promise<Recorder> {
  if (kind === "video") throw new RecordError("unsupported", "Recording video is not available on this device yet");
  const Audio = await import("expo-audio");
  const asked = await Audio.requestRecordingPermissionsAsync();
  if (!asked.granted) throw new RecordError("denied", "The microphone is not allowed");
  await Audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  const recorder = new Audio.AudioModule.AudioRecorder({ ...Audio.RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  try {
    await recorder.prepareToRecordAsync();
  } catch (e) {
    throw new RecordError("no_device", e instanceof Error ? e.message : "no microphone");
  }
  const levels: number[] = [];
  const listeners = new Set<(level: number) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let startedAt = 0;
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const release = () => {
    stopTimer();
    listeners.clear();
    void Audio.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  };
  return {
    kind: "audio",
    start() {
      startedAt = Date.now();
      recorder.record();
      timer = setInterval(() => {
        const level = levelOfDb(recorder.getStatus().metering);
        levels.push(level);
        listeners.forEach((cb) => cb(level));
      }, 100);
    },
    onLevel(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    async stop(): Promise<RecordedMedia> {
      const durationMs = Date.now() - startedAt;
      stopTimer();
      await recorder.stop();
      const uri = recorder.uri;
      release();
      if (!uri) throw new RecordError("no_device", "Nothing was recorded");
      const size = new File(uri).size;
      return { name: `voice-${startedAt}.m4a`, mimeType: "audio/mp4", size, data: uri, durationMs, voice: true, waveform: waveformOf(levels) };
    },
    cancel() {
      stopTimer();
      void recorder.stop().catch(() => {});
      release();
    },
  };
}

/** System notifications through Android's notification service. */
export function phoneNotifications(): SystemNotifications {
  let permission: NotificationPermission = "default";
  const clicks = new Map<string, () => void>();
  let ready: Promise<typeof import("expo-notifications")> | null = null;
  const load = () =>
    (ready ??= import("expo-notifications").then(async (N) => {
      N.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
      });
      await N.setNotificationChannelAsync("messages", { name: "Messages", importance: N.AndroidImportance.HIGH }).catch(() => {});
      N.addNotificationResponseReceivedListener((r) => clicks.get(r.notification.request.identifier)?.());
      const now = await N.getPermissionsAsync();
      permission = now.granted ? "granted" : now.canAskAgain ? "default" : "denied";
      return N;
    }));
  void load().catch(() => (permission = "unsupported"));
  return {
    permission: () => permission,
    async request() {
      try {
        const N = await load();
        const r = await N.requestPermissionsAsync();
        permission = r.granted ? "granted" : "denied";
      } catch {
        permission = "unsupported";
      }
      return permission;
    },
    isActive: () => AppState.currentState === "active",
    show(n) {
      clicks.set(n.tag, n.onClick);
      void load()
        .then((N) => N.scheduleNotificationAsync({ identifier: n.tag, content: { title: n.title, body: n.body }, trigger: null }))
        .catch(() => {});
    },
  };
}

/** Everything the shared app can use on a phone, on top of the session store. */
export function phoneServices(base: Pick<PlatformServices, "sessionStore">): PlatformServices {
  return {
    ...base,
    notifications: phoneNotifications(),
    preferences: filePreferences(),
    pickFiles,
    recordMedia,
    async copyText(text) {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(text);
    },
    openLink: (url) => void Linking.openURL(url).catch(() => {}),
    async saveFile(file) {
      const Sharing = await import("expo-sharing");
      await Sharing.shareAsync(file.url, { dialogTitle: file.name });
    },
  };
}
