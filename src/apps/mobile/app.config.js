// Expo hands the static app.json to this function. A release build (scripts/build-android.sh) sets OHM_VERSION and OHM_ABI: the
// APK then carries that version name and a version code of its own for that ABI. Without them (development) app.json is used as it is.
//
// The app icon is made from logo/main-full.svg by scripts/makeIcons.mjs (the repository keeps the SVG only), into .generated/. When it has
// been made it is the icon; without it (nobody has run `pnpm icons`) the app keeps Expo's default.
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { versionCodeOf } = require("./version.cjs");

const ICON = join(__dirname, ".generated", "icon.png");

module.exports = ({ config }) => {
  const version = process.env.OHM_VERSION;
  const withIcon = existsSync(ICON) ? { ...config, icon: ICON } : config;
  if (!version) return withIcon;
  return {
    ...withIcon,
    version,
    android: { ...withIcon.android, versionCode: versionCodeOf(version, process.env.OHM_ABI) },
  };
};
