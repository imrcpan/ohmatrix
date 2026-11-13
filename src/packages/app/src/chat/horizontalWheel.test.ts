import { expect, test, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
let effect: (() => void | (() => void)) | undefined;
vi.mock("react", () => ({ useEffect: (f: () => void | (() => void)) => (effect = f) }));

const { useWheelToSide } = await import("./horizontalWheel.js");

/** A row of `scrollWidth` px shown `clientWidth` wide, at `left`; wheel(deltaY) is what the browser would send. */
function useRow(scrollWidth: number, clientWidth: number, left = 0) {
  let handler: ((e: { deltaX: number; deltaY: number; deltaMode: number; preventDefault(): void }) => void) | undefined;
  const node = {
    scrollLeft: left,
    scrollWidth,
    clientWidth,
    addEventListener: (_t: string, h: typeof handler) => (handler = h),
    removeEventListener: () => (handler = undefined),
  };
  useWheelToSide({ current: { getScrollableNode: () => node } });
  const cleanup = effect!();
  return {
    node,
    cleanup,
    wheel: (deltaY: number, deltaX = 0, deltaMode = 0) => {
      const e = { deltaX, deltaY, deltaMode, preventDefault: vi.fn() };
      handler!(e);
      return e.preventDefault.mock.calls.length > 0;
    },
  };
}

test("a turn of the wheel moves the row sideways by as much, and the page does not scroll", () => {
  const r = useRow(1000, 300);
  expect(r.wheel(100)).toBe(true);
  expect(r.node.scrollLeft).toBe(100);
  expect(r.wheel(-40)).toBe(true);
  expect(r.node.scrollLeft).toBe(60);
});

test("at the ends the row stops, and the wheel goes on to the page", () => {
  const r = useRow(1000, 300, 0);
  expect(r.wheel(-100)).toBe(false);
  expect(r.node.scrollLeft).toBe(0);
  const end = useRow(1000, 300, 650);
  expect(end.wheel(100)).toBe(true);
  expect(end.node.scrollLeft).toBe(700);
  expect(end.wheel(100)).toBe(false);
  expect(end.node.scrollLeft).toBe(700);
});

test("a row that fits, or a wheel that already turns sideways, is left to the browser", () => {
  expect(useRow(300, 300).wheel(100)).toBe(false);
  const r = useRow(1000, 300);
  expect(r.wheel(100, 30)).toBe(false);
  expect(r.wheel(0)).toBe(false);
  expect(r.node.scrollLeft).toBe(0);
});

test("a wheel that counts in lines or in pages is turned into pixels", () => {
  const lines = useRow(1000, 300);
  lines.wheel(3, 0, 1);
  expect(lines.node.scrollLeft).toBe(48);
  const pages = useRow(1000, 300);
  pages.wheel(1, 0, 2);
  expect(pages.node.scrollLeft).toBe(300);
});
