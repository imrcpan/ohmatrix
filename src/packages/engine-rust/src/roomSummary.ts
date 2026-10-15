import type { RoomSummary } from "@ohmatrix/core";
import { personName } from "./serviceText.js";

/**
 * The fields of the SDK's `RoomInfo` a chat list row is made from. Counts arrive as `bigint`; the membership and the
 * notification mode are numbered enums in the bindings, named here by the converter that builds this.
 */
export interface RoomInfoLike {
  id: string;
  displayName?: string | undefined;
  rawName?: string | undefined;
  avatarUrl?: string | undefined;
  isDirect: boolean;
  isSpace: boolean;
  isFavourite: boolean;
  /** Joined or invited: the SDK also lists rooms I have left or am banned from, which the list does not show. */
  membership: "Invited" | "Joined" | "Left" | "Knocked" | "Banned";
  inviter?: { userId: string; displayName?: string | undefined } | undefined;
  joinedMembersCount: bigint;
  numUnreadNotifications: bigint;
  numUnreadMentions: bigint;
  isMarkedUnread: boolean;
  /** Muted: the user has chosen to be told of nothing in this room. */
  mutedByUser: boolean;
}

/** `bigint` counts as the numbers we use. A count too big for one is not a count anyone reads. */
export const count = (n: bigint | number): number => (typeof n === "bigint" ? Number(n) : n);

/** Whether a membership belongs in the chat list. */
export const isListed = (m: RoomInfoLike["membership"]): boolean => m === "Joined" || m === "Invited";

/**
 * One row of the chat list from the SDK's room info. The last message and its time are not in `RoomInfo`; the caller
 * adds them (`lastMessage`, `lastActivityTs`) from the room's latest event.
 */
export function toRoomSummary(info: RoomInfoLike, latest?: Pick<RoomSummary, "lastMessage" | "lastActivityTs">): RoomSummary {
  const invited = info.membership === "Invited";
  return {
    id: info.id,
    name: info.displayName || info.rawName || info.id,
    ...(info.avatarUrl && { avatar: info.avatarUrl }),
    ...(invited && { invite: { inviter: info.inviter ? personName(info.inviter.displayName, info.inviter.userId) : "" } }),
    ...(info.mutedByUser && { muted: true }),
    ...(info.isFavourite && { pinned: true }),
    ...(info.isMarkedUnread && { markedUnread: true }),
    isDirect: info.isDirect,
    ...(info.isSpace && { isSpace: true }),
    memberCount: invited ? 0 : count(info.joinedMembersCount),
    unreadCount: invited ? 0 : count(info.numUnreadNotifications),
    highlightCount: invited ? 0 : count(info.numUnreadMentions),
    ...(!invited && latest?.lastMessage && { lastMessage: latest.lastMessage }),
    lastActivityTs: latest?.lastActivityTs ?? 0,
  };
}

/** The order the list is shown in: invitations, then pinned chats, then by recent activity (the other engine's order). */
export function compareRooms(a: RoomSummary, b: RoomSummary): number {
  return Number(!!b.invite) - Number(!!a.invite) || Number(!!b.pinned) - Number(!!a.pinned) || b.lastActivityTs - a.lastActivityTs;
}
