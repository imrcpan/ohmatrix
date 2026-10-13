import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomMember } from "@ohmatrix/core";
import type { AppController } from "@ohmatrix/state";

export interface MentionSuggestion {
  userId: string;
  name: string;
}

/** The `@token` immediately before the caret, when the caret is inside one. */
function tokenAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  // "@" starts a mention at the beginning of the text or after anything that is not an ASCII letter or digit
  // (space, punctuation, CJK...); "a@b" is an address, not a mention.
  if (at > 0 && /[A-Za-z0-9]/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (/[\s\n]/.test(query)) return null;
  return { start: at, query };
}

/**
 * Room member autocomplete for `@` in the composer: matches on display name or user id, most likely
 * first (prefix before substring), and remembers the picked user ids so they can be sent as
 * `m.mentions` — which is what actually notifies the person.
 */
export function useMentionSuggest(controller: AppController, roomId: string, draft: string, caret = draft.length) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const picked = useRef(new Set<string>());
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    setMembers([]);
    picked.current = new Set();
    return controller.subscribeRoomDetails(roomId, (d) => setMembers(d.members));
  }, [controller, roomId]);

  const token = tokenAt(draft, caret);
  // Escape only silences the token it was pressed on; leaving the "@" re-arms the menu.
  useEffect(() => {
    if (!token) setDismissed(null);
  }, [token === null]);
  const suggestions = useMemo<MentionSuggestion[]>(() => {
    if (!token) return [];
    if (dismissed !== null && dismissed === `${token.start}:${token.query}`) return [];
    const q = token.query.toLowerCase();
    const matches = members.filter((m) => !q || m.name.toLowerCase().includes(q) || m.userId.toLowerCase().includes(q));
    const rank = (m: RoomMember) => (m.name.toLowerCase().startsWith(q) ? 0 : 1);
    return matches
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .slice(0, 6)
      .map((m) => ({ userId: m.userId, name: m.name }));
  }, [token, members, dismissed]);

  /** Replaces the `@token` with the picked display name and records the user id for the send. */
  const apply = (s: MentionSuggestion, current: string, at: number): string => {
    const t = tokenAt(current, at);
    if (!t) return current;
    picked.current.add(s.userId);
    return `${current.slice(0, t.start)}@${s.name} ${current.slice(at)}`;
  };

  /** The user ids whose `@name` still appears in the text, for the `m.mentions` block. */
  const resolve = (text: string): string[] => {
    const out = new Set<string>();
    for (const id of picked.current) {
      const m = members.find((x) => x.userId === id);
      if (m && text.includes(`@${m.name}`)) out.add(id);
    }
    // A hand-typed full user id counts as a mention too.
    for (const m of members) if (text.includes(`@${m.userId.replace(/^@/, "")}`) || text.includes(m.userId)) out.add(m.userId);
    return [...out];
  };

  const reset = () => {
    picked.current = new Set();
    setDismissed(null);
  };
  const dismiss = () => setDismissed(token ? `${token.start}:${token.query}` : null);

  return { suggestions, apply, resolve, reset, dismiss, token: token ? { start: token.start, query: token.query } : null };
}
