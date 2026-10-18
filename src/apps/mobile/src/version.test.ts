import { expect, test } from "vitest";
import { ABIS, parseVersion, versionCodeOf } from "../version.cjs";

test("a version is a.b.c in digits and nothing else", () => {
  expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  for (const bad of ["", "1", "1.2", "v1.2.3", "1.2.3-rc1", "1.2.3.4", "1.x.3", " 1.2.3"]) expect(() => parseVersion(bad)).toThrow();
});

test("the version code grows with the version, and fits what Android allows", () => {
  expect(versionCodeOf("0.0.0")).toBe(0);
  expect(versionCodeOf("1.2.3", "arm64-v8a")).toBe(10203 * 10 + 2);
  expect(versionCodeOf("1.2.4", "armeabi-v7a")).toBeGreaterThan(versionCodeOf("1.2.3", "x86_64"));
  expect(versionCodeOf("1.3.0", "armeabi-v7a")).toBeGreaterThan(versionCodeOf("1.2.99", "x86_64"));
  expect(versionCodeOf("9999.99.99", "x86_64")).toBeLessThan(2_100_000_000);
});

test("the APKs of one version have different codes, one per ABI", () => {
  const codes = Object.keys(ABIS).map((abi) => versionCodeOf("1.2.3", abi));
  expect(new Set(codes).size).toBe(codes.length);
  expect(() => versionCodeOf("1.2.3", "x86")).toThrow();
});

test("a minor or patch of 100 or more would run into the next number, so it is refused", () => {
  expect(() => versionCodeOf("1.100.0")).toThrow();
  expect(() => versionCodeOf("1.0.100")).toThrow();
  expect(() => versionCodeOf("10000.0.0")).toThrow();
});
