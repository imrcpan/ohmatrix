import { expect, test } from "vitest";
import type { AccountStore, Session, StoredAccount } from "@ohmatrix/core";
import { createPushSync, notifyingAccountStore, pushLanguage, pushStateJson, type PushNative } from "./pushState.js";

const roots = { documents: "file:///data/user/0/org.ohmatrix.app/files", cache: "file:///data/user/0/org.ohmatrix.app/cache" };
const prefs = { pushEnabled: true, notificationPreview: true, locale: null as "en" | "zh-CN" | null };
const session = (id: string, native?: string): Session => ({
  homeserver: "https://h",
  userId: id,
  deviceId: "DEV",
  accessToken: `token-${id}`,
  ...(native && { native }),
});

test("the state the service reads has each account's session and database folders, and the database key once", () => {
  const first: StoredAccount = { session: session("@a:h", JSON.stringify({ refreshToken: "r", slidingSyncVersion: 1 })) };
  const second: StoredAccount = { session: session("@b:h", JSON.stringify({ slidingSyncVersion: 0 })), dir: "acct-1" };
  const json = JSON.parse(pushStateJson([first, second], "pass", roots, { ...prefs, notificationPreview: false, locale: "zh-CN" })) as Record<string, unknown>;
  expect(json["key"]).toBe("pass");
  expect(json).toMatchObject({ enabled: true, content: false, lang: "zh-CN" });
  const [a, b] = json["accounts"] as Record<string, unknown>[];
  // The account from before there were several keeps the app's own folder; the others have a folder of their own.
  expect(a).toMatchObject({
    userId: "@a:h",
    accessToken: "token-@a:h",
    refreshToken: "r",
    slidingSyncNative: true,
    dataDir: "/data/user/0/org.ohmatrix.app/files",
  });
  expect(b).toMatchObject({
    userId: "@b:h",
    slidingSyncNative: false,
    dataDir: "/data/user/0/org.ohmatrix.app/files/acct-1",
    cacheDir: "/data/user/0/org.ohmatrix.app/cache/acct-1",
  });
  expect(b).not.toHaveProperty("refreshToken");
  expect(JSON.stringify(json).split('"pass"').length - 1).toBe(1); // the key is not repeated for each account
});

test("a session from another engine (nothing native) counts as native sliding sync; a damaged native value is the same as none", () => {
  const json = JSON.parse(pushStateJson([{ session: session("@a:h") }, { session: session("@b:h", "{not json") }], "p", roots, prefs)) as {
    accounts: { slidingSyncNative: boolean }[];
  };
  expect(json.accounts.map((a) => a.slidingSyncNative)).toEqual([true, true]);
});

test("with no account or no key the state is empty, which removes it from the service", () => {
  expect(pushStateJson([], "p", roots, prefs)).toBe("");
  expect(pushStateJson([{ session: session("@a:h") }], null, roots, prefs)).toBe("");
});

test("every change of the accounts or of the settings hands the whole state over again, one after the other", async () => {
  const stored: StoredAccount[] = [];
  const accounts: AccountStore = {
    list: async () => [...stored],
    upsert: async (a) => void stored.push(a),
    remove: async (id) => void stored.splice(0, stored.length, ...stored.filter((a) => a.session.userId !== id)),
    reorder: async () => {},
    activeId: async () => null,
    setActive: async () => {},
  };
  const sent: string[] = [];
  const native: PushNative = { setState: (json) => void sent.push(json) };
  const sync = createPushSync(native, accounts, async () => "pass", roots);
  const store = notifyingAccountStore(accounts, () => sync.refresh());
  const users = () => sent.map((s) => (s ? (JSON.parse(s) as { accounts: { userId: string }[] }).accounts.map((a) => a.userId).join(",") : ""));

  await store.upsert({ session: session("@a:h") });
  await store.upsert({ session: session("@b:h") });
  await store.remove("@a:h");
  await store.remove("@b:h");
  await sync.refresh();
  expect(users()).toEqual(["@a:h", "@a:h,@b:h", "@b:h", "", ""]);

  const before = sent.length;
  await store.upsert({ session: session("@c:h") });
  await sync.prefs({ ...prefs, pushEnabled: false });
  expect(sent.length).toBe(before + 2);
  expect(JSON.parse(sent.at(-1)!)).toMatchObject({ enabled: false });
  await sync.prefs({ ...prefs, pushEnabled: false }); // nothing changed
  expect(sent.length).toBe(before + 2);
});

test("a module that is not in the build, or one that throws, does not break the app", async () => {
  const sync = createPushSync(
    {
      setState: () => {
        throw new Error("no module");
      },
    },
    { list: async () => [], upsert: async () => {}, remove: async () => {}, reorder: async () => {}, activeId: async () => null, setActive: async () => {} },
    async () => "p",
    roots,
  );
  await expect(sync.refresh()).resolves.toBeUndefined();
});

test("the service writes in the language chosen in Settings, else in the phone's, and in English for one this version does not have", () => {
  expect(pushLanguage("ru", "en-US")).toBe("ru");
  expect(pushLanguage("zh-TW", "en-US")).toBe("zh-TW");
  expect(pushLanguage(null, "fr-CA")).toBe("fr");
  expect(pushLanguage(null, "zh-Hant-HK")).toBe("zh-TW");
  expect(pushLanguage(null, "zh-CN")).toBe("zh-CN");
  expect(pushLanguage(null, "pt_BR")).toBe("pt");
  expect(pushLanguage(null, "in")).toBe("id"); // Java's old tag for Indonesian
  expect(pushLanguage(null, "ar-EG")).toBe("en");
  expect(pushLanguage("ur", "ar-EG")).toBe("en"); // a language of a newer version, saved in the settings
  expect(pushLanguage("ur", "de-DE")).toBe("de"); // ... is the same as none chosen
  expect(pushLanguage(null, undefined)).toBe("en");
});

test("with no language chosen, the json carries the phone's", () => {
  const json = JSON.parse(pushStateJson([{ session: session("@a:h") }], "p", roots, { ...prefs, locale: null })) as { lang: string };
  expect(["en", "zh-CN", "zh-TW", "es", "fr", "de", "pt", "it", "ru", "ja", "ko", "hi", "bn", "id"]).toContain(json.lang);
});
