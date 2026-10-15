import { expect, test } from "vitest";
import { membershipText, personName, stateText } from "./serviceText.js";

test("a person is named by their display name, or by the part of their id before the colon", () => {
  expect(personName("Alice", "@alice:example.org")).toBe("Alice");
  expect(personName(undefined, "@alice:example.org")).toBe("alice");
  expect(personName(null, "@bob:localhost")).toBe("bob");
  expect(personName("@alice:example.org", "@alice:example.org")).toBe("alice"); // a display name that is just the id
});

test("membership changes read as the other engine reads them", () => {
  expect(membershipText("Joined", "bob", "bob")).toBe("bob joined");
  expect(membershipText("InvitationAccepted", "bob", "bob")).toBe("bob joined");
  expect(membershipText("Left", "bob", "bob")).toBe("bob left");
  expect(membershipText("Kicked", "bob", "alice")).toBe("bob was removed");
  expect(membershipText("KickedAndBanned", "bob", "alice")).toBe("bob was removed");
  expect(membershipText("Invited", "bob", "alice")).toBe("alice invited bob");
});

test("what the chat does not show gives no line", () => {
  for (const c of ["None", "Banned", "Unbanned", "Knocked", "InvitationRejected", "NotImplemented"] as const)
    expect(membershipText(c, "bob", "alice")).toBeNull();
  expect(membershipText(undefined, "bob", "alice")).toBeNull();
  expect(stateText({ kind: "RoomPowerLevels" }, "alice")).toBeNull();
  expect(stateText({ kind: "RoomAvatar" }, "alice")).toBeNull();
});

test("state changes: the room is created, named, renamed, its name removed, its topic changed", () => {
  expect(stateText({ kind: "RoomCreate" }, "alice")).toBe("alice created the room");
  expect(stateText({ kind: "RoomName", value: "Team" }, "alice")).toBe("alice changed the room name to “Team”");
  expect(stateText({ kind: "RoomName", value: "" }, "alice")).toBe("alice removed the room name");
  expect(stateText({ kind: "RoomName" }, "alice")).toBe("alice removed the room name");
  expect(stateText({ kind: "RoomTopic", value: "x" }, "alice")).toBe("alice changed the topic");
});
