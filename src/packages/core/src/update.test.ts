import { expect, test } from "vitest";
import { isNewer, parseRelease, parseVersion, pickApk } from "./update.js";

test("a version is three numbers, with or without the v", () => {
  expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
  expect(parseVersion("1.10.0-rc1")).toEqual([1, 10, 0]);
  expect(parseVersion("dev")).toBeNull();
});

test("newer is compared number by number, not as text; a development build is older than any", () => {
  expect(isNewer("1.10.0", "1.9.9")).toBe(true);
  expect(isNewer("1.0.1", "1.0.0")).toBe(true);
  expect(isNewer("1.0.0", "1.0.0")).toBe(false);
  expect(isNewer("1.0.0", "2.0.0")).toBe(false);
  expect(isNewer("1.0.0", undefined)).toBe(true);
  expect(isNewer("nonsense", "1.0.0")).toBe(false);
});

test("a release is read from what GitHub answers, and the APK of the phone's ABI is picked", () => {
  const r = parseRelease({
    tag_name: "v1.2.0",
    html_url: "https://github.com/imrcpan/ohmatrix/releases/tag/v1.2.0",
    assets: [
      { name: "OhMatrix_android_1.2.0_x86_64.apk", browser_download_url: "https://x/x86" },
      { name: "OhMatrix_android_1.2.0_arm64-v8a.apk", browser_download_url: "https://x/arm64" },
      { name: "SHA256SUMS.txt", browser_download_url: "https://x/sums" },
      { name: 5 },
    ],
  });
  expect(r?.version).toBe("1.2.0");
  expect(r?.assets).toHaveLength(3);
  expect(pickApk(r!.assets, ["arm64-v8a", "armeabi-v7a"])?.url).toBe("https://x/arm64");
  expect(pickApk(r!.assets, ["armeabi-v7a"])).toBeUndefined();
  expect(parseRelease({ tag_name: "latest" })).toBeNull();
  expect(parseRelease(null)).toBeNull();
});
