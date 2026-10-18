// Lets the app change its own launcher icon on Android. The icons come from scripts/makeIcons.mjs (.generated/appIcons/).
//
// An Android app has one launcher entry per <activity-alias>, and shows the one that is enabled. So the launcher intent filter moves off
// MainActivity onto aliases of it, one for each icon to choose from, and exactly one is enabled: the default one, with the icon Expo makes
// (ic_launcher). The others carry the pictures this plugin copies into the project. Which is enabled is changed while the app runs, by the
// ohmatrix-app-icon module, which reads the list from the manifest (the meta-data below), so the names are written in one place only.
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const { cpSync, existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const GENERATED = join(__dirname, "..", ".generated");
/** The meta-data key the module reads: "id=alias" pairs, comma separated. */
const META_KEY = "org.ohmatrix.app.ICONS";

function readList() {
  const file = join(GENERATED, "appIcons.json");
  if (!existsSync(file)) throw new Error("the app icons have not been made: run `node scripts/makeIcons.mjs` in apps/mobile first (the build scripts do)");
  return JSON.parse(readFileSync(file, "utf8"));
}

const withAliases = (config) =>
  withAndroidManifest(config, (c) => {
    const list = readList();
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    const main = (app.activity ?? []).find((a) => a.$["android:name"] === ".MainActivity");
    if (!main) throw new Error("no MainActivity in the manifest");

    // The launcher filter leaves MainActivity (its deep link filters stay); every alias has one of its own.
    main["intent-filter"] = (main["intent-filter"] ?? []).filter(
      (f) => !(f.category ?? []).some((cat) => cat.$["android:name"] === "android.intent.category.LAUNCHER"),
    );

    app.activity = (app.activity ?? []).filter((a) => !a.$["android:name"].startsWith(".MainActivity") || a.$["android:name"] === ".MainActivity");
    app["activity-alias"] = list.map((i) => ({
      $: {
        "android:name": `.${i.alias}`,
        "android:targetActivity": ".MainActivity",
        "android:enabled": i.id === "default" ? "true" : "false",
        "android:exported": "true",
        "android:icon": `@mipmap/${i.resource}`,
        "android:roundIcon": `@mipmap/${i.id === "default" ? "ic_launcher_round" : i.resource}`,
        "android:label": "@string/app_name",
      },
      "intent-filter": [
        { action: [{ $: { "android:name": "android.intent.action.MAIN" } }], category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }] },
      ],
    }));
    // A project without a round icon of its own for the default (Expo makes none for a plain icon): the same picture then.
    for (const a of app["activity-alias"]) if (a.$["android:roundIcon"].endsWith("ic_launcher_round")) a.$["android:roundIcon"] = a.$["android:icon"];

    app["meta-data"] = [
      ...(app["meta-data"] ?? []).filter((m) => m.$["android:name"] !== META_KEY),
      { $: { "android:name": META_KEY, "android:value": list.map((i) => `${i.id}=${i.alias}`).join(",") } },
    ];
    return c;
  });

const withPictures = (config) =>
  withDangerousMod(config, [
    "android",
    (c) => {
      const list = readList();
      const from = join(GENERATED, "appIcons", "launcher");
      const res = join(c.modRequest.platformProjectRoot, "app", "src", "main", "res");
      for (const dir of readdirSync(from)) cpSync(join(from, dir), join(res, dir), { recursive: true });
      // Every alias must have its picture at every density it names, or the build would fail late and obscurely.
      for (const i of list.filter((x) => x.id !== "default")) {
        for (const dir of readdirSync(from)) {
          if (!existsSync(join(res, dir, `${i.resource}.png`))) throw new Error(`${i.resource}.png is missing in ${dir}`);
        }
      }
      return c;
    },
  ]);

module.exports = (config) => withPictures(withAliases(config));
module.exports.META_KEY = META_KEY;
