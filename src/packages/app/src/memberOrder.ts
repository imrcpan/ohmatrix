import type { RoomMember } from "@ohmatrix/core";

/** How many members the chat info lists before View all. */
export const MEMBERS_SHOWN = 10;

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/**
 * Who comes first: joined people by power, the highest first (the room's creator, then admins, moderators, members and the levels in
 * between), those of equal power by name; people who are only invited come after all of them.
 */
export function compareMembers(a: RoomMember, b: RoomMember): number {
  if (!!a.invited !== !!b.invited) return a.invited ? 1 : -1;
  if (a.power !== b.power) return a.power > b.power ? -1 : 1; // also right for Infinity (a creator), which a subtraction would not be
  return collator.compare(a.name || a.userId, b.name || b.userId);
}

/** The first `k` of the members in that order, in one pass over them: the chat info of a room of thousands does not sort them all. */
export function topMembers(members: readonly RoomMember[], k = MEMBERS_SHOWN): RoomMember[] {
  const top: RoomMember[] = [];
  for (const m of members) {
    if (top.length === k && compareMembers(m, top[k - 1]!) >= 0) continue;
    let at = top.length;
    while (at > 0 && compareMembers(m, top[at - 1]!) < 0) at--;
    top.splice(at, 0, m);
    if (top.length > k) top.pop();
  }
  return top;
}

/** All of them in that order (a copy: the list the engine gave is not touched). */
export function sortMembers(members: readonly RoomMember[]): RoomMember[] {
  return [...members].sort(compareMembers);
}
