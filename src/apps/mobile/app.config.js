// Expo hands the static app.json to this function. A release build (scripts/build-android-<abi>.sh) sets OHM_VERSION and OHM_ABI: the
// APK then carries that version name and a version code of its own for that ABI. Without them (development) app.json is used as it is.
//
// The app icon is made from logo/main-full.svg by scripts/makeIcons.mjs (the repository keeps the SVG only), into .generated/. When it has
// been made it is the icon; without it (nobody has run `pnpm icons`) the app keeps Expo's default.
//
// OHM_TEST_APP=1 (what `build-android-<abi>.sh --test` and `--debug` set) makes the test app: package org.ohmatrix.test, named "OhMatrix Test", and no
// Firebase file (the push project knows only the real package). The real app is unchanged.
//
// Firebase (push through FCM) is set up from google-services.json, the one in this folder or the file OHM_GOOGLE_SERVICES names (what
// `build-android-<abi>.sh --google-services` sets). The file is the app's own and is not a secret: its API key is limited to this package and
// its signing certificates in the Google Cloud console. Without a file the app is built with no push, and works as before.
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { versionCodeOf } = require("./version.cjs");

const ICON = join(__dirname, ".generated", "icon.png");
const GOOGLE_SERVICES = resolve(process.env.OHM_GOOGLE_SERVICES || join(__dirname, "google-services.json"));

module.exports = ({ config }) => {
  const version = process.env.OHM_VERSION;
  // A file that was asked for by name and is not there is an error: the build would otherwise come out without push, unnoticed.
  if (process.env.OHM_GOOGLE_SERVICES && !existsSync(GOOGLE_SERVICES)) throw new Error(`OHM_GOOGLE_SERVICES: no such file: ${GOOGLE_SERVICES}`);
  const test = process.env.OHM_TEST_APP === "1";
  const named = test ? { ...config, name: "OhMatrix Test", android: { ...config.android, package: "org.ohmatrix.test" } } : config;
  const withIcon = existsSync(ICON) ? { ...named, icon: ICON } : named;
  const withPush = !test && existsSync(GOOGLE_SERVICES) ? { ...withIcon, android: { ...withIcon.android, googleServicesFile: GOOGLE_SERVICES } } : withIcon;
  if (!version) return withPush;
  return {
    ...withPush,
    version,
    android: { ...withPush.android, versionCode: versionCodeOf(version, process.env.OHM_ABI) },
  };
};
