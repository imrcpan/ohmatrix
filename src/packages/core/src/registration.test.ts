import { expect, test } from "vitest";
import { EngineError } from "./errors.js";
import { planRegistration, registerSteps, type RegisterReply } from "./registration.js";

const flowsOf = (...stages: string[][]) => ({ flows: stages.map((s) => ({ stages: s })), session: "S" });
const ok = { status: 200, body: { user_id: "@a:s", device_id: "D", access_token: "T" } };

/** A server: answers each request from the list, and keeps what it was sent. */
function server(replies: RegisterReply[]) {
  const sent: Record<string, unknown>[] = [];
  return { sent, post: async (body: Record<string, unknown>) => (sent.push(body), replies[sent.length - 1]!) };
}

test("what can be done: the dummy step, the token step with a token, and nothing else", () => {
  expect(planRegistration([{ stages: ["m.login.dummy"] }], false)).toEqual({ stages: ["m.login.dummy"] });
  expect(planRegistration([{ stages: ["m.login.registration_token", "m.login.dummy"] }], true)).toEqual({
    stages: ["m.login.registration_token", "m.login.dummy"],
  });
  expect(planRegistration([{ stages: ["m.login.registration_token", "m.login.dummy"] }], false)).toEqual({ problem: "token_required" });
  expect(planRegistration([{ stages: ["m.login.email.identity"] }], true)).toEqual({ problem: "unsupported" });
  // With a token the flow that uses it is taken, when the server offers both.
  expect(planRegistration([{ stages: ["m.login.dummy"] }, { stages: ["m.login.registration_token", "m.login.dummy"] }], true)).toEqual({
    stages: ["m.login.registration_token", "m.login.dummy"],
  });
});

test("a server that wants a token gets it, then the dummy step", async () => {
  const s = server([
    { status: 401, body: flowsOf(["m.login.registration_token", "m.login.dummy"]) },
    { status: 401, body: { ...flowsOf(["m.login.registration_token", "m.login.dummy"]), completed: ["m.login.registration_token"] } },
    ok,
  ]);
  await expect(registerSteps(s.post, { username: "a" }, " tok ")).resolves.toBe(ok);
  expect(s.sent[1]).toMatchObject({ auth: { type: "m.login.registration_token", token: "tok", session: "S" } });
  expect(s.sent[2]).toMatchObject({ auth: { type: "m.login.dummy", session: "S" } });
});

test("a server that wants nothing but the dummy step needs no token", async () => {
  const s = server([{ status: 401, body: flowsOf(["m.login.dummy"]) }, ok]);
  await expect(registerSteps(s.post, { username: "a" })).resolves.toBe(ok);
  expect(s.sent).toHaveLength(2);
});

test("a token is asked for when there is none, and refused when it is not valid", async () => {
  const flows = flowsOf(["m.login.registration_token", "m.login.dummy"]);
  await expect(registerSteps(server([{ status: 401, body: flows }]).post, {})).rejects.toMatchObject({ code: "token_required" });
  const bad = server([
    { status: 401, body: flows },
    { status: 401, body: { ...flows, errcode: "M_UNAUTHORIZED", error: "Invalid registration token" } },
  ]);
  await expect(registerSteps(bad.post, {}, "nope")).rejects.toMatchObject({ code: "token_invalid", message: "Invalid registration token" });
});

test("other refusals keep their meaning", async () => {
  await expect(registerSteps(server([{ status: 400, body: { errcode: "M_USER_IN_USE", error: "taken" } }]).post, {})).rejects.toMatchObject({
    code: "conflict",
  });
  await expect(registerSteps(server([{ status: 403, body: { errcode: "M_FORBIDDEN", error: "closed" } }]).post, {})).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(registerSteps(server([{ status: 401, body: flowsOf(["m.login.terms"]) }]).post, {}, "x")).rejects.toBeInstanceOf(EngineError);
});
