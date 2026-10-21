// The start-up screen: the app's logo in the middle of a plain ground, the app's own colour (white, or dark when the system is). Expo's
// template starts the app on its own picture (a grid of circles on white), which showed for a moment at every start.
//
// The picture comes from scripts/makeIcons.mjs (.generated/splash/), the same logo as the launcher icon. Android 12 and later draws its own
// start-up screen (a ground colour and an icon, which this sets in values-v31); before that, the window's background is what shows, a layer
// of the ground colour with the logo on it.
const { withAndroidColors, withAndroidStyles, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const GENERATED = join(__dirname, "..", ".generated", "splash");
/** The ground of the default light and dark themes (packages/ui/src/themes.ts). */
const LIGHT = "#FFFFFF";
const DARK = "#1C1C1E";

const withColors = (config) =>
  withAndroidColors(config, (c) => {
    c.modResults = AndroidConfig.Colors.assignColorValue(c.modResults, { name: "splashscreen_background", value: LIGHT });
    return c;
  });

const withTheme = (config) =>
  withAndroidStyles(config, (c) => {
    const style = c.modResults.resources.style?.find((s) => s.$.name === "Theme.App.SplashScreen");
    if (!style) throw new Error("withSplash: no Theme.App.SplashScreen in styles.xml");
    style.item = (style.item ?? []).filter((i) => i.$.name !== "android:windowBackground");
    style.item.push({ $: { name: "android:windowBackground" }, _: "@drawable/splash_window" });
    return c;
  });

const withFiles = (config) =>
  withDangerousMod(config, [
    "android",
    (c) => {
      if (!existsSync(GENERATED))
        throw new Error("the start-up pictures have not been made: run `node scripts/makeIcons.mjs` in apps/mobile first (the build scripts do)");
      const res = join(c.modRequest.platformProjectRoot, "app", "src", "main", "res");
      for (const d of readdirSync(GENERATED)) cpSync(join(GENERATED, d), join(res, d), { recursive: true });
      const put = (dir, file, text) => {
        mkdirSync(join(res, dir), { recursive: true });
        writeFileSync(join(res, dir, file), text);
      };
      put(
        "drawable",
        "splash_window.xml",
        `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n  <item android:drawable="@color/splashscreen_background" />\n  <item>\n    <bitmap android:gravity="center" android:src="@drawable/splashscreen_logo" />\n  </item>\n</layer-list>\n`,
      );
      // Android 12 and later cuts the start-up icon to a circle two thirds of its canvas wide. The logo is a rounded square, so it sits in the
      // middle of a canvas of 288 dp (the size the system expects), 120 dp wide: its corners are 85 dp from the centre, inside the circle of 96.
      put(
        "drawable",
        "splash_icon.xml",
        `<?xml version="1.0" encoding="utf-8"?>\n<inset xmlns:android="http://schemas.android.com/apk/res/android" android:drawable="@drawable/splashscreen_logo" android:inset="84dp" />\n`,
      );
      put("values-night", "colors.xml", `<resources>\n  <color name="splashscreen_background">${DARK}</color>\n</resources>\n`);
      put(
        "values-v31",
        "styles.xml",
        `<resources>\n  <style name="Theme.App.SplashScreen" parent="AppTheme">\n    <item name="android:windowBackground">@drawable/splash_window</item>\n    <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>\n    <item name="android:windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>\n  </style>\n</resources>\n`,
      );
      return c;
    },
  ]);

module.exports = (config) => withFiles(withTheme(withColors(config)));
