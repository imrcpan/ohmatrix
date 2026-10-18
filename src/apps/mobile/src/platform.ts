import { AppState, Image, Linking } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import {
  RecordError,
  type AttachmentSource,
  type AudioClip,
  type NotificationPermission,
  type AppServices,
  type PreferencesStore,
  type RecordedMedia,
  type Recorder,
  type SystemNotifications,
} from "@ohmatrix/core";
import { fromDocuments, levelOfDb, waveformOf } from "./attachments.js";
import { sniffImageExtension } from "./imageFormat.js";

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

/**
 * The picker copies a file to the cache under a made-up name, and the SDK names the message after the file it uploads.
 * So the copy is moved into a folder of its own under the real name.
 */
function withRealName(f: AttachmentSource): AttachmentSource {
  if (typeof f.data !== "string" || !f.data.startsWith("file://")) return f;
  try {
    const from = new File(f.data);
    const dir = new Directory(Paths.cache, `send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    dir.create();
    const to = new File(dir, f.name.replace(/[\\/]/g, "_"));
    from.move(to);
    return { ...f, data: to.uri };
  } catch {
    return f;
  }
}

async function pickFiles(): Promise<AttachmentSource[]> {
  const Documents = await import("expo-document-picker");
  const r = await Documents.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (r.canceled) return [];
  // A picture is sent with its size in pixels, which the picker does not tell: the image component can.
  const files = fromDocuments(r.assets).map(withRealName);
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
      const withSize = size ? { ...f, ...size } : f;
      // A blurhash stands in for the picture while it loads; if it cannot be made, the SDK's grey is used.
      const blurhash = await import("expo-image").then((m) => m.Image.generateBlurhashAsync(uri, [4, 3])).catch(() => null);
      return blurhash ? { ...withSize, blurhash } : withSize;
    }),
  );
}

/**
 * A player for one audio file, with the face of an audio element so the shared code plays it the way it does in a
 * browser. The native module is loaded on first use; the clip reports through the events the shared code listens to.
 */
function createAudio(url: string): AudioClip {
  type Player = ReturnType<typeof import("expo-audio").createAudioPlayer>;
  let player: Player | null = null;
  let released = false;
  let time = 0;
  let length = NaN;
  let paused = true;
  const listeners = new Map<string, Set<() => void>>();
  const emit = (type: string) => listeners.get(type)?.forEach((cb) => cb());
  const ready = import("expo-audio").then(async (Audio) => {
    await Audio.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (released) return null;
    const p = Audio.createAudioPlayer({ uri: url }, { updateInterval: 200 });
    p.addListener("playbackStatusUpdate", (st) => {
      time = st.currentTime;
      if (st.isLoaded && st.duration > 0 && st.duration !== length) {
        length = st.duration;
        emit("durationchange");
      }
      const was = paused;
      paused = !st.playing;
      if (st.didJustFinish) {
        // The player keeps "play when ready" on after the end, so the shared code's rewind to 0 would start it again.
        p.pause();
        paused = true;
        emit("ended");
      } else if (was !== paused) emit(paused ? "pause" : "play");
      emit("timeupdate");
    });
    player = p;
    return p;
  });
  return {
    get currentTime() {
      return time;
    },
    set currentTime(seconds: number) {
      time = seconds;
      void ready.then((p) => p?.seekTo(seconds));
    },
    get duration() {
      return length;
    },
    get paused() {
      return paused;
    },
    async play() {
      const p = await ready;
      if (!p) return;
      p.play();
      paused = false;
      emit("play");
    },
    pause() {
      player?.pause();
      paused = true;
      emit("pause");
    },
    addEventListener(type, cb) {
      const set = listeners.get(type) ?? new Set();
      set.add(cb);
      listeners.set(type, set);
    },
    removeEventListener(type, cb) {
      listeners.get(type)?.delete(cb);
    },
    release() {
      released = true;
      listeners.clear();
      player?.remove();
      player = null;
    },
  };
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
    kind: "system",
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

const MIME_OF_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
  txt: "text/plain",
  zip: "application/zip",
};

/**
 * Keep a file on the phone. A picture goes into the photo gallery; anything else is handed to the system's share sheet,
 * which can put it into Files. The cached copy has a temporary name, so it is copied under the real one first.
 */
async function saveToDevice(file: { url: string; name: string }): Promise<"saved" | void> {
  let name = file.name.replace(/[\\/]/g, "_");
  let uri = file.url;
  if (uri.startsWith("file://")) {
    // A name with no extension of a known kind (an avatar has none): the file's own first bytes say what it is.
    if (!MIME_OF_EXTENSION[/\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? ""]) {
      const found = sniffImageExtension(new Uint8Array((await new File(uri).arrayBuffer()).slice(0, 16)));
      if (found) name = `${name}.${found}`;
    }
    const dir = new Directory(Paths.cache, `save-${Date.now()}`);
    dir.create();
    const copy = new File(dir, name);
    new File(uri).copy(copy);
    uri = copy.uri;
  }
  const mimeType = MIME_OF_EXTENSION[/\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? ""] ?? "application/octet-stream";
  if (mimeType.startsWith("image/")) {
    try {
      const Library = await import("expo-media-library");
      const asked = await Library.requestPermissionsAsync(true, ["photo"]);
      if (asked.granted) {
        await Library.Asset.create(uri);
        return "saved";
      }
    } catch (e) {
      // A build without the module, or no permission: the share sheet is the way left.
      console.warn("saving to the gallery failed:", e);
    }
  }
  const Sharing = await import("expo-sharing");
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: name });
}

/** Everything the shared app can use on a phone. */
export function phoneServices(): AppServices {
  return {
    // Set by the build (scripts/build-android.sh --version a.b.c), the same number the APK carries as its versionName.
    ...(process.env["EXPO_PUBLIC_APP_VERSION"] ? { appVersion: process.env["EXPO_PUBLIC_APP_VERSION"] } : {}),
    notifications: phoneNotifications(),
    preferences: filePreferences(),
    pickFiles,
    recordMedia,
    recordKinds: ["audio"],
    createAudio,
    async copyText(text) {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(text);
    },
    openLink: (url) => void Linking.openURL(url).catch(() => {}),
    saveFile: saveToDevice,
  };
}
