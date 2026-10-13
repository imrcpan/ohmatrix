import type { PowerThresholds } from "@ohmatrix/core";

/** The numbers behind m.room.power_levels, with the spec's defaults for whatever the event leaves out. */
export function thresholdsOf(content: Record<string, unknown> | undefined): PowerThresholds {
  const c = content ?? {};
  const num = (k: string, d: number) => (typeof c[k] === "number" ? (c[k] as number) : d);
  const events = (c.events ?? {}) as Record<string, unknown>;
  const stateDefault = num("state_default", 50);
  return {
    invite: num("invite", 0),
    kick: num("kick", 50),
    ban: num("ban", 50),
    redact: num("redact", 50),
    sendMessages: num("events_default", 0),
    changeSettings: stateDefault,
    changeLevels: typeof events["m.room.power_levels"] === "number" ? (events["m.room.power_levels"] as number) : stateDefault,
  };
}

/** `#local:server` from what the user typed: lower case, spaces become dashes, no `#` or server part. */
export function aliasLocalpart(input: string): string {
  return input.trim().replace(/^#/, "").replace(/:.*$/, "").toLowerCase().replace(/\s+/g, "-");
}
