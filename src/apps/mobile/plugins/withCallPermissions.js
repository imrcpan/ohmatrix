// What a call needs from Android that the other libraries of the app do not already ask for: the camera (a video call), the audio settings
// (to route the sound to the earpiece, the speaker or a headset), and the Bluetooth connection (a headset's microphone, Android 12 and
// later). The microphone (RECORD_AUDIO) is there already, for voice messages. react-native-webrtc's own plugin only writes the iOS texts.
const { withAndroidManifest } = require("@expo/config-plugins");

const PERMISSIONS = [
  "android.permission.CAMERA",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.BLUETOOTH_CONNECT",
  "android.permission.ACCESS_NETWORK_STATE",
];
// A phone without a camera or a microphone still installs the app: a call then says so, instead of the app being kept off the phone.
const OPTIONAL_FEATURES = ["android.hardware.camera", "android.hardware.camera.autofocus", "android.hardware.microphone"];

module.exports = (config) =>
  withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    const permissions = (manifest["uses-permission"] ??= []);
    for (const name of PERMISSIONS) if (!permissions.some((p) => p.$["android:name"] === name)) permissions.push({ $: { "android:name": name } });
    const features = (manifest["uses-feature"] ??= []);
    for (const name of OPTIONAL_FEATURES) {
      const have = features.find((f) => f.$["android:name"] === name);
      if (have) have.$["android:required"] = "false";
      else features.push({ $: { "android:name": name, "android:required": "false" } });
    }
    return c;
  });
