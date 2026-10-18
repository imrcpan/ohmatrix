import { expect, test } from "vitest";
import type { RoomMember } from "@ohmatrix/core";
import { compareMembers, sortMembers, topMembers } from "./memberOrder.js";

const member = (name: string, power: number, invited = false): RoomMember => ({
  userId: `@${name.replace(/\s/g, "_")}:s`,
  name,
  role: power >= 100 ? "admin" : power >= 50 ? "moderator" : "member",
  power,
  ...(invited && { invited: true }),
});

test("most powerful first: the room's creator, admins, moderators, then members; equal power by name; the merely invited last", () => {
  const people = [
    member("Zed member", 0),
    member("Ann member", 0),
    member("Mod Bea", 50),
    member("Invited Cy", 100, true),
    member("Admin Dee", 100),
    member("Creator Eve", Infinity),
    member("Level 25 Fay", 25),
    member("Mod Abe", 50),
  ];
  expect(sortMembers(people).map((m) => m.name)).toEqual([
    "Creator Eve",
    "Admin Dee",
    "Mod Abe",
    "Mod Bea",
    "Level 25 Fay",
    "Ann member",
    "Zed member",
    "Invited Cy",
  ]);
  expect(compareMembers(member("a", Infinity), member("b", 100))).toBeLessThan(0); // a subtraction would give NaN
  expect(compareMembers(member("a", Infinity), member("b", Infinity))).toBeLessThan(0); // then by name
});

test("names with numbers sort the way people read them", () => {
  const names = ["Member 10", "Member 2", "Member 1"].map((n) => member(n, 0));
  expect(sortMembers(names).map((m) => m.name)).toEqual(["Member 1", "Member 2", "Member 10"]);
});

test("the first few are the first of the full order, and the list given is left as it was", () => {
  const people = Array.from({ length: 200 }, (_, i) => member(`P ${String((i * 37) % 200).padStart(3, "0")}`, (i % 7) * 25));
  const copy = [...people];
  const full = sortMembers(people);
  expect(topMembers(people, 10)).toEqual(full.slice(0, 10));
  expect(topMembers(people, 3)).toEqual(full.slice(0, 3));
  expect(people).toEqual(copy);
  expect(topMembers(people.slice(0, 4), 10)).toHaveLength(4);
  expect(topMembers([], 10)).toEqual([]);
});

test("a room of 5,000 people (and 10,000): the first ten in one pass, the whole order sorted once, both quickly", () => {
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      member(`Member ${String(i).padStart(5, "0")}`, i === 0 ? Infinity : i < 6 ? 100 : i < 26 ? 50 : 0, i % 97 === 0 && i > 0),
    );
  for (const n of [5000, 10000]) {
    const people = make(n);
    const t0 = Date.now();
    const top = topMembers(people, 10);
    const t1 = Date.now();
    const all = sortMembers(people);
    const t2 = Date.now();
    expect(top.map((m) => m.name).slice(0, 3)).toEqual(["Member 00000", "Member 00001", "Member 00002"]);
    expect(top).toEqual(all.slice(0, 10));
    expect(all).toHaveLength(n);
    expect(all.at(-1)!.invited).toBe(true);
    // Generous bounds (a slow CI machine): the point is that these are milliseconds, not seconds.
    expect(t1 - t0, `top ten of ${n}`).toBeLessThan(50);
    expect(t2 - t1, `full sort of ${n}`).toBeLessThan(400);
  }
});
