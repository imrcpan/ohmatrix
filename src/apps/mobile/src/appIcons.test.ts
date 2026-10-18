import { expect, test, vi } from "vitest";
import { createAppIcons, type AppIconNative } from "./appIcons.js";

const list = [
  { id: "default", preview: 1 },
  { id: "dark-1", preview: 2 },
];
const native = (showing = "default") => ({ getIcon: () => showing, setIcon: vi.fn<(id: string) => void>() });

test("there is nothing to choose without the list or without the native module", () => {
  expect(createAppIcons(null, native())).toBeUndefined();
  expect(createAppIcons([], native())).toBeUndefined();
  expect(createAppIcons(list, null)).toBeUndefined();
  expect(createAppIcons(list, undefined)).toBeUndefined();
});

test("the list is the generated one, and the current icon is what the device is showing", () => {
  const icons = createAppIcons(list, native("dark-1"))!;
  expect(icons.list().map((i) => i.id)).toEqual(["default", "dark-1"]);
  expect(icons.current()).toBe("dark-1");
});

test("an icon the list does not know of is shown as the first, and a device that cannot say is too", () => {
  expect(createAppIcons(list, native("something-old"))!.current()).toBe("default");
  const broken: AppIconNative = {
    getIcon: () => {
      throw new Error("no");
    },
    setIcon: () => {},
  };
  expect(createAppIcons(list, broken)!.current()).toBe("default");
});

test("choosing passes the id to the device, and an unknown id is refused before it gets there", () => {
  const n = native();
  const icons = createAppIcons(list, n)!;
  icons.set("dark-1");
  expect(n.setIcon).toHaveBeenCalledWith("dark-1");
  expect(() => icons.set("nope")).toThrow(/unknown icon/);
  expect(n.setIcon).toHaveBeenCalledTimes(1);
});
