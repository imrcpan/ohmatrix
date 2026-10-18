/**
 * The line a chat shows for an event that is not a message ("alice joined", "alice changed the room name to ..."), from
 * the structured form matrix-rust-sdk gives these in. The words are those of the other engine (engine-js), so the same
 * room reads the same on every platform. `null` is an event the chat does not show.
 */

/** The values of the SDK's `MembershipChange`, by name. The bindings number them; we only need to tell them apart. */
export type MembershipChange =
  | "None"
  | "Error"
  | "Joined"
  | "Left"
  | "Banned"
  | "Unbanned"
  | "Kicked"
  | "Invited"
  | "KickedAndBanned"
  | "InvitationAccepted"
  | "InvitationRejected"
  | "InvitationRevoked"
  | "Knocked"
  | "KnockAccepted"
  | "KnockRetracted"
  | "KnockDenied"
  | "NotImplemented";

/** The part of `OtherState` a line is made from: which kind of state it is, and the new value where there is one. */
export interface StateChange {
  kind: string;
  /** The new room name, topic, ... for the kinds that have one. */
  value?: string | undefined;
}

const localpart = (id: string) => id.replace(/^@/, "").replace(/:.*$/, "");

/** A person as the chat names them: their display name, or else the part of their id before the colon. */
export function personName(displayName: string | null | undefined, userId: string): string {
  return displayName && displayName !== userId ? displayName : localpart(userId);
}

/** The line for someone's membership changing. `who` is whose membership it is, `by` who did it. */
export function membershipText(change: MembershipChange | undefined, who: string, by: string): string | null {
  switch (change) {
    case "Joined":
    case "InvitationAccepted":
      return `${who} joined`;
    case "Left":
      return `${who} left`;
    case "Kicked":
    case "KickedAndBanned":
      return `${who} was removed`;
    case "Invited":
      return `${by} invited ${who}`;
    default:
      // Banning, knocking and the rest are not shown (as in the other engine).
      return null;
  }
}

/** The line for a change of the room's state, by `by`. */
export function stateText(change: StateChange, by: string): string | null {
  switch (change.kind) {
    case "RoomCreate":
      return `${by} created the room`;
    case "RoomName":
      return change.value ? `${by} changed the room name to “${change.value}”` : `${by} removed the room name`;
    case "RoomTopic":
      return `${by} changed the description`;
    default:
      return null;
  }
}
