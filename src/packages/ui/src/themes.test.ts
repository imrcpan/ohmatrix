import { expect, test } from "vitest";
import { defineTheme, getTheme, listThemes, mix, registerTheme, resolveTheme, themeLabel } from "./themes.js";

test("mix interpolates colours", () => {
  expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  expect(mix("#ff0000", "#0000ff", 0)).toBe("#ff0000");
});

test("built-in themes are registered and complete", () => {
  const ids = listThemes().map((t) => t.id);
  expect(ids).toEqual(
    expect.arrayContaining(["light", "dark", "midnight", "ocean", "forest", "dark-green", "dark-pink", "dark-yellow", "dark-violet", "light-violet", "sakura"]),
  );
  for (const t of listThemes()) for (const v of Object.values(t.colors)) expect(v).toBeTruthy();
});

test("a custom theme is one defineTheme + registerTheme call", () => {
  registerTheme(defineTheme({ id: "amber", label: { en: "Amber" }, dark: true, accent: "#FFB300" }));
  expect(getTheme("amber")?.colors.accent).toBe("#FFB300");
  expect(listThemes().at(-1)?.id).toBe("amber");
  expect(themeLabel(getTheme("amber")!, "zh-CN")).toBe("Amber"); // falls back to English
});

test("system follows the OS scheme; unknown ids fall back to light", () => {
  expect(resolveTheme("system", "dark").id).toBe("dark");
  expect(resolveTheme("system", null).id).toBe("light");
  expect(resolveTheme("nope", "dark").id).toBe("light");
  expect(resolveTheme("sakura", "dark").id).toBe("sakura");
});
