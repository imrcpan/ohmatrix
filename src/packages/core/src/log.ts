/**
 * The app's log: what `console.log/info/warn/error` said since the app started, kept in memory (the last `LIMIT` lines) so that a page of the
 * app can show it. On a phone the console goes to the system's log, which the app itself cannot read; this is the part the app can.
 * It holds what the JavaScript wrote: not the Rust library's own log, and not what the push service (native code) writes.
 */
export interface LogLine {
  /** Increases with every line, for a list's key. */
  id: number;
  /** Milliseconds since 1970. */
  ts: number;
  level: "log" | "info" | "warn" | "error";
  text: string;
}

const LIMIT = 2000;
/** One line is cut at this many characters: a long error or a dump of an object must not fill the memory. */
const MAX_LINE = 4000;

type Listener = () => void;
const lines: LogLine[] = [];
const listeners = new Set<Listener>();
let next = 1;
let installed = false;

function show(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Add a line. */
export function logLine(level: LogLine["level"], ...args: unknown[]): void {
  let text = args.map(show).join(" ");
  if (text.length > MAX_LINE) text = `${text.slice(0, MAX_LINE)}… (${text.length - MAX_LINE} more characters)`;
  lines.push({ id: next++, ts: Date.now(), level, text });
  if (lines.length > LIMIT) lines.splice(0, lines.length - LIMIT);
  listeners.forEach((l) => l());
}

/** What is in the log now, oldest first. A new array each time the log changes (so a hook can tell). */
let snapshot: readonly LogLine[] = [];
let snapshotAt = 0;
export function logLines(): readonly LogLine[] {
  if (snapshotAt !== next) {
    snapshot = lines.slice();
    snapshotAt = next;
  }
  return snapshot;
}

/** Call `cb` when a line is added; returns the unsubscribe. */
export function onLog(cb: Listener): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Empty the log. */
export function clearLog(): void {
  lines.length = 0;
  next++;
  listeners.forEach((l) => l());
}

/** The log as the text to copy: one line each, with the time and the level. */
export function logText(all: readonly LogLine[] = logLines()): string {
  return all.map((l) => `${new Date(l.ts).toISOString().slice(11, 23)} ${l.level.toUpperCase().padEnd(5)} ${l.text}`).join("\n");
}

type ConsoleLike = Record<"log" | "info" | "warn" | "error", (...a: unknown[]) => void>;

/**
 * Make the console write into the log too (and still where it wrote before). Done once; a second call does nothing. Uncaught errors that
 * reach the global handler are added as well, where the platform has one.
 */
export function installLog(): void {
  if (installed) return;
  installed = true;
  const root = globalThis as unknown as {
    console?: ConsoleLike;
    ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void };
  };
  const c = root.console;
  if (c) {
    for (const level of ["log", "info", "warn", "error"] as const) {
      const original = c[level];
      c[level] = (...args: unknown[]) => {
        try {
          logLine(level, ...args);
        } catch {
          /* the log must never stop the app from logging where it did before */
        }
        original?.apply(c, args);
      };
    }
  }
  const handlers = root.ErrorUtils;
  if (handlers) {
    const before = handlers.getGlobalHandler();
    handlers.setGlobalHandler((e, fatal) => {
      logLine("error", fatal ? "FATAL" : "uncaught", e);
      before(e, fatal);
    });
  }
}
