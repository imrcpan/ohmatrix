// Expo hands the static app.json to this function. A release build (scripts/build-android.sh) sets OHM_VERSION and OHM_ABI: the
// APK then carries that version name and a version code of its own for that ABI. Without them (development) app.json is used as it is.
const { versionCodeOf } = require("./version.cjs");

module.exports = ({ config }) => {
  const version = process.env.OHM_VERSION;
  if (!version) return config;
  return {
    ...config,
    version,
    android: { ...config.android, versionCode: versionCodeOf(version, process.env.OHM_ABI) },
  };
};
