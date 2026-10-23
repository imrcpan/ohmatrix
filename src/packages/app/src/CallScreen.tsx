import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, PanResponder, Pressable, Text, View } from "react-native";
import type { CallDevice, CallEndReason, CallState } from "@ohmatrix/core";
import { Avatar, fontFamily, Icon, Menu, ScaleRoot, StreamView, useInsets, useNavBottom, useScale, useTheme, type Anchor, type MenuItem } from "@ohmatrix/ui";
import { useController, useServices, useT } from "./context.js";
import { useMediaUrl } from "./useMedia.js";
import { useNotice } from "./useNotice.js";
import { failureReason } from "./avatarFailure.js";

/** The call that is going, as the app's state has it (null when there is none). */
function useCall(): CallState | null {
  const controller = useController();
  const [call, setCall] = useState<CallState | null>(null);
  useEffect(() => controller.subscribeCall(setCall), [controller]);
  return call;
}

/**
 * A call that rings while the app is not in front (another tab, another window) is also a system notification, so it is not missed; a click
 * brings the app back to the call. The notification goes when the call is answered, turned down or over (a later one with the same tag
 * is replaced by a silent empty one the browser closes at once).
 */
function useRingNotification(call: CallState | null) {
  const services = useServices();
  const t = useT();
  const ringing = !!call && call.incoming && call.phase === "ringing";
  const id = call?.id;
  const name = call?.peer.name;
  const video = call?.video;
  useEffect(() => {
    const sys = services.notifications;
    if (!ringing || !sys || sys.permission() !== "granted" || sys.isActive()) return;
    sys.show({ tag: `call-${id}`, title: name ?? "", body: video ? t("call.incoming.video") : t("call.incoming.voice"), onClick: () => {} });
  }, [ringing, id, name, video, services, t]);
}

/**
 * The sounds of a call, for whichever of the two screens is showing: the ring of a call coming in, the tone of one going out (until it is
 * answered or over), and a short sound as it ends. Kept out of the screens so changing from the banner to the full screen does not restart it.
 */
function useCallSounds(call: CallState | null) {
  const services = useServices();
  const ringing = !!call && call.phase === "ringing";
  const kind = call?.incoming ? "incoming" : "outgoing";
  const id = call?.id;
  useEffect(() => {
    if (!ringing || !services.callSounds) return;
    return services.callSounds.play(kind);
  }, [ringing, kind, id, services]);
  const ended = call?.phase === "ended";
  useEffect(() => {
    if (ended) services.callSounds?.ended();
  }, [ended, id, services]);
}

/** 00:00 for the clock of a call. */
function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}

const REASON_KEY: Record<
  CallEndReason,
  "call.end.hangup" | "call.end.rejected" | "call.end.cancelled" | "call.end.busy" | "call.end.unanswered" | "call.end.failed" | "call.end.nomedia"
> = {
  hangup: "call.end.hangup",
  rejected: "call.end.rejected",
  cancelled: "call.end.cancelled",
  busy: "call.end.busy",
  unanswered: "call.end.unanswered",
  failed: "call.end.failed",
  no_media: "call.end.nomedia",
};

