import type { HistoryVisibility, JoinRule, MemberRole, RoomDetails, RoomMember } from "@ohmatrix/core";
import type { RawMember, RawRoomDetails } from "./sdk.js";

/** The role a power level stands for: the nearest named one at or below it (the other engine's rule). */
export const roleOf = (power: number): MemberRole => (power >= 100 ? "admin" : power >= 50 ? "moderator" : "member");

const JOIN_RULES: Record<string, JoinRule> = { Public: "public", Invite: "invite", Knock: "knock", Restricted: "restricted", KnockRestricted: "restricted" };
const HISTORY: Record<string, HistoryVisibility> = { Invited: "invited", Joined: "joined", Shared: "shared", WorldReadable: "world_readable" };

const memberOf = (m: RawMember): RoomMember => ({
  userId: m.userId,
  name: m.displayName || m.userId,
  ...(m.avatarUrl && { avatar: m.avatarUrl }),
  role: roleOf(m.power),
  power: m.power,
  ...(m.membership === "Invite" && { invited: true }),
});

/**
 * The chat-info panel's details from what the SDK holds. One-to-one chats have nothing to administer, so nothing is
 * allowed there (as in the other engine). Joined people come first, then invited ones, each by name.
 */
export function toRoomDetails(raw: RawRoomDetails): RoomDetails {
  const members = raw.members
    .filter((m) => m.membership === "Join" || m.membership === "Invite")
    .map(memberOf)
    .sort((a, b) => Number(a.invited ?? false) - Number(b.invited ?? false) || a.name.localeCompare(b.name));
  const banned = raw.members
    .filter((m) => m.membership === "Ban")
    .map((m) => ({ userId: m.userId, name: m.displayName || m.userId, ...(m.reason && { reason: m.reason }) }));
  const mine = raw.members.find((m) => m.userId === raw.me);
  const manage = !raw.isDirect;
  const alias = raw.canonicalAlias;
  const aliases = [...(alias ? [alias] : []), ...raw.alternativeAliases.filter((a) => a !== alias)];
  const { levels, can } = raw;
  return {
    id: raw.id,
    name: raw.name,
    aliases,
    joinRule: JOIN_RULES[raw.joinRule ?? "Invite"] ?? "other",
    historyVisibility: HISTORY[raw.historyVisibility] ?? "shared",
    levels: {
      invite: levels.invite,
      kick: levels.kick,
      ban: levels.ban,
      redact: levels.redact,
      sendMessages: levels.eventsDefault,
      changeSettings: levels.stateDefault,
      changeLevels: levels.stateDefault,
    },
    banned,
    isDirect: raw.isDirect,
    isEncrypted: raw.isEncrypted,
    members,
    muted: raw.muted,
    me: raw.me,
    myRole: roleOf(mine?.power ?? 0),
    pinnedEventIds: raw.pinnedEventIds,
    can: {
      editInfo: manage && can.editName && can.editTopic,
      invite: manage && can.invite,
      kick: manage && can.kick,
      ban: manage && can.ban,
      changeRoles: manage && can.levels,
      pin: manage && can.pin,
      changeSettings: manage && can.joinRules && can.history,
    },
    ...(raw.topic && { topic: raw.topic }),
    ...(raw.avatarUrl && { avatar: raw.avatarUrl }),
    ...(alias && { alias }),
  };
}
