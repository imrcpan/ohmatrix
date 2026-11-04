import { AppState, Image, Linking, Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import {
  RecordError,
  type AttachmentSource,
  type AudioClip,
  type NotificationPermission,
  type AppServices,
  type PreferencesStore,
  type Profile,
  type ProfileCache,
  type RecordedMedia,
  type Recorder,
  type SystemNotifications,
} from "@ohmatrix/core";
import { fromDocuments, levelOfDb, waveformOf } from "./attachments.js";
import { requireOptionalNativeModule } from "expo";
import { appLogoOf, generatedList, phoneAppIcons, type AppIconNative } from "./appIcons.js";
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

/** The name and picture of each account as last seen, in one small file next to the preferences (what is on the screen, not a secret). */
export function fileProfileCache(): ProfileCache {
  const file = () => new File(Paths.document, "profiles.json");
  const read = async (): Promise<Record<string, Profile>> => {
    try {
      const f = file();
      return f.exists ? (JSON.parse(await f.text()) as Record<string, Profile>) : {};
    } catch {
      return {};
    }
  };
  return {
    async load(userId) {
      const p = (await read())[userId];
      return p && typeof p.displayName === "string" ? p : null;
    },
    async save(userId, profile) {
      const all = await read();
      all[userId] = profile;
      const f = file();
      if (!f.exists) f.create();
      f.write(JSON.stringify(all));
    },
  };
}

/**
 * The picker copies a file to the cache under a made-up name, and the SDK names the message after the file it uploads.
 * So the copy is moved into a folder of its own under the real name.
 */
async function withRealName(f: AttachmentSource): Promise<AttachmentSource> {
  if (typeof f.data !== "string" || !f.data.startsWith("file://")) return f;
  try {
    const from = new File(f.data);
    const dir = new Directory(Paths.cache, `send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    dir.create();
    const to = new File(dir, f.name.replace(/[\\/]/g, "_"));
    // `move` is asynchronous: the path is handed on only once the file is there (reading it at once found nothing).
    await from.move(to);
    return { ...f, data: to.uri };
  } catch {
    return f;
  }
}

/** Pictures from the photo picker (the system's own: no permission is asked, and it shows photos, not folders). */
async function pickPhotosFrom(multiple: boolean): Promise<AttachmentSource[]> {
  const Pictures = await import("expo-image-picker");
  const r = await Pictures.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: multiple, quality: 1 });
  if (r.canceled) return [];
  const out: AttachmentSource[] = [];
  for (const a of r.assets) {
    const size =
      a.fileSize ??
      (() => {
        try {
          return new File(a.uri).size;
        } catch {
          return 0;
        }
      })();
    const [file] = fromDocuments([{ uri: a.uri, name: a.fileName ?? "", size, mimeType: a.mimeType ?? "image/jpeg" }]);
    if (file) out.push({ ...(await withRealName(file)), width: a.width, height: a.height });
  }
  return out;
}

/** One picture from the photo picker. */
async function pickPhoto(): Promise<AttachmentSource | null> {
  return (await pickPhotosFrom(false))[0] ?? null;
}

async function pickFiles(): Promise<AttachmentSource[]> {
  const Documents = await import("expo-document-picker");
  const r = await Documents.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (r.canceled) return [];
  return withPictureDetails(await Promise.all(fromDocuments(r.assets).map(withRealName)));
}

/** A picture is sent with its size in pixels, which a picker (or another app sharing it) does not tell: the image component can. */
async function withPictureDetails(files: AttachmentSource[]): Promise<AttachmentSource[]> {
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
/** The icons to choose from, when this build has them (see appIcons.ts); nothing otherwise. */
function appIconsService(): Pick<AppServices, "appIcons" | "appLogo"> {
  const icons = phoneAppIcons(requireOptionalNativeModule<AppIconNative>("OhMatrixAppIcon"));
  if (!icons) return {};
  const list = generatedList();
  return { appIcons: icons, appLogo: () => appLogoOf(list, icons) ?? "" };
}

/** Where Matrix homeservers post a push for this app, and the id the gateway knows the app by (the Firebase project is behind it). */
const PUSH_APP_ID = "org.ohmatrix.app";
const PUSH_GATEWAY = process.env["EXPO_PUBLIC_PUSH_GATEWAY"] || "https://push.ohmatrix.org/_matrix/push/v1/notify";

/**
 * Push through FCM (Android). The token comes from the Firebase file the build was made with; a build without it, or a phone without
 * Google services, has none, and `token()` rejects: the app then runs without push.
 */
export function phonePush(): NonNullable<AppServices["push"]> | undefined {
  if (Platform.OS !== "android") return undefined;
  const model = (Platform.constants as { Model?: string }).Model;
  return {
    appId: PUSH_APP_ID,
    gatewayUrl: PUSH_GATEWAY,
    deviceName: model || "Android",
    async token() {
      const N = await import("expo-notifications");
      const t = await N.getDevicePushTokenAsync();
      if (typeof t.data !== "string" || !t.data) throw new Error("no push token");
      return t.data;
    },
    onToken(cb) {
      let off = () => {};
      void import("expo-notifications").then((N) => {
        const sub = N.addPushTokenListener((t) => typeof t.data === "string" && cb(t.data));
        off = () => sub.remove();
      });
      return () => off();
    },
  };
}

/**
 * What other apps share to this one (the module modules/ohmatrix-share, which a build without it lacks: the app is then not a target of
 * sharing). The files are copied into the cache in the background (the page that asks for the chats does not wait for it); a picture gets its size and blurhash (`prepare`) when it is about to be sent, as one chosen in the app does.
 */
export function phoneIncomingShare(): NonNullable<AppServices["incomingShare"]> | undefined {
  type Shared = { ready: boolean; text?: string | null; files?: { uri: string; name: string; mimeType: string; size: number }[] };
  const native = requireOptionalNativeModule<{
    take(): Promise<Shared | null>;
    copy(uris: string[], names: string[]): Promise<(string | null)[]>;
    addListener(event: "onShare", cb: () => void): { remove(): void };
  }>("OhMatrixShare");
  if (!native) return undefined;
  // The copies of the files, by the address the sharing app gave: they start when the share is taken, while the person is still choosing chats.
  const copies = new Map<string, Promise<string | null>>();
  return {
    async take() {
      // While the app starts there is no activity to ask (a share that started it cannot be seen yet): ask again for a moment.
      for (let i = 0; i < 25; i++) {
        const raw = await native.take();
        if (raw?.ready !== false) {
          if (!raw?.files) return null;
          const list = raw.files;
          if (list.length > 0) {
            const all = native.copy(
              list.map((f) => f.uri),
              list.map((f) => f.name),
            );
            list.forEach((f, n) =>
              copies.set(
                f.uri,
                all.then((r) => r[n] ?? null),
              ),
            );
            all.catch(() => {}); // the failure is reported where the copy is waited for
          }
          return { ...(raw.text ? { text: raw.text } : {}), files: fromDocuments(list) };
        }
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 80));
      }
      return null;
    },
    async prepare(files) {
      const copied = await Promise.all(
        files.map(async (f) => {
          const copy = typeof f.data === "string" ? copies.get(f.data) : undefined;
          if (!copy) return f;
          const uri = await copy;
          if (!uri) throw new Error(`could not read ${f.name}`);
          return { ...f, data: uri };
        }),
      );
      return withPictureDetails(copied);
    },
    onShare(cb) {
      const sub = native.addListener("onShare", cb);
      return () => sub.remove();
    },
  };
}

export function phoneServices(): AppServices {
  const push = phonePush();
  const share = phoneIncomingShare();
  return {
    // Set by the build (scripts/build-android-<abi>.sh --version a.b.c), the same number the APK carries as its versionName.
    ...(process.env["EXPO_PUBLIC_APP_VERSION"] ? { appVersion: process.env["EXPO_PUBLIC_APP_VERSION"] } : {}),
    notifications: phoneNotifications(),
    ...(push && { push }),
    ...(share && { incomingShare: share }),
    ...appIconsService(),
    preferences: filePreferences(),
    profileCache: fileProfileCache(),
    pickFiles,
    pickPhoto,
    pickPhotos: () => pickPhotosFrom(true),
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
