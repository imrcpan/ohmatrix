/** Pure parsing of Matrix message bodies into styled runs. No React, no platform APIs. */

/**
 * A run of text with the formatting the sender asked for. `formatted_body` is HTML, but we never
 * inject it: it is parsed into these runs and rendered as nested React Native Text, so a message can
 * only ever carry the handful of styles below.
 */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  /** Set for `<a href>` and for bare URLs found in the plain body. */
  href?: string;
  /** Matrix user permalink (matrix.to) or an `@localpart` in the body: drawn as a mention pill. */
  userId?: string;
  /** The whole run was inside `<span data-mx-spoiler>`; hidden until tapped. */
  spoiler?: boolean;
  /** Ends the line (from `<br>`, `</p>`, a blockquote or a list item). */
  br?: boolean;
  /** Prefix drawn before the text: "> " for a quote, "• " for a list item. */
  prefix?: string;
}
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decode(s: string): string {
  return s.replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : m));
}
const VOID = new Set(["br", "hr", "img"]);
/** matrix.to permalinks are how formatted_body points at a person; anything else is a plain link. */
function userIdOf(href: string): string | undefined {
  const m = /^https?:\/\/matrix\.to\/#\/(@[^/?#\s]+)/.exec(href);
  return m?.[1];
}
/**
 * Parses a Matrix `formatted_body` into runs. Unknown tags are dropped (their text is kept), so a
 * hostile body cannot inject markup, scripts or styles.
 */
export function parseFormatted(html: string): Run[] {
  const runs: Run[] = [];
  const stack: Array<Partial<Run> & { pre?: boolean; list?: "ul" | "ol" }> = [{}];
  const top = () => stack[stack.length - 1]!;
  let li = 0;
  let i = 0;
  const push = (text: string, extra: Partial<Run> = {}) => {
    if (!text) return;
    const run: Run = { text, ...top(), ...extra };
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, run)) last.text += text;
    else runs.push(run);
  };
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      push(decode(html.slice(i)));
      break;
    }
    push(decode(html.slice(i, lt)));
    const gt = html.indexOf(">", lt);
    if (gt === -1) {
      push(decode(html.slice(lt)));
      break;
    }
    const raw = html.slice(lt + 1, gt);
    i = gt + 1;
    if (raw.startsWith("!--")) {
      const end = html.indexOf("-->", i);
      i = end === -1 ? i : end + 3;
      continue;
    }
    const closing = raw.startsWith("/");
    const name = (closing ? raw.slice(1) : raw).split(/[\s/]/)[0]!.toLowerCase();
    const attrs = closing ? "" : raw.slice(name.length);
    if (VOID.has(name)) {
      if (name === "br") runs.push({ text: "\n", br: true });
      continue;
    }
    if (closing) {
      stack.pop();
      if (!stack.length) stack.push({});
      if (name === "p" || name === "blockquote" || name === "pre" || name === "li") runs.push({ text: "\n", br: true });
      continue;
    }
    const style: Partial<Run> & { pre?: boolean } = {};
    if (name === "b" || name === "strong") style.bold = true;
    else if (name === "i" || name === "em") style.italic = true;
    else if (name === "u") style.underline = true;
    else if (name === "s" || name === "del") style.strike = true;
    else if (name === "code") style.code = true;
    else if (name === "pre") {
      style.code = true;
      style.pre = true;
    } else if (name === "blockquote") style.italic = true;
    else if (name === "li") {
      const list = top().list;
      li = list === "ol" ? li + 1 : 0;
      style.prefix = list === "ol" ? `${li}. ` : "• ";
    } else if (name === "ol" || name === "ul") (style as { list?: "ul" | "ol" }).list = name as "ul" | "ol";
    else if (name === "a") {
      const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const url = decode(href?.[2] ?? href?.[3] ?? href?.[4] ?? "");
      if (url) {
        style.href = url;
        const uid = userIdOf(url);
        if (uid) style.userId = uid;
      }
    } else if (name === "span" && /data-mx-spoiler/i.test(attrs)) style.spoiler = true;
    else if (name === "p" && stack.some((f) => f.pre)) style.code = true;
    // Everything else (including untrusted tags with attributes) contributes no styling at all.
    if (style.pre) stack.push({ code: true, pre: true });
    else stack.push({ ...top(), ...style });
    if (name === "ol" || name === "ul") (top() as { list?: "ul" | "ol" }).list = name as "ul" | "ol";
  }
  // Trim a trailing blank line.
  while (runs.length && runs[runs.length - 1]!.text === "\n") runs.pop();
  return runs;
}
const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?"'’])/g;
/** Two runs can be merged when every styling field matches. */
function sameStyle(a: Run, b: Run): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.strike === !!b.strike &&
    !!a.code === !!b.code &&
    !a.spoiler === !b.spoiler &&
    a.href === b.href &&
    a.userId === b.userId &&
    a.prefix === b.prefix &&
    !a.br === !b.br
  );
}
/**
 * Plain body → runs, with bare URLs turned into links and `@name` tokens that match one of the
 * mentioned users turned into mention pills.
 */
export function plainRuns(body: string, mentions?: readonly string[]): Run[] {
  const out: Run[] = [];
  for (const part of body.split(URL_RE)) {
    if (!part) continue;
    if (URL_RE.test(part) && part !== body) {
      out.push({ text: part, href: part });
      URL_RE.lastIndex = 0;
      continue;
    }
    for (const piece of part.split(/(@[^\s@:]+(?::[^\s@:]+)?)/g)) {
      if (!piece) continue;
      const uid = piece.startsWith("@") && mentions?.find((m) => m === piece || m.split(":")[0] === piece);
      out.push(uid ? { text: piece, userId: uid } : { text: piece });
    }
  }
  return out;
}
