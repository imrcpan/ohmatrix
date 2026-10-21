import { EngineError } from "./errors.js";

/** One answer of a server to a registration request: the HTTP status and the JSON it sent back. */
export interface RegisterReply {
  status: number;
  body: Record<string, unknown>;
}

const DUMMY = "m.login.dummy";
const TOKEN = "m.login.registration_token";

type Flow = { stages: string[] };

/**
 * Which of the steps a server offers ("flows") can be done here: the dummy step, and the registration token step when a token was typed.
 * An e-mail address, a captcha or terms to accept are more than a form with a username and a password can answer. With a token typed, a flow
 * that uses it is the one taken; without one, a server that wants a token is told apart from one that wants something else.
 */
export function planRegistration(flows: readonly Flow[], hasToken: boolean): { stages: string[] } | { problem: "token_required" | "unsupported" } {
  const only = (f: Flow, allowed: string[]) => f.stages.every((s) => allowed.includes(s));
  const doable = flows.filter((f) => only(f, hasToken ? [DUMMY, TOKEN] : [DUMMY]));
  const pick = (hasToken ? doable.find((f) => f.stages.includes(TOKEN)) : undefined) ?? doable[0];
  if (pick) return { stages: pick.stages };
  if (!hasToken && flows.some((f) => only(f, [DUMMY, TOKEN]))) return { problem: "token_required" };
  return { problem: "unsupported" };
}

const failed = (res: RegisterReply): EngineError => {
  const code = String(res.body["errcode"] ?? "");
  const message = String(res.body["error"] ?? "could not register");
  return new EngineError(code === "M_USER_IN_USE" ? "conflict" : code === "M_FORBIDDEN" ? "forbidden" : "unknown", message);
};

/**
 * Create an account: ask once, and when the server answers with the steps it wants, do them one after the other (the dummy step, and the
 * registration token). `post` sends one request; the reply of the one that makes the account is returned. Throws an `EngineError`:
 * `unsupported` (more than can be answered), `token_required`, `token_invalid`, `conflict` (the name is taken), `forbidden` (closed).
 */
export async function registerSteps(
  post: (body: Record<string, unknown>) => Promise<RegisterReply>,
  base: Record<string, unknown>,
  token?: string,
): Promise<RegisterReply> {
  const hasToken = !!token?.trim();
  let res = await post(base);
  if (res.status !== 401 || !Array.isArray(res.body["flows"])) {
    if (!(res.status >= 200 && res.status < 300)) throw failed(res);
    return res;
  }
  const plan = planRegistration(res.body["flows"] as Flow[], hasToken);
  if ("problem" in plan) {
    throw plan.problem === "token_required"
      ? new EngineError("token_required", "This server needs a registration token to create an account.")
      : new EngineError("unsupported", "This server needs more than a username and password to register.");
  }
  const session = typeof res.body["session"] === "string" ? res.body["session"] : undefined;
  const done = new Set<string>(Array.isArray(res.body["completed"]) ? (res.body["completed"] as string[]) : []);
  for (const stage of plan.stages) {
    if (done.has(stage)) continue;
    const auth = stage === TOKEN ? { type: TOKEN, token: token!.trim() } : { type: stage };
    res = await post({ ...base, auth: { ...auth, ...(session && { session }) } });
    if (res.status >= 200 && res.status < 300) return res;
    const completed = Array.isArray(res.body["completed"]) ? (res.body["completed"] as string[]) : [];
    // The token step not being completed after it was tried: the token is not valid (a server may also refuse it outright).
    if (stage === TOKEN && !completed.includes(TOKEN))
      throw new EngineError("token_invalid", String(res.body["error"] ?? "The registration token is not valid."));
    if (res.status !== 401) throw failed(res);
    completed.forEach((s) => done.add(s));
  }
  throw failed(res);
}
