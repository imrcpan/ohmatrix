import { expect, test } from "vitest";
import { parseFormatted, plainRuns } from "./richtextModel.js";

const text = (runs: ReturnType<typeof parseFormatted>) => runs.map((r) => r.text).join("");
const mark = (runs: ReturnType<typeof parseFormatted>, t: string) => runs.find((r) => r.text === t);

test("parses the formatting tags Matrix allows", () => {
  const runs = parseFormatted("<strong>bold</strong> <em>italic</em> <u>under</u> <del>gone</del> <code>code</code>");
  expect(text(runs)).toBe("bold italic under gone code");
  expect(mark(runs, "bold")?.bold).toBe(true);
  expect(mark(runs, "italic")?.italic).toBe(true);
  expect(mark(runs, "under")?.underline).toBe(true);
  expect(mark(runs, "gone")?.strike).toBe(true);
  expect(mark(runs, "code")?.code).toBe(true);
});

test("nested tags accumulate, and closing them restores the outer style", () => {
  const runs = parseFormatted("<b>a<i>b</i>c</b>");
  expect(text(runs)).toBe("abc");
  expect(runs[1]).toMatchObject({ text: "b", bold: true, italic: true });
  expect(runs[2]).toMatchObject({ text: "c", bold: true });
  expect(runs[2]!.italic).toBeUndefined();
});

test("decodes entities and keeps the newline from <br>", () => {
  const runs = parseFormatted("a &amp; b &lt;c&gt;<br>d");
  expect(text(runs)).toBe("a & b <c>\nd");
});

test("links become runs; matrix.to user links become mentions", () => {
  const runs = parseFormatted('<a href="https://example.com/x">site</a> <a href="https://matrix.to/#/@ann:localhost">Ann</a>');
  expect(mark(runs, "site")?.href).toBe("https://example.com/x");
  expect(mark(runs, "site")?.userId).toBeUndefined();
  expect(mark(runs, "Ann")).toMatchObject({ userId: "@ann:localhost", href: "https://matrix.to/#/@ann:localhost" });
});

test("unknown and dangerous tags are dropped, their text kept", () => {
  const runs = parseFormatted('<script>alert(1)</script><img src=x onerror=alert(1)><span style="color:red" onclick="x()">text</span>');
  expect(text(runs)).toBe("alert(1)text");
  expect(runs.every((r) => !r.href)).toBe(true);
});

test("spoilers are marked, and lists get a bullet or a number", () => {
  const spoiler = parseFormatted("<span data-mx-spoiler>secret</span>");
  expect(spoiler.find((r) => r.text.includes("secret"))?.spoiler).toBe(true);
  const bullets = parseFormatted("<ul><li>one</li><li>two</li></ul>");
  expect(bullets.filter((r) => r.prefix === "• ").map((r) => r.text)).toEqual(["one", "two"]);
  const ordered = parseFormatted("<ol><li>a</li><li>b</li></ol>");
  expect(ordered.filter((r) => r.prefix).map((r) => r.prefix)).toEqual(["1. ", "2. "]);
});

test("unclosed tags do not lose text", () => {
  expect(text(parseFormatted("<b>half"))).toBe("half");
  expect(text(parseFormatted("plain"))).toBe("plain");
});

test("plain bodies linkify bare URLs but not punctuation", () => {
  const runs = plainRuns("see https://example.com/a. and http://b.c/d");
  expect(runs.filter((r) => r.href).map((r) => r.href)).toEqual(["https://example.com/a", "http://b.c/d"]);
  expect(runs.map((r) => r.text).join("")).toBe("see https://example.com/a. and http://b.c/d");
});

test("plain bodies turn mentioned names into pills, and only those", () => {
  const runs = plainRuns("hi @ann and @bob", ["@ann:localhost"]);
  expect(runs.find((r) => r.text === "@ann")?.userId).toBe("@ann:localhost");
  expect(runs.find((r) => r.text === "@bob")?.userId).toBeUndefined();
});