function RoundButton(props: {
  label: string;
  onPress: () => void;
  icon: "mic" | "video" | "fluentCall" | "screen" | "gear";
  off?: boolean;
  tone?: "danger" | "accept";
  slash?: boolean;
}) {
  const bg = props.tone === "danger" ? "#E5484D" : props.tone === "accept" ? "#30A46C" : props.off ? "#FFFFFF" : "rgba(255,255,255,0.18)";
  const fg = props.tone ? "#FFFFFF" : props.off ? "#1C1C1E" : "#FFFFFF";
  return (
    <View style={{ alignItems: "center", gap: 8, width: 84 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.label}
        onPress={props.onPress}
        style={({ pressed }: { pressed: boolean }) => ({
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <View style={{ transform: [{ rotate: props.tone === "danger" ? "135deg" : "0deg" }] }}>
          <Icon name={props.icon} size={28} color={fg} />
        </View>
        {props.slash && (
          <View style={{ position: "absolute", width: 34, height: 3, borderRadius: 2, backgroundColor: fg, transform: [{ rotate: "-45deg" }] }} />
        )}
      </Pressable>
      <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, color: "rgba(255,255,255,0.85)" }}>
        {props.label}
      </Text>
    </View>
  );
}

/** A call that has ended stays a moment, saying how it ended, and goes by itself. */
const ENDED_STAYS_MS = 1800;

/** What a call is doing, in a few words: ringing, connecting, the clock while it is on, or how it ended. Shared by the screen and the small window. */
function useCallStatus(call: CallState): string {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (call.phase !== "connected") return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [call.phase]);
  if (call.phase === "ended") return t(REASON_KEY[call.endReason ?? "hangup"]);
  if (call.phase === "connected") return call.poor ? t("call.poor") : clock(now - (call.connectedAt ?? now));
  if (call.incoming && call.phase === "ringing") return call.video ? t("call.incoming.video") : t("call.incoming.voice");
  return call.phase === "ringing" ? t("call.calling") : t("call.connecting");
}

function CallBody(props: { call: CallState; onMinimize: () => void }) {
  const { call } = props;
  const t = useT();
  const controller = useController();
  const nav = useNavBottom();
  const notice = useNotice();
  const insets = useInsets();
  const avatar = useMediaUrl(call.peer.avatar, { width: 256, height: 256, fit: "crop" });
  const status = useCallStatus(call);

  // The devices menu: the microphones and cameras there are, read when it opens (their names are only there once the browser has been allowed).
  const gear = useRef<View>(null);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [devices, setDevices] = useState<{ microphones: CallDevice[]; cameras: CallDevice[] }>({ microphones: [], cameras: [] });
  const openDevices = () => {
    void controller.callDevices().then(setDevices);
    gear.current?.measureInWindow((x, y, width, height) => setMenu({ x, y, width, height }));
  };
  const deviceItems: MenuItem[] = [
    ...devices.microphones.map((d) => ({
      label: `${t("call.microphone")}: ${d.label}`,
      checked: d.current,
      onPress: () => void controller.useCallDevice("microphone", d.id),
    })),
    ...(call.video
      ? devices.cameras.map((d) => ({
          label: `${t("call.camera")}: ${d.label}`,
          checked: d.current,
          onPress: () => void controller.useCallDevice("camera", d.id),
        }))
      : []),
  ];
  const share = () =>
    controller.setCallSharing(!call.sharing).catch((e: unknown) => notice.show(t("call.share.failed", { reason: failureReason(e, t) }), "error"));

  const ringingIn = call.incoming && call.phase === "ringing";
  const live = call.phase === "connected";
  // A picture is on show when the other side has one to give: its camera, or its screen. Otherwise it is the person, as in a voice call.
  const showVideo = live && !!call.remote && (call.remoteSharing || (call.video && !call.remoteCameraOff));
  const banner = call.sharing ? t("call.sharing") : call.remoteSharing ? t("call.remoteSharing", { name: call.peer.name }) : null;

  return (
    <View style={{ flex: 1, backgroundColor: "#111418" }}>
      {call.phase !== "ended" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("call.minimize")}
          onPress={props.onMinimize}
          style={({ pressed }: { pressed: boolean }) => ({
            position: "absolute",
            top: insets.top + 12,
            left: 12,
            zIndex: 5,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.35)",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="minimize" size={20} color="#FFFFFF" />
        </Pressable>
      )}
      {showVideo && (
        <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
          <StreamView stream={call.remote} fit={call.remoteSharing ? "contain" : "cover"} />
        </View>
      )}
      {live && call.video && !call.cameraOff && !!call.local && (
        <View style={{ position: "absolute", top: 56, right: 16, width: 108, height: 144, borderRadius: 14, overflow: "hidden", backgroundColor: "#000" }}>
          <StreamView stream={call.local} muted mirror />
        </View>
      )}
      {/* The sound, when there is no picture to carry it: a voice call, or a video call whose other side has its camera off. */}
      {!showVideo && !!call.remote && (
        <View style={{ width: 1, height: 1, opacity: 0 }}>
          <StreamView stream={call.remote} />
        </View>
      )}
      <View style={{ flex: 1, alignItems: "center", paddingTop: showVideo ? 64 : 120, gap: 14 }} pointerEvents="none">
        {!showVideo && <Avatar id={call.peer.userId} name={call.peer.name} size={132} src={avatar} />}
        <Text
          numberOfLines={1}
          style={{
            maxWidth: 300,
            fontSize: 26,
            fontWeight: "700",
            fontFamily,
            color: "#FFFFFF",
            textShadowColor: showVideo ? "rgba(0,0,0,0.6)" : "transparent",
            textShadowRadius: 6,
          }}
        >
          {call.peer.name}
        </Text>
        <Text
          accessibilityRole="timer"
          style={{
            fontSize: 16,
            fontFamily,
            color: call.poor && live ? "#FFB224" : "rgba(255,255,255,0.8)",
            fontVariant: ["tabular-nums"],
            textShadowColor: showVideo ? "rgba(0,0,0,0.6)" : "transparent",
            textShadowRadius: 6,
          }}
        >
          {status}
        </Text>
        {banner && live && (
          <View style={{ borderRadius: 14, paddingHorizontal: 12, height: 28, justifyContent: "center", backgroundColor: "rgba(48,164,108,0.9)" }}>
            <Text style={{ fontSize: 13, fontWeight: "600", fontFamily, color: "#FFFFFF" }}>{banner}</Text>
          </View>
        )}
      </View>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", rowGap: 16, columnGap: 4, paddingHorizontal: 12, paddingBottom: 40 + nav }}
      >
        {call.phase === "ended" ? null : ringingIn ? (
          <>
            <RoundButton label={t("call.decline")} icon="fluentCall" tone="danger" onPress={() => void controller.hangupCall()} />
            <RoundButton label={t("call.accept")} icon={call.video ? "video" : "fluentCall"} tone="accept" onPress={() => void controller.answerCall(true)} />
          </>
        ) : (
          <>
            <RoundButton
              label={call.muted ? t("call.unmute") : t("call.mute")}
              icon="mic"
              off={call.muted}
              slash={call.muted}
              onPress={() => void controller.setCallMuted(!call.muted)}
            />
            {call.video && (
              <RoundButton
                label={call.cameraOff ? t("call.cameraOn") : t("call.cameraOff")}
                icon="video"
                off={call.cameraOff}
                slash={call.cameraOff}
                onPress={() => void controller.setCallCameraOff(!call.cameraOff)}
              />
            )}
            {live && call.video && (
              <RoundButton label={call.sharing ? t("call.shareStop") : t("call.share")} icon="screen" off={call.sharing} onPress={() => void share()} />
            )}
            {live && (
              <View ref={gear} collapsable={false}>
                <RoundButton label={t("call.devices")} icon="gear" onPress={openDevices} />
              </View>
            )}
            <RoundButton label={t("call.hangup")} icon="fluentCall" tone="danger" onPress={() => void controller.hangupCall()} />
          </>
        )}
      </View>
      <Menu visible={!!menu && deviceItems.length > 0} anchor={menu} up width={300} items={deviceItems} onClose={() => setMenu(null)} />
    </View>
  );
}

/** The small window's size and its distance from the edges. */
const MINI_W = 124;
const MINI_H = 156;
const MINI_MARGIN = 8;
/** How far a press may move and still be a tap (not a drag), in px. */
const TAP_SLOP = 6;

/**
 * The call as a small window floating over the app, on the right to begin with: the person (or the other side's picture while there is
 * one), the clock or how the call is going, and nothing to press but the window itself, which opens the call screen. It can be dragged
 * anywhere and settles against the nearer side. A call that comes in is only this, so it never covers what the person is doing.
 * It also carries the sound of the call (the other side's stream is played here, so a call goes on being heard while this is shown).
 */
function MiniCall(props: { call: CallState; onOpen: () => void }) {
  const { call } = props;
  const t = useT();
  const avatar = useMediaUrl(call.peer.avatar, { width: 128, height: 128, fit: "crop" });
  const status = useCallStatus(call);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const pos = useRef(new Animated.ValueXY({ x: -1000, y: 0 })).current;
  const cur = useRef({ x: 0, y: 0 });
  const start = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const placed = useRef(false);
  const boxRef = useRef(box);
  boxRef.current = box;
  const open = useRef(props.onOpen);
  open.current = props.onOpen;

  // Where it is allowed to be: inside the area, a margin from each edge.
  const clampTo = (x: number, y: number) => ({
    x: Math.min(Math.max(x, MINI_MARGIN), Math.max(MINI_MARGIN, boxRef.current.w - MINI_W - MINI_MARGIN)),
    y: Math.min(Math.max(y, MINI_MARGIN), Math.max(MINI_MARGIN, boxRef.current.h - MINI_H - MINI_MARGIN)),
  });
  // First place: the right side, a little below the top. After that it stays where it was put (and is brought back inside if the area changes).
  useEffect(() => {
    if (box.w === 0) return;
    const next = placed.current ? clampTo(cur.current.x, cur.current.y) : clampTo(box.w - MINI_W - MINI_MARGIN, 72);
    placed.current = true;
    cur.current = next;
    pos.setValue(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, box.h]);

  const settle = () => {
    const b = boxRef.current;
    const x = cur.current.x + MINI_W / 2 < b.w / 2 ? MINI_MARGIN : b.w - MINI_W - MINI_MARGIN;
    const next = clampTo(x, cur.current.y);
    cur.current = next;
    Animated.spring(pos, { toValue: next, useNativeDriver: false, bounciness: 4, speed: 18 }).start();
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          pos.stopAnimation();
          start.current = { ...cur.current };
          moved.current = false;
        },
        onPanResponderMove: (_e, g) => {
          if (Math.abs(g.dx) + Math.abs(g.dy) > TAP_SLOP) moved.current = true;
          if (!moved.current) return;
          const next = clampTo(start.current.x + g.dx, start.current.y + g.dy);
          cur.current = next;
          pos.setValue(next);
        },
        onPanResponderRelease: () => (moved.current ? settle() : open.current()),
        onPanResponderTerminate: () => (moved.current ? settle() : undefined),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pos],
  );

  const { colors } = useTheme();
  const ringing = call.incoming && call.phase === "ringing";
  const showVideo = call.phase === "connected" && !!call.remote && (call.remoteSharing || (call.video && !call.remoteCameraOff));
  return (
    <View
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100 }}
    >
      <Animated.View
        {...responder.panHandlers}
        accessibilityRole="button"
        accessibilityLabel={ringing ? status : t("call.expand")}
        {...({
          tabIndex: 0,
          onKeyDown: (e: { key: string }) => {
            if (e.key === "Enter" || e.key === " ") props.onOpen();
          },
        } as object)}
        style={
          {
            position: "absolute",
            left: 0,
            top: 0,
            width: MINI_W,
            height: MINI_H,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#1C1F24",
            // The edge is the theme's colour (the rest of the window is dark whatever the theme is).
            borderWidth: 2,
            borderColor: colors.accent,
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
            cursor: "pointer",
            transform: pos.getTranslateTransform(),
          } as object
        }
      >
        {showVideo ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
            <StreamView stream={call.remote} fit={call.remoteSharing ? "contain" : "cover"} />
          </View>
        ) : (
          <>
            {/* The sound goes on while the call is small. */}
            {!!call.remote && (
              <View pointerEvents="none" style={{ width: 1, height: 1, opacity: 0 }}>
                <StreamView stream={call.remote} />
              </View>
            )}
            <View pointerEvents="none" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6 }}>
              <Avatar id={call.peer.userId} name={call.peer.name} size={52} src={avatar} />
              <Text numberOfLines={1} style={{ maxWidth: MINI_W - 16, fontSize: 14, fontWeight: "700", fontFamily, color: "#FFFFFF" }}>
                {call.peer.name}
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  // The line that says what is going on: larger, and while a call is coming in in a colour of its own (not the theme's).
                  fontSize: ringing ? 15 : 13,
                  lineHeight: ringing ? 19 : 16,
                  fontWeight: ringing ? "700" : "400",
                  fontFamily,
                  textAlign: "center",
                  color: call.poor ? "#FFB224" : ringing ? "#3DD68C" : "rgba(255,255,255,0.75)",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {status}
              </Text>
            </View>
          </>
        )}
        {showVideo && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingVertical: 4, alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" }}
          >
            <Text numberOfLines={1} style={{ fontSize: 12, fontFamily, color: "#FFFFFF", fontVariant: ["tabular-nums"] }}>
              {status}
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * The call. It is the full screen from the start, whether I placed it or it came in (a call is something to answer now). The button at the
 * top left makes it the small window (and the system's Back does the same, rather than hanging up); pressing the small window opens the
 * full screen again. A call that has ended stays a moment, saying how, then goes by itself.
 */
export function CallScreen() {
  const call = useCall();
  useRingNotification(call);
  useCallSounds(call);
  const scale = useScale();
  const controller = useController();
  // What the person chose for this call (small or large); until they choose, it is large.
  const [view, setView] = useState<{ id: string; small: boolean } | null>(null);
  const small = !!call && view?.id === call.id && view.small;
  const ended = call?.phase === "ended";
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => controller.dismissCall(), ENDED_STAYS_MS);
    return () => clearTimeout(timer);
  }, [ended, controller]);
  if (!call) return null;
  const shrink = () => setView({ id: call.id, small: true });
  if (small) return <MiniCall call={call} onOpen={() => setView({ id: call.id, small: false })} />;
  return (
    <Modal transparent={false} visible animationType="fade" onRequestClose={shrink}>
      <ScaleRoot scale={scale}>
        <CallBody call={call} onMinimize={shrink} />
      </ScaleRoot>
    </Modal>
  );
}
